# Kontekst projektu - Event Hub Lublin

## 1. Czym jest ten projekt

System powiadamiania mieszkancow Lublina o awariach i przerwach w dostawie wody,
tworzony we wspolpracy z MPWiK Lublin.

Projekt realizowany na Festiwal Biznesu - Politechnika Lubelska.
Zespol: Rafal Zaborek, Jakub Zatorski, Mateusz Duda
Kierunek: Sztuczna Inteligencja w Biznesie

## 2. Problem biznesowy

### AS-IS:
1. Mieszkaniec odkraca kran - brak wody
2. Dzwoni na numer alarmowy 994
3. Dyspozytor zbiera dane, brygada weryfikuje awarie
4. Informacja pojawia sie na stronie mpwik.lublin.pl

Dane: ~271 awarii rocznie w Lublinie

### TO-BE:
1. Dyspozytor potwierdza awarie, wpisuje do panelu (ulica + numery)
2. System AUTOMATYCZNIE wysyla SMS i email do zarejestrowanych mieszkancow
3. Mapa aktualizuje sie w czasie rzeczywistym

## 3. Kluczowe osoby po stronie MPWiK
- **Piotr Jeczen** - Szef dzialu IT, glowny kontakt techniczny
- **Dorota** - Dyrektor ds. operacyjnych/komunikacji
- **Marcin** - Dyrektor techniczny / dyzurny

## 4. Kluczowe ustalenia

### Potwierdzone:
- SMS + email jako kanaly powiadomien
- Panel administracyjny dla dyspozytora = core systemu
- Mapa z odcinkami ulic (linie, NIE okregi)
- MPWiK ma wlasna bramke SMS - zero kosztow
- MPWiK planuje realne wykorzystanie

### Odrzucone:
- Promien/okrag na mapie -> ulica + numery posesji od-do
- Pobieranie danych z GIS MPWiK -> autorski system, bez API
- AI/ML predykcja -> "trzeba przyhamowac", AI Act
- Dane osobowe klientow z umow -> absolutne tabu

### Nowe wymagania:
1. Adresy slownikowane z TERYT (autocomplete)
2. Wiele adresow na jednego subskrybenta
3. Opcja SMS nocnych (osobna zgoda, domyslnie OFF)
4. Fizyczne usuniecie danych przy wyrejestrowaniu (RODO)
5. WCAG dostepnosc
6. Oracle Linux jako docelowy OS
7. REST API z dokumentacja - przygotowanie pod miejski hub

## 5. Wizja: Miejski Hub Powiadamiania

MPWiK = pierwszy "dostawca zdarzen" (source: "mpwik").
Architektura gotowa na LPEC, zarzad drog, centrum zarzadzania kryzysowego.
Mieszkaniec rejestruje sie RAZ.

## 6. Ograniczenia techniczne
- Brak dostepu do GIS MPWiK
- Bramka SMS - dokumentacja API jeszcze niedostarczona (mockujemy)
- Strona mpwik.lublin.pl zarzadzana przez zewnetrznego hostingowca
