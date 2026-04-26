import {
  Droplets,
  MapPin,
  Bell,
  ShieldCheck,
  Moon,
  UserMinus,
  Info,
  Zap,
  Code2,
  GraduationCap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const About = () => (
  <TooltipProvider>
    <div className="container max-w-3xl py-10 space-y-10">

      {/* Nagłówek */}
      <div className="text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Droplets className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">
          System Powiadomień MPWiK Lublin
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm leading-relaxed">
          Oficjalna platforma informacyjna Miejskiego Przedsiębiorstwa Wodociągów
          i Kanalizacji w Lublinie — dostarcza mieszkańcom powiadomienia o awariach
          i planowanych pracach na sieci wodociągowej w czasie rzeczywistym.
        </p>
      </div>

      {/* 1. Misja — Szybkie powiadamianie */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          Misja
        </h2>
        <Card>
          <CardContent className="pt-6 space-y-4 text-sm text-muted-foreground">
            <p className="text-foreground font-medium">
              Szybkie, precyzyjne powiadamianie — tylko do tych, których to dotyczy.
            </p>
            <p>
              System eliminuje problem masowych i niecelnych komunikatów. Powiadomienie
              trafia wyłącznie do mieszkańców, których zarejestrowany adres znajduje się
              w dokładnym zakresie numerów posesji objętych zdarzeniem — nie do całej ulicy,
              nie do całego osiedla.
            </p>
            <p>
              Każde zdarzenie przypisane jest do precyzyjnego odcinka sieci wodociągowej.
              Dyspozytor wybiera budynki na interaktywnej mapie, a system automatycznie
              dopasowuje subskrybentów i wysyła powiadomienia w ciągu sekund.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              {[
                {
                  value: '1 378',
                  label: 'ulic w rejestrze TERYT',
                  tooltip: 'Pełny rejestr ulic Lublina zgodny z Krajowym Rejestrem Urzędowym Podziału Terytorialnego Kraju (TERYT)',
                },
                {
                  value: '51 000+',
                  label: 'budynków w bazie GIS',
                  tooltip: 'Obrysy i punkty adresowe budynków z BDOT10k, PRG oraz OpenStreetMap — podstawa precyzyjnego dopasowania powiadomień',
                },
                {
                  value: 'SMS + E-mail',
                  label: 'kanały powiadomień',
                  tooltip: 'Mieszkaniec wybiera preferowany kanał podczas rejestracji; możliwe jest włączenie obu jednocześnie',
                },
              ].map(({ value, label, tooltip }) => (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <Card className="text-center py-4 cursor-default border-dashed hover:border-primary/40 transition-colors">
                      <CardContent className="pt-0 pb-0 space-y-1">
                        <p className="text-2xl font-bold text-primary">{value}</p>
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          {label}
                          <Info className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
                        </p>
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-center">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Legenda kolorów */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <span className="h-5 w-5 rounded-sm bg-gradient-to-br from-red-500 via-blue-500 to-yellow-500" aria-hidden="true" />
          Legenda kolorów i oznaczeń
        </h2>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground font-normal">
              Każde zdarzenie na mapie oznaczone jest kolorem odpowiadającym jego typowi.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                color: 'bg-red-700',
                label: 'Awaria',
                badgeClass: 'bg-red-700 hover:bg-red-700 text-white',
                desc: 'Nieplanowane przerwanie dostawy wody wymagające pilnej interwencji. Powiadomienia wysyłane są natychmiast po zgłoszeniu zdarzenia przez dyspozytora.',
              },
              {
                color: 'bg-blue-700',
                label: 'Planowane wyłączenie',
                badgeClass: 'bg-blue-700 hover:bg-blue-700 text-white',
                desc: 'Zaplanowana przerwa w dostawie wody związana z pracami modernizacyjnymi lub konserwacyjnymi sieci. Mieszkańcy są informowani z wyprzedzeniem.',
              },
              {
                color: 'bg-amber-700',
                label: 'Remont',
                badgeClass: 'bg-amber-700 hover:bg-amber-700 text-white',
                desc: 'Prace odtworzeniowe i długofalowe, mogące powodować ograniczenia w dostawie wody lub utrudnienia komunikacyjne w pobliżu remontowanego odcinka sieci.',
              },
            ].map(({ label, badgeClass, desc }) => (
              <div key={label} className="flex gap-3 p-3 rounded-md bg-muted/40 border border-border/50">
                <Badge className={`${badgeClass} self-start mt-0.5 shrink-0 text-[11px]`}>
                  {label}
                </Badge>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* 3. RODO i Prywatność */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          RODO i ochrona prywatności
        </h2>

        <Card>
          <CardContent className="pt-6 space-y-4 text-sm text-muted-foreground">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  icon: <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />,
                  title: 'Zero spamu',
                  text: 'Powiadomienia trafiają wyłącznie do adresów objętych zdarzeniem. System nigdy nie wysyła masowych komunikatów do wszystkich subskrybentów.',
                },
                {
                  icon: <Moon className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />,
                  title: 'Nocne SMS-y za zgodą',
                  text: 'SMS-y między 22:00 a 06:00 są wstrzymywane i wysyłane rano o 06:00 — chyba że subskrybent wyraził zgodę na nocne powiadomienia.',
                },
                {
                  icon: <UserMinus className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />,
                  title: 'Prawo do bycia zapomnianym',
                  text: 'Wyrejestrowanie usuwa wszystkie Twoje dane fizycznie z bazy (hard delete). Brak możliwości odtworzenia — art. 17 RODO.',
                },
                {
                  icon: <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />,
                  title: 'Maskowanie w logach',
                  text: <>Dane kontaktowe przechowywane w logach w postaci skróconej: <code className="bg-muted px-1 rounded text-xs">+48 123 *** 89</code>, <code className="bg-muted px-1 rounded text-xs">m***k@lublin.eu</code>.</>,
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
                  <div className="mt-0.5">{item.icon}</div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{item.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs pt-2 border-t border-border/50">
              Podstawa prawna: art. 6 ust. 1 lit. a RODO (zgoda) oraz art. 17 RODO
              (prawo do bycia zapomnianym). Administratorem danych jest MPWiK Lublin Sp. z o.o.
            </p>
          </CardContent>
        </Card>

        {/* Accordion rejestracji */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="registration">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                Jak się zarejestrować?
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                Przejdź do zakładki <strong>„Zarejestruj się"</strong>. Formularz prowadzi przez trzy kroki:
              </p>
              <ol className="space-y-2 list-none">
                {[
                  {
                    n: '1',
                    title: 'Wybierz kanał powiadomień',
                    text: 'Zaznacz SMS, E-mail lub oba. Dla SMS podaj numer w formacie +48 600 000 000.',
                  },
                  {
                    n: '2',
                    title: 'Wskaż swój adres',
                    text: 'Wpisz nazwę ulicy (min. 3 znaki) i wybierz numer budynku z rejestru GIS. Możesz dodać do 5 adresów.',
                  },
                  {
                    n: '3',
                    title: 'Zaakceptuj zgodę RODO i potwierdź',
                    text: 'System prześle Ci jednorazowy Kod wyrejestrowania. Zachowaj go — pozwala usunąć Twoje dane w każdej chwili.',
                  },
                ].map(({ n, title, text }) => (
                  <li key={n} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                      {n}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{title}</p>
                      <p className="text-xs mt-0.5">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="unsubscribe">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <UserMinus className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                Kod wyrejestrowania
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                Po rejestracji system wysyła <strong>Kod wyrejestrowania</strong> wybranym kanałem.
                Aby usunąć dane, przejdź do zakładki <strong>„Wyrejestruj"</strong>, wklej kod
                i kliknij „Usuń moje dane". Operacja jest <strong>nieodwracalna</strong>.
              </p>
              <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3 text-xs">
                Zgubiłeś kod? Skontaktuj się z BOK MPWiK Lublin:{' '}
                <strong>tel. 81 532-42-81</strong>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* 4. Technologia */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Technologia
        </h2>
        <Card>
          <CardContent className="pt-6 space-y-4 text-sm text-muted-foreground">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: 'Rejestr TERYT',
                  desc: '1 378 ulic z Krajowego Rejestru Urzędowego Podziału Terytorialnego Kraju. Unikatowe kody sym_ul gwarantują spójność danych z rejestrami państwowymi.',
                  icon: <MapPin className="h-4 w-4 text-primary" />,
                },
                {
                  title: 'GIS PostGIS 16',
                  desc: '51 000+ budynków z baz BDOT10k, PRG i OSM. Przestrzenny indeks GIST umożliwia błyskawiczne dopasowanie adresów do odcinków sieci.',
                  icon: <MapPin className="h-4 w-4 text-primary" />,
                },
                {
                  title: 'FastAPI + asyncpg',
                  desc: 'Backend oparty na pełnej asynchroniczności. Powiadomienia wysyłane w tle bez blokowania interfejsu dyspozytora.',
                  icon: <Zap className="h-4 w-4 text-primary" />,
                },
                {
                  title: 'Ochrona przed nadużyciami',
                  desc: 'Weryfikacja 2FA, ograniczenia rate-limit, walidacja Zero Trust po stronie backendu — 7 warstw obrony (Defense in Depth).',
                  icon: <ShieldCheck className="h-4 w-4 text-primary" />,
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 5. Twórcy */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
          Twórcy
        </h2>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              System zaprojektowany i zrealizowany jako projekt inżynierski we współpracy
              z Miejskim Przedsiębiorstwem Wodociągów i Kanalizacji w Lublinie.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: 'Rafał', role: 'Backend & Infrastruktura' },
                { name: 'Jakub', role: 'Fullstack & GIS' },
                { name: 'Mateusz', role: 'Frontend & UX' },
              ].map(({ name, role }) => (
                <div
                  key={name}
                  className="flex flex-col items-center text-center p-4 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <span className="text-primary font-bold text-base">{name[0]}</span>
                  </div>
                  <p className="font-semibold text-sm">{name}</p>
                  <p className="text-xs text-muted-foreground">{role}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                Politechnika Lubelska — projekt realizowany w ramach współpracy z MPWiK Lublin Sp. z o.o.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  </TooltipProvider>
);

export default About;
