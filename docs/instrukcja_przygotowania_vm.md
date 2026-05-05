# Instrukcja Przygotowania Maszyny Wirtualnej

Przewodnik krok po kroku: od świeżej instalacji Oracle Linux 9 do stanu gotowego na wdrożenie aplikacji MPWiK.

Po wykonaniu tej instrukcji przejdź do `deployment_oracle_linux_9.md`, który opisuje samo wdrożenie aplikacji.

---

## Przed startem — ustal swoje wartości

Przed wykonaniem jakiejkolwiek komendy ustal poniższe wartości. Zastąp każde `<PLACEHOLDER>` swoją wartością.

| Placeholder | Opis | Przykład |
|-------------|------|---------|
| `<IP_MASZYNY>` | Adres IP maszyny wirtualnej | `192.168.0.17` |
| `<UŻYTKOWNIK>` | Nazwa konta aplikacji (nie root) | `admin`, `mpwik`, dowolna |
| `<KATALOG_PROJEKTU>` | Pełna ścieżka do projektu | `/opt/mpwik/event-hub-lublin` |

---

## 1. Wymagania maszyny wirtualnej

| Parametr | Minimum | Zalecane |
|----------|---------|----------|
| OS | Oracle Linux 9.x (minimal) | Oracle Linux 9.x |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Dysk systemowy | 40 GB | 60 GB |
| Sieć | 1 interfejs (połączenie z siecią lokalną) | — |

> Dysk: ~20 GB zajmą dane PostGIS, ~5 GB obrazy Docker. Pozostałe 15+ GB to system i logi.

---

## 2. Konfiguracja wstępna systemu

### 2.1 Zaloguj się jako root

```bash
ssh root@<IP_MASZYNY>
```

### 2.2 Ustaw hostname

```bash
hostnamectl set-hostname mpwik-prod
```

Zweryfikuj:

```bash
hostnamectl
# Wynik: Static hostname: mpwik-prod
```

### 2.3 Ustaw strefę czasową

```bash
timedatectl set-timezone Europe/Warsaw
timedatectl
# Wynik: Time zone: Europe/Warsaw (CET, +0100) / (CEST, +0200)
```

### 2.4 Aktualizacja systemu

```bash
dnf update -y
```

Czas: 2–10 minut w zależności od liczby aktualizacji. Po zakończeniu sprawdź czy wymagany jest restart:

```bash
needs-restarting -r
# Jeśli wynik: "Reboot is required" — wykonaj:
reboot
# Po ponownym zalogowaniu:
ssh root@<IP_MASZYNY>
```

### 2.5 Zainstaluj podstawowe narzędzia

```bash
dnf install -y \
  git \
  curl \
  wget \
  vim \
  nano \
  htop \
  net-tools \
  bind-utils \
  unzip \
  tar \
  openssl
```

---

## 3. Konto użytkownika aplikacji

Aplikacja działa na dedykowanym koncie — nie uruchamiamy niczego jako root. Wybierz nazwę użytkownika (`<UŻYTKOWNIK>`) i użyj jej konsekwentnie w całej instrukcji.

### 3.1 Utwórz użytkownika

```bash
useradd -m -s /bin/bash <UŻYTKOWNIK>
passwd <UŻYTKOWNIK>
# Ustaw hasło — zapamiętaj je lub zapisz w bezpiecznym miejscu
```

### 3.2 Nadaj uprawnienia sudo

```bash
usermod -aG wheel <UŻYTKOWNIK>
```

Zweryfikuj:

```bash
groups <UŻYTKOWNIK>
# Wynik powinien zawierać: <UŻYTKOWNIK> wheel
```

### 3.3 Skonfiguruj SSH dla nowego użytkownika

Jeśli logujesz się kluczem SSH (zalecane — silniejsze niż hasło):

```bash
# Na lokalnym komputerze wygeneruj parę kluczy (jeśli jeszcze nie masz)
ssh-keygen -t ed25519 -C "mpwik-deploy"

# Skopiuj klucz publiczny na serwer
ssh-copy-id <UŻYTKOWNIK>@<IP_MASZYNY>
```

Lub ręcznie:

```bash
# Na serwerze (jako root)
mkdir -p /home/<UŻYTKOWNIK>/.ssh
chmod 700 /home/<UŻYTKOWNIK>/.ssh
# Wklej zawartość ~/.ssh/id_ed25519.pub (lub id_rsa.pub) z lokalnego komputera:
nano /home/<UŻYTKOWNIK>/.ssh/authorized_keys
chmod 600 /home/<UŻYTKOWNIK>/.ssh/authorized_keys
chown -R <UŻYTKOWNIK>:<UŻYTKOWNIK> /home/<UŻYTKOWNIK>/.ssh
```

Zweryfikuj logowanie:

```bash
# Z lokalnego komputera (w nowym terminalu)
ssh <UŻYTKOWNIK>@<IP_MASZYNY>
# Powinno zalogować bez hasła (jeśli skonfigurowano klucze)
```

---

## 4. Hardening SSH (zalecane)

```bash
# Jako root
nano /etc/ssh/sshd_config
```

Zmień lub dodaj poniższe linie:

```
# Wyłącz logowanie jako root przez SSH
PermitRootLogin no

# Wyłącz uwierzytelnianie hasłem (tylko jeśli skonfigurowałeś klucze w kroku 3.3)
PasswordAuthentication no

# Ogranicz do konkretnych użytkowników (opcjonalne)
AllowUsers <UŻYTKOWNIK>

# Zmień domyślny port (opcjonalne — utrudnia skanowanie)
# Port 2222
```

Zastosuj zmiany:

```bash
systemctl restart sshd

# Zweryfikuj z nowego terminala (NIE zamykaj bieżącej sesji root podczas weryfikacji)
ssh <UŻYTKOWNIK>@<IP_MASZYNY>
```

> **Uwaga:** Jeśli zmieniasz port SSH, pamiętaj o otwarciu nowego portu w firewallu (krok 6) PRZED restartem sshd.

---

## 5. Instalacja Docker CE

Oracle Linux 9 nie zawiera Docker CE w domyślnych repozytoriach.

### 5.1 Dodaj repozytorium Docker

```bash
# Jako <UŻYTKOWNIK> (z sudo) lub root
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
```

### 5.2 Zainstaluj Docker CE i Docker Compose plugin

```bash
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### 5.3 Uruchom i włącz autostart Docker

```bash
sudo systemctl enable --now docker
```

Zweryfikuj:

```bash
sudo systemctl status docker
# Wynik: active (running)
```

### 5.4 Dodaj użytkownika do grupy docker

```bash
sudo usermod -aG docker $USER
newgrp docker
```

> Po `newgrp docker` sesja SSH przełącza się w kontekst nowej grupy. Jeśli coś nie działa, wyloguj się i zaloguj ponownie — wtedy zmiana grupy jest w pełni aktywna.

Zweryfikuj bez sudo:

```bash
docker --version
# Docker version 26.x.x, build ...

docker compose version
# Docker Compose version v2.x.x

docker run --rm hello-world
# Oczekiwany wynik: "Hello from Docker!"
```

---

## 6. Konfiguracja firewalld

### 6.1 Sprawdź status firewalla

```bash
sudo systemctl status firewalld
# Powinno być: active (running)
```

Jeśli nie działa — uruchom i włącz autostart:

```bash
sudo systemctl enable --now firewalld
```

### 6.2 Otwórz wymagane porty

```bash
# Port 80 — frontend (Nginx) dostępny z sieci lokalnej
sudo firewall-cmd --zone=public --add-port=80/tcp --permanent

# Port 443 — HTTPS (jeśli planujesz SSL/TLS w przyszłości)
sudo firewall-cmd --zone=public --add-port=443/tcp --permanent

# Zastosuj zmiany
sudo firewall-cmd --reload
```

> **NIE otwieraj** portów `8000` (backend), `5432`/`5433` (baza danych). Są dostępne wyłącznie wewnątrz sieci Docker lub przez tunel SSH.

Zweryfikuj:

```bash
sudo firewall-cmd --list-all
# Sekcja "ports:" powinna zawierać: 80/tcp 443/tcp
```

---

## 7. Konfiguracja SELinux

Oracle Linux 9 uruchamia SELinux w trybie `Enforcing` domyślnie — **nie wyłączaj go**.

### 7.1 Sprawdź tryb SELinux

```bash
getenforce
# Oczekiwany wynik: Enforcing
```

### 7.2 Polityki Docker + SELinux

Zarządzane wolumeny Docker (np. `db_data`) działają poprawnie bez dodatkowej konfiguracji.

Jeśli używasz bind-mountów katalogów hosta (pliki GIS w `backend/data/`), dodaj sufiks `:z` w `docker-compose.yml`:

```yaml
volumes:
  - ./backend/data:/code/data:z
```

- `:z` — kontekst współdzielony między kontenerami (używaj przy plikach danych)
- `:Z` — kontekst wyłączny dla jednego kontenera

### 7.3 Logowanie błędów SELinux (troubleshooting)

Jeśli aplikacja nie działa z powodu SELinux:

```bash
# Zainstaluj narzędzia diagnostyczne
sudo dnf install -y setroubleshoot-server

# Sprawdź ostatnie odrzucenia
sudo ausearch -m AVC -ts recent | tail -50

# Wygeneruj czytelny raport
sudo sealert -a /var/log/audit/audit.log | head -100
```

---

## 8. Przygotowanie katalogu aplikacji

Utwórz katalog docelowy projektu (`<KATALOG_PROJEKTU>`) i nadaj własność swojemu użytkownikowi:

```bash
sudo mkdir -p <KATALOG_PROJEKTU>
sudo chown <UŻYTKOWNIK>:<UŻYTKOWNIK> <KATALOG_PROJEKTU>

# Zweryfikuj
ls -la $(dirname <KATALOG_PROJEKTU>)
```

---

## 9. Konfiguracja Git

```bash
git config --global user.name "MPWiK Deploy"
git config --global user.email "projekt.mpwik.pollub@gmail.com"
git config --global init.defaultBranch main
```

Zweryfikuj:

```bash
git --version
git config --list
```

---

## 10. Optymalizacje systemu (zalecane dla produkcji)

### 10.1 Zwiększ limity otwartych plików

Docker i PostgreSQL mogą potrzebować wielu deskryptorów plików.

```bash
sudo nano /etc/security/limits.conf
```

Dodaj na końcu (zastąp `<UŻYTKOWNIK>` swoją nazwą):

```
<UŻYTKOWNIK> soft nofile 65535
<UŻYTKOWNIK> hard nofile 65535
* soft nofile 65535
* hard nofile 65535
```

### 10.2 Parametry jądra dla PostgreSQL

```bash
sudo nano /etc/sysctl.d/99-mpwik.conf
```

Wklej:

```
# Zwiększ rozmiar bufora sieciowego
net.core.somaxconn = 1024

# Dla PostgreSQL w Dockerze
vm.overcommit_memory = 1

# Zmniejsz agresywność swapowania (0 = swap tylko w ostateczności)
vm.swappiness = 10
```

Zastosuj:

```bash
sudo sysctl --system
```

### 10.3 Logrotate dla kontenerów Docker (opcjonalne)

```bash
sudo nano /etc/docker/daemon.json
```

Wklej:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Zastosuj:

```bash
sudo systemctl restart docker
```

---

## 11. Weryfikacja końcowa — lista kontrolna

Wykonaj każde polecenie i upewnij się, że wynik odpowiada oczekiwanemu.

```bash
# 1. Hostname
hostname
# → mpwik-prod

# 2. Strefa czasowa
timedatectl | grep "Time zone"
# → Time zone: Europe/Warsaw

# 3. Docker działa
docker --version && docker compose version
# → Docker version 26.x.x / Docker Compose version v2.x.x

# 4. Docker bez sudo
docker ps
# → CONTAINER ID   IMAGE   COMMAND   ...  (pusta lista, bez błędu permission denied)

# 5. Firewall — port 80 otwarty
sudo firewall-cmd --list-ports
# → 80/tcp 443/tcp

# 6. SELinux aktywny
getenforce
# → Enforcing

# 7. Katalog aplikacji istnieje
ls -la <KATALOG_PROJEKTU>
# → drwxr-xr-x <UŻYTKOWNIK> <UŻYTKOWNIK>

# 8. Git zainstalowany
git --version
# → git version 2.x.x

# 9. Docker test
docker run --rm hello-world | grep "Hello from Docker"
# → Hello from Docker!
```

Jeśli wszystkie punkty przeszły — maszyna jest gotowa. Przejdź do `deployment_oracle_linux_9.md`.

---

## 12. Najczęstsze problemy

### `Got permission denied while trying to connect to the Docker daemon`

Użytkownik nie jest w grupie `docker`. Wykonaj:

```bash
sudo usermod -aG docker $USER
newgrp docker
# lub wyloguj się i zaloguj ponownie
```

### `Unable to lock the administration directory` podczas dnf

Inny proces (np. automatyczna aktualizacja) zajął blokadę dnf. Poczekaj chwilę lub:

```bash
sudo rm /var/lib/rpm/.rpm.lock
sudo rm /var/cache/dnf/metadata_lock.pid
```

### `firewall-cmd: command not found`

firewalld nie jest zainstalowany:

```bash
sudo dnf install -y firewalld
sudo systemctl enable --now firewalld
```

### SELinux blokuje Docker — `permission denied` w logach kontenera

Dodaj sufiks `:z` do bind-mountów (patrz krok 7.2) lub tymczasowo sprawdź czy SELinux jest przyczyną:

```bash
sudo setenforce 0   # tryb permissive — tylko do diagnozy, NIE zostawiaj tak na produkcji
docker compose ... up -d
# jeśli teraz działa → SELinux jest przyczyną → napraw etykiety zamiast wyłączać SELinux
sudo setenforce 1   # przywróć Enforcing
```

### SSH — `Connection refused` po zmianie portu

Zmieniłeś port SSH ale nie otworzyłeś go w firewallu przed restartem sshd. Potrzebujesz dostępu przez konsolę VM (hypervisor) aby naprawić:

```bash
# Przez konsolę (nie SSH):
sudo firewall-cmd --zone=public --add-port=2222/tcp --permanent
sudo firewall-cmd --reload
```
