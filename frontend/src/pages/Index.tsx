import { useState, useMemo, useRef, useEffect, useCallback, Component } from 'react';
import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { useEvents } from '@/hooks/useEvents';
import { useStreets } from '@/hooks/useStreets';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Droplets, Search, CheckCircle2, X } from 'lucide-react';
import { type Street } from '@/data/mockData';
import { formatEventNumbers, streetLabel } from '@/lib/utils';

// ---------------------------------------------------------------------------
// ErrorBoundary dla mapy
// ---------------------------------------------------------------------------

class MapErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nie udało się załadować mapy, ale powiadomienia działają poprawnie.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Główny komponent
// ---------------------------------------------------------------------------

const Index = () => {
  const { events, isLoading } = useEvents({ limit: 100, refetchInterval: 60_000 });
  const [mapFocus, setMapFocus] = useState<{ id: number; trigger: number } | null>(null);

  const focusEvent = useCallback((id: number) => {
    setMapFocus({ id, trigger: Date.now() });
  }, []);

  // --- Wyszukiwanie ulicy ---
  const [streetQuery, setStreetQuery] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [submittedStreet, setSubmittedStreet] = useState<{ name: string; id: number | null } | null>(null);
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const streetListRef = useRef<HTMLUListElement>(null);

  const { streets: suggestions, isLoading: streetsLoading } = useStreets(streetQuery);

  useEffect(() => { setActiveSuggestionIndex(-1); }, [suggestions]);

  useEffect(() => {
    if (!streetListRef.current || activeSuggestionIndex < 0) return;
    streetListRef.current.querySelectorAll('li')[activeSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeSuggestionIndex]);

  // ---------------------------------------------------------------------------
  // Handlery ulicy
  // ---------------------------------------------------------------------------

  const handleStreetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStreetQuery(val);
    setSelectedStreet(null);
    setSubmittedStreet(null);  // Resetuj wyniki gdy użytkownik modyfikuje pole
    setShowStreetSuggestions(val.length >= 3);
  };

  const selectStreet = useCallback((street: Street) => {
    setSelectedStreet(street);
    setStreetQuery(street.full_name);
    setShowStreetSuggestions(false);
    setActiveSuggestionIndex(-1);
    setSubmittedStreet({ name: street.full_name, id: street.id });
  }, []);

  const clearStreet = useCallback(() => {
    setStreetQuery('');
    setSelectedStreet(null);
    setSubmittedStreet(null);
    setShowStreetSuggestions(false);
    setActiveSuggestionIndex(-1);
  }, []);

  const handleStreetBlur = () => {
    setTimeout(() => setShowStreetSuggestions(false), 150);
  };

  // ---------------------------------------------------------------------------
  // Wyszukiwanie — wymaga wyboru z listy
  // ---------------------------------------------------------------------------

  const handleSearch = useCallback(() => {
    if (!selectedStreet) return;
    setSubmittedStreet({ name: selectedStreet.full_name, id: selectedStreet.id });
    setShowStreetSuggestions(false);
  }, [selectedStreet]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showStreetSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex((i) => (i >= suggestions.length - 1 ? 0 : i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
        e.preventDefault();
        selectStreet(suggestions[activeSuggestionIndex]);
        return;
      }
    }
    if (e.key === 'Enter' && selectedStreet) handleSearch();
    if (e.key === 'Escape') {
      setShowStreetSuggestions(false);
      setActiveSuggestionIndex(-1);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtrowanie zdarzeń po ulicy (client-side fallback — backend filtruje po streetId gdy dostępne)
  // ---------------------------------------------------------------------------

  const filteredEvents = useMemo(() => {
    if (!submittedStreet) return events;

    const searchTerms = submittedStreet.name.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return events.filter((e) => {
      const text = `${e.street_name ?? ''} ${formatEventNumbers(e)}`.toLowerCase();
      return searchTerms.every((term) => text.includes(term));
    });
  }, [events, submittedStreet]);

  const noResultsForQuery = submittedStreet && filteredEvents.length === 0 && !isLoading;

  // Fly-To po wyszukaniu
  useEffect(() => {
    if (!submittedStreet) {
      setMapFocus(null);
      return;
    }
    if (filteredEvents.length > 0) setMapFocus({ id: filteredEvents[0].id, trigger: Date.now() });
  }, [submittedStreet, filteredEvents]);

  // Opis aktualnego wyszukiwania (pod nagłówkiem listy)
  const searchDescription = useMemo(() => {
    if (!submittedStreet) return null;
    return `„${submittedStreet.name}"`;
  }, [submittedStreet]);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      {/* Hero — gradient MPWiK: od hsl(214,65%,36%) do hsl(214,60%,14%) */}
      <section
        className="hero-section text-white py-12 px-4"
        style={{ background: 'linear-gradient(135deg, hsl(214,65%,36%) 0%, hsl(214,57%,25%) 50%, hsl(214,60%,14%) 100%)' }}
      >
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <h1 className="hero-heading text-2xl md:text-4xl lg:text-5xl font-bold font-heading leading-tight whitespace-normal">
            Sprawdź, czy w Twojej okolicy<br className="hidden sm:block" />
            {' '}występują przerwy w dostawie wody
          </h1>
          <p className="hero-description text-white/75 text-sm sm:text-base">
            Wpisz nazwę ulicy, aby sprawdzić aktywne awarie i planowane wyłączenia.
          </p>

          {/* Pasek wyszukiwania: ulica */}
          <div ref={containerRef} className="flex flex-col gap-1.5 max-w-2xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row gap-2">

              {/* Pole ulicy */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  placeholder="Wpisz nazwę ulicy..."
                  value={streetQuery}
                  onChange={handleStreetInputChange}
                  onFocus={() => streetQuery.length >= 3 && setShowStreetSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleStreetBlur}
                  className={`street-search-input bg-white text-foreground placeholder:text-muted-foreground border-0 h-12 text-base pl-9 pr-9 transition-shadow ${
                    selectedStreet ? 'ring-2 ring-green-400' : ''
                  }`}
                  aria-label="Szukaj ulicy"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  aria-expanded={showStreetSuggestions}
                  aria-controls="street-suggestions-listbox"
                  aria-activedescendant={activeSuggestionIndex >= 0 ? `street-suggestion-${activeSuggestionIndex}` : undefined}
                />
                {streetsLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                ) : streetQuery ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-0.5 text-muted-foreground hover:text-foreground focus:outline-none"
                    onClick={clearStreet}
                    aria-label="Wyczyść wyszukiwanie"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
                {showStreetSuggestions && (
                  <ul
                    ref={streetListRef}
                    id="street-suggestions-listbox"
                    className="street-suggestions-list absolute z-50 left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-52 overflow-y-auto text-left"
                    role="listbox"
                  >
                    {suggestions.length > 0 ? (
                      suggestions.map((s, i) => (
                        <li
                          key={s.id}
                          id={`street-suggestion-${i}`}
                          role="option"
                          aria-selected={i === activeSuggestionIndex}
                          className={`street-suggestion-item px-3 py-2 text-sm cursor-pointer transition-colors ${i === activeSuggestionIndex ? 'bg-accent font-semibold' : 'hover:bg-accent'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectStreet(s)}
                        >
                          <span className="font-medium text-foreground">
                            {streetLabel(s.street_type, s.full_name)}
                          </span>
                          <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
                        </li>
                      ))
                    ) : !streetsLoading && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">
                        Nie znaleziono ulicy o podanej nazwie
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <Button
                onClick={handleSearch}
                size="lg"
                disabled={!selectedStreet}
                className="street-search-btn bg-white text-primary hover:bg-secondary h-12 px-6 font-semibold shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="h-4 w-4 mr-2" />
                Sprawdź
              </Button>
            </div>

            {/* Stała wysokość min-h-4 = brak layout shift przy pojawianiu/znikaniu hintu */}
            <p className="hero-hint min-h-4 text-white/70 text-xs text-center sm:text-left">
              {streetQuery.trim().length >= 3 && !selectedStreet && !streetsLoading
                ? 'Wybierz ulicę z listy podpowiedzi, aby zobaczyć zdarzenia.'
                : ''}
            </p>
          </div>

          {noResultsForQuery && (
            <div className="no-results-alert flex items-center justify-center gap-2 bg-green-500/20 border border-green-300/40 rounded-lg py-3 px-4 max-w-lg mx-auto">
              <CheckCircle2 className="h-5 w-5 text-green-200 shrink-0" />
              <span className="text-green-100 text-sm">
                W tej chwili nie mamy zgłoszeń o awariach w podanej lokalizacji.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Side-by-Side Layout */}
      <section className="container mx-auto px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="rounded-full bg-primary/10 p-6">
              <Droplets className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Brak aktywnych zdarzeń</h2>
            <p className="text-muted-foreground max-w-md">
              Aktualnie nie ma żadnych zgłoszonych awarii ani planowanych wyłączeń. Wszystko działa prawidłowo!
            </p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row h-[80vh] min-h-[500px] w-full border rounded-xl overflow-hidden shadow-sm my-4 bg-background">

            {/* Lewa kolumna: lista zdarzeń z wewnętrznym scrollem */}
            <div className="w-full lg:w-[400px] xl:w-[450px] flex flex-col border-r h-[50%] lg:h-full flex-shrink-0">
              <div className="p-4 space-y-4 flex-1 overflow-y-auto min-h-0">
                <h2 className="font-heading text-xl font-bold">
                  Aktywne zdarzenia
                  {searchDescription && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      — wyniki dla {searchDescription}
                    </span>
                  )}
                </h2>
                {filteredEvents.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4">
                    Brak wyników dla podanej frazy.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredEvents.map((event) => (
                      <EventCard key={event.id} event={event} onFocus={focusEvent} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Prawa kolumna: mapa wypełniająca resztę miejsca */}
            <div className="flex-1 relative min-h-0 h-[50%] lg:h-full">
              <MapErrorBoundary>
                <EventMap
                  events={filteredEvents}
                  focusedEventId={mapFocus}
                  setFocusedEventId={focusEvent}
                />
              </MapErrorBoundary>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Index;
