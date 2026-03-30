import { Droplets, Clock, Bell, ShieldCheck } from 'lucide-react';

const features = [
  { icon: Clock, title: 'Szybka informacja', desc: 'Skrócenie czasu dezinformacji z godzin do minut. Mieszkańcy wiedzą o awariach natychmiast.' },
  { icon: Bell, title: 'SMS i E-mail', desc: 'Automatyczne powiadomienia na telefon i pocztę e-mail — bez konieczności sprawdzania strony.' },
  { icon: ShieldCheck, title: 'Prywatność (RODO)', desc: 'Pełna kontrola nad danymi. Możliwość całkowitego, fizycznego usunięcia danych w dowolnym momencie.' },
];

const About = () => (
  <div className="container max-w-3xl py-12 space-y-12">
    <div className="text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <Droplets className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <h1 className="font-heading text-2xl sm:text-3xl font-bold">O systemie Event Hub Lublin</h1>
      <p className="text-muted-foreground max-w-xl mx-auto">
        System powiadamiania mieszkańców o awariach i przerwach w dostawie wody na terenie miasta Lublin.
      </p>
    </div>

    <section className="space-y-4">
      <h2 className="font-heading text-xl font-semibold">Cel projektu</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Głównym celem systemu <strong>Event Hub Lublin</strong> jest drastyczne skrócenie czasu, w jakim mieszkańcy dowiadują się o awariach sieci wodociągowej. Dotychczasowy model informowania (ogłoszenia na stronie MPWiK, media lokalne) generował opóźnienia sięgające kilku godzin. Nasz system pozwala na natychmiastowe powiadamianie drogą SMS i e-mail wszystkich zarejestrowanych mieszkańców, których adresy znajdują się w strefie objętej zdarzeniem.
      </p>
    </section>

    <section>
      <h2 className="font-heading text-xl font-semibold mb-6">Kluczowe funkcje</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-lg border border-border/60 bg-card p-5 space-y-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-heading font-semibold text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="font-heading text-xl font-semibold">Autorzy</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Projekt został stworzony przez studentów <strong>Politechniki Lubelskiej</strong> w ramach kierunku <strong>Sztuczna Inteligencja w Biznesie</strong>. System łączy wiedzę z zakresu inżynierii oprogramowania, baz danych i komunikacji miejskiej, tworząc narzędzie realnie wspierające infrastrukturę miasta.
      </p>
    </section>
  </div>
);

export default About;
