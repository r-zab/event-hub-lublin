# Specyfikacja techniczna - Event Hub Lublin

## 1. Endpointy API

### Auth
POST /api/v1/auth/login    -> { "access_token", "token_type" }
POST /api/v1/auth/refresh  -> { "access_token" }

### Events
GET    /api/v1/events         -> lista aktywnych (public, paginacja)
GET    /api/v1/events/{id}    -> szczegoly (public)
POST   /api/v1/events         -> tworzenie (JWT lub API key)
PUT    /api/v1/events/{id}    -> aktualizacja (JWT)
DELETE /api/v1/events/{id}    -> usuniecie (JWT admin)
GET    /api/v1/events/feed    -> plain text dla IVR 994 (public)

### Streets
GET /api/v1/streets?q=pilsud&limit=10  -> autocomplete ulic (public)

### Subscribers
POST   /api/v1/subscribers/{unsubscribe_token}  -> rejestracja (public)
DELETE /api/v1/subscribers/{unsubscribe_token}  -> wyrejestrowanie (public)
GET    /api/v1/subscribers/{unsubscribe_token}  -> info przed usunieciem (public)

### Admin
GET /api/v1/admin/subscribers   -> lista subskrybentow (JWT admin)
GET /api/v1/admin/notifications -> log powiadomien (JWT admin)
GET /api/v1/admin/stats         -> statystyki (JWT)

## 2. Schemat bazy danych

### users
- id SERIAL PK
- username VARCHAR(50) UNIQUE NOT NULL
- password_hash VARCHAR(255) NOT NULL
- full_name VARCHAR(100)
- role VARCHAR(20) DEFAULT 'dispatcher'  -- dispatcher / admin
- is_active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()

### streets
- id SERIAL PK
- teryt_sym_ul VARCHAR(10) UNIQUE
- name VARCHAR(200) NOT NULL             -- "Pilsudskiego"
- full_name VARCHAR(250) NOT NULL        -- "Aleja Marszalka Jozefa Pilsudskiego"
- street_type VARCHAR(20)                -- "al.", "ul.", "pl."
- city VARCHAR(50) DEFAULT 'Lublin'
- geojson JSONB

### events
- id SERIAL PK
- event_type VARCHAR(30) NOT NULL        -- 'awaria'/'planowane_wylaczenie'/'remont'
- source VARCHAR(50) DEFAULT 'mpwik'
- street_id INTEGER FK -> streets(id)
- street_name VARCHAR(200) NOT NULL
- house_number_from VARCHAR(10)
- house_number_to VARCHAR(10)
- description TEXT
- status VARCHAR(30) DEFAULT 'zgloszona' -- 'zgloszona'/'w_naprawie'/'usunieta'
- estimated_end TIMESTAMP
- geojson_segment JSONB
- created_by INTEGER FK -> users(id)
- created_at TIMESTAMP DEFAULT NOW()
- updated_at TIMESTAMP DEFAULT NOW()

### event_history
- id SERIAL PK
- event_id INTEGER FK -> events(id) ON DELETE CASCADE
- old_status VARCHAR(30)
- new_status VARCHAR(30)
- changed_by INTEGER FK -> users(id)
- changed_at TIMESTAMP DEFAULT NOW()
- note TEXT

### subscribers
- id SERIAL PK
- phone VARCHAR(20) NOT NULL
- email VARCHAR(100) NOT NULL
- rodo_consent BOOLEAN NOT NULL DEFAULT FALSE
- night_sms_consent BOOLEAN DEFAULT FALSE
- unsubscribe_token VARCHAR(64) UNIQUE NOT NULL
- created_at TIMESTAMP DEFAULT NOW()

### subscriber_addresses
- id SERIAL PK
- subscriber_id INTEGER FK -> subscribers(id) ON DELETE CASCADE
- street_id INTEGER FK -> streets(id)
- street_name VARCHAR(200) NOT NULL
- house_number VARCHAR(10) NOT NULL
- flat_number VARCHAR(10)
- created_at TIMESTAMP DEFAULT NOW()

### notification_log
- id SERIAL PK
- event_id INTEGER FK -> events(id)
- subscriber_id INTEGER FK -> subscribers(id) ON DELETE SET NULL
- channel VARCHAR(10) NOT NULL           -- 'sms' / 'email'
- recipient VARCHAR(100) NOT NULL
- message_text TEXT
- status VARCHAR(20) DEFAULT 'sent'      -- 'sent'/'failed'/'queued'
- sent_at TIMESTAMP DEFAULT NOW()
- error_message TEXT

### api_keys
- id SERIAL PK
- operator_name VARCHAR(50) UNIQUE NOT NULL
- api_key_hash VARCHAR(255) NOT NULL
- is_active BOOLEAN DEFAULT TRUE
- created_at TIMESTAMP DEFAULT NOW()

## 3. Indeksy
- idx_events_status ON events(status)
- idx_events_source ON events(source)
- idx_events_street ON events(street_id)
- idx_events_created ON events(created_at DESC)
- idx_subscriber_addresses_street ON subscriber_addresses(street_id)
- idx_streets_name ON streets(name)
- idx_streets_fullname_trgm ON streets USING gin(full_name gin_trgm_ops)
  (wymaga: CREATE EXTENSION pg_trgm)

## 4. Algorytm matchowania

INPUT: event (street_id, house_number_from, house_number_to)

SELECT subscribers WHERE:
  subscriber_addresses.street_id = event.street_id
  subscriber_addresses.house_number BETWEEN from AND to
  subscriber.rodo_consent = TRUE

Dla kazdego subscriber:
  a. Wyslij EMAIL (zawsze)
  b. Jesli 22:00-06:00 AND night_sms_consent = FALSE -> kolejkuj na 06:00
  c. W innym przypadku -> wyslij SMS natychmiast
  d. Zapisz do notification_log

## 5. SMS Gateway - interfejs

```python
class SMSGateway(ABC):
    @abstractmethod
    async def send(self, phone: str, message: str) -> bool:
        pass

class MockSMSGateway(SMSGateway):
    async def send(self, phone: str, message: str) -> bool:
        logger.info(f"[MOCK SMS] -> {phone}: {message}")
        return True
```

## 6. Kolory statusow na mapie
- zgloszona:           #EF4444 (czerwony)
- w_naprawie:          #F59E0B (pomaranczowy)
- usunieta:            #10B981 (zielony)
- planowane_wylaczenie:#3B82F6 (niebieski)
- remont:              #8B5CF6 (fioletowy)
