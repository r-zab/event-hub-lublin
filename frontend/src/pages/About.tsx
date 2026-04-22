import {
  Droplets,
  MapPin,
  Bell,
  ShieldCheck,
  Moon,
  UserMinus,
  Info,
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

      {/* 1. O systemie i zasięgu */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
          O systemie i zasięgu
        </h2>

        <Card>
          <CardContent className="pt-6 space-y-4 text-sm text-muted-foreground">
            <p>
              System Powiadomień MPWiK Lublin to oficjalne narzędzie Miejskiego
              Przedsiębiorstwa Wodociągów i Kanalizacji w Lublinie do informowania
              mieszkańców o bieżącym stanie sieci wodociągowej. Platforma umożliwia
              natychmiastowe powiadamianie o awariach, planowanych wyłączeniach
              i pracach remontowych dotyczących konkretnych adresów.
            </p>
            <p>
              System opiera się na oficjalnych rejestrach danych przestrzennych —
              każde zdarzenie przypisane jest do precyzyjnego odcinka ulicy
              z zakresem numerów posesji, co eliminuje fałszywe alarmy dla
              niezainteresowanych mieszkańców.
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

      {/* 2. Legenda kolorów i oznaczeń */}
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

      {/* 3. Jak działają powiadomienia? */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
          Jak działają powiadomienia?
        </h2>

        <Accordion type="single" collapsible defaultValue="registration" className="w-full">

          <AccordionItem value="registration">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                Rejestracja i wybór kanału
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                Aby otrzymywać powiadomienia, przejdź do zakładki <strong>„Zarejestruj się"</strong>.
                Wypełnij formularz w trzech krokach:
              </p>
              <ol className="space-y-2 list-none">
                {[
                  {
                    n: '1',
                    title: 'Wybierz kanał powiadomień',
                    text: 'Zaznacz SMS, E-mail lub oba kanały. Dla SMS podaj numer w formacie +48 600 000 000.',
                  },
                  {
                    n: '2',
                    title: 'Wskaż swój adres',
                    text: 'Wpisz nazwę ulicy (min. 3 znaki) i wybierz ją z listy podpowiedzi opartej na oficjalnym rejestrze TERYT. Następnie wybierz numer budynku z oficjalnego spisu budynków GIS. Możesz dodać więcej niż jeden adres.',
                  },
                  {
                    n: '3',
                    title: 'Zaakceptuj zgodę RODO i potwierdź',
                    text: 'Po wysłaniu formularza system prześle Ci Kod wyrejestrowania przez wybrany kanał. Zachowaj go — jest niezbędny do usunięcia danych.',
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

          <AccordionItem value="night">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                Zasada ciszy nocnej (22:00 – 06:00)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                Powiadomienia SMS o awariach zgłoszonych między godz.{' '}
                <strong>22:00 a 06:00</strong> nie są wysyłane natychmiast — trafiają
                do kolejki i zostają dostarczone o <strong>06:00 rano</strong>. Dzięki
                temu mieszkańcy nie są budzeni w środku nocy.
              </p>
              <p>
                Powiadomienia e-mail są wysyłane natychmiast niezależnie od pory doby.
                Jeśli chcesz otrzymywać SMS-y również w godzinach nocnych, zaznacz
                odpowiednią zgodę podczas rejestracji.
              </p>
              <div className="rounded-md bg-muted/60 border border-border/50 p-3 text-xs">
                <strong>Godziny ciszy nocnej:</strong> 22:00 – 06:00 (czas warszawski, CET/CEST)
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="unsubscribe">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <UserMinus className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                Kod wyrejestrowania (RODO)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                Po pomyślnej rejestracji system generuje unikalny{' '}
                <strong>Kod wyrejestrowania</strong> i przesyła go wybranym kanałem
                (SMS lub e-mail). Kod ten pozwala na natychmiastowe i trwałe usunięcie
                wszystkich Twoich danych z systemu.
              </p>
              <p>
                Aby wyrejestrować się, przejdź do zakładki <strong>„Wyrejestruj"</strong>{' '}
                w menu nawigacyjnym, wklej swój Kod i kliknij „Usuń moje dane".
                Operacja jest <strong>nieodwracalna</strong> — dane zostają fizycznie
                usunięte z bazy zgodnie z art. 17 RODO (prawo do bycia zapomnianym).
              </p>
              <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3 text-xs">
                Jeśli zgubiłeś kod — skontaktuj się z BOK MPWiK Lublin:{' '}
                <strong>tel. 81 532-42-81</strong>
              </div>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </section>

      {/* 4. Bezpieczeństwo danych i precyzja */}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Bezpieczeństwo danych i precyzja
        </h2>

        <Card>
          <CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
            <p>
              Ochrona danych osobowych i dokładność powiadomień to fundamenty
              Systemu Powiadomień MPWiK Lublin:
            </p>
            <ul className="space-y-3">
              {[
                {
                  icon: <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />,
                  text: (
                    <>
                      <strong>Twarda walidacja adresów</strong> — system akceptuje wyłącznie
                      numery posesji istniejące w oficjalnym rejestrze budynków MPWiK.
                      Podanie fikcyjnego lub nieistniejącego adresu jest niemożliwe.
                    </>
                  ),
                },
                {
                  icon: <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />,
                  text: (
                    <>
                      <strong>Maskowanie danych w logach</strong> — dane kontaktowe są
                      automatycznie maskowane w logach systemowych i bazach danych.
                      Numery telefonów i adresy e-mail przechowywane są w postaci
                      skróconej (np.{' '}
                      <code className="bg-muted px-1 py-0.5 rounded text-xs text-slate-700">+48 123 *** 89</code>
                      {', '}
                      <code className="bg-muted px-1 py-0.5 rounded text-xs text-slate-700">m***k@lublin.eu</code>
                      ). Żaden administrator systemu nie ma dostępu do pełnych danych
                      kontaktowych w plikach logów.
                    </>
                  ),
                },
                {
                  icon: <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />,
                  text: (
                    <>
                      <strong>Precyzja GIS</strong> — powiadomienie trafia wyłącznie
                      do mieszkańców, których zarejestrowany adres mieści się
                      w zakresie numerów posesji objętych danym zdarzeniem.
                      System obsługuje numery alfanumeryczne (np. 10A, 10B).
                    </>
                  ),
                },
                {
                  icon: <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />,
                  text: (
                    <>
                      <strong>Fizyczne usunięcie danych</strong> — system stosuje wyłącznie
                      twarde usunięcie (hard delete). Po wyrejestrowaniu dane znikają
                      ze wszystkich tabel bazy bez możliwości odtworzenia,
                      zgodnie z art. 17 RODO.
                    </>
                  ),
                },
              ].map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  {item.icon}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs pt-2 border-t border-border/50">
              Podstawa prawna: art. 6 ust. 1 lit. a RODO (zgoda) oraz art. 17 RODO
              (prawo do bycia zapomnianym). Administratorem danych jest MPWiK Lublin Sp. z o.o.
            </p>
          </CardContent>
        </Card>
      </section>

    </div>
  </TooltipProvider>
);

export default About;
