import { useState, useMemo, useRef, useEffect, useCallback, Component } from 'react';
import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { useEvents } from '@/hooks/useEvents';
import { useStreets } from '@/hooks/useStreets';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Droplets, Search, CheckCircle2, Hash } from 'lucide-react';
import { type Street } from '@/data/mockData';
import { apiFetch } from '@/lib/api';
import {
  formatEventNumbers,
  streetLabel,
  sortHouseNumbers,
  isEventAffectingHouseNumber,
} from '@/lib/utils';

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

interface BuildingNumber {
  id: number;
  house_number: string;
}

// ---------------------------------------------------------------------------
// Hook — pobiera unikalne numery budynków dla wybranej ulicy
// ---------------------------------------------------------------------------

function useBuildingNumbers(streetId: number | null) {
  const [numbers, setNumbers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!streetId) {
      setNumbers([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    apiFetch<BuildingNumber[]>(`/streets/${streetId}/buildings`)
      .then((data) => {
        if (cancelled) return;
        const unique = sortHouseNumbers(
          [...new Set(
            data
              .map((b) => b.house_number)
              .filter((n): n is string => Boolean(n)),
          )],
        );
        setNumbers(unique);
      })
      .catch(() => { if (!cancelled) setNumbers([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [streetId]);

  return { numbers, isLoading };
}

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
  const [focusedEventId, setFocusedEventId] = useState<number | null>(null);

  // --- Wyszukiwanie ulicy ---
  const [streetQuery, setStreetQuery] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [submittedStreet, setSubmittedStreet] = useState<{ name: string; id: number | null } | null>(null);
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);

  // --- Wyszukiwanie numeru ---
  const [houseQuery, setHouseQuery] = useState('');
  const [submittedHouseNumber, setSubmittedHouseNumber] = useState('');
  const [showHouseSuggestions, setShowHouseSuggestions] = useState(false);
  const houseInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const { streets: suggestions, isLoading: streetsLoading } = useStreets(streetQuery);
  const { numbers: buildingNumbers, isLoading: numbersLoading } = useBuildingNumbers(
    selectedStreet?.id ?? null,
  );

  // Filtruj numery budynków wg wpisanej frazy
  const filteredNumbers = useMemo(() => {
    const q = houseQuery.trim().toUpperCase();
    if (!q) return buildingNumbers;
    return buildingNumbers.filter((n) => n.toUpperCase().startsWith(q));
  }, [buildingNumbers, houseQuery]);

  // ---------------------------------------------------------------------------
  // Handlery ulicy
  // ---------------------------------------------------------------------------

  const handleStreetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStreetQuery(val);
    setSelectedStreet(null);
    setHouseQuery('');
    setSubmittedHouseNumber('');
    setShowStreetSuggestions(val.length >= 3);
    if (!val) setSubmittedStreet(null);
  };

  const selectStreet = useCallback((street: Street) => {
    setSelectedStreet(street);
    setStreetQuery(street.full_name);
    setShowStreetSuggestions(false);
    setHouseQuery('');
    setSubmittedHouseNumber('');
    // Przenieś fokus na pole numeru gdy jest dostępne
    setTimeout(() => houseInputRef.current?.focus(), 80);
  }, []);

  const handleStreetBlur = () => {
    setTimeout(() => setShowStreetSuggestions(false), 150);
  };

  // ---------------------------------------------------------------------------
  // Handlery numeru budynku
  // ---------------------------------------------------------------------------

  const handleHouseInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHouseQuery(val);
    setSubmittedHouseNumber('');
    setShowHouseSuggestions(val.length >= 1 || buildingNumbers.length > 0);
  };

  const selectHouseNumber = useCallback((num: string) => {
    setHouseQuery(num);
    setSubmittedHouseNumber(num);
    setShowHouseSuggestions(false);
  }, []);

  const handleHouseFocus = () => {
    if (selectedStreet && buildingNumbers.length > 0) setShowHouseSuggestions(true);
  };

  const handleHouseBlur = () => {
    setTimeout(() => setShowHouseSuggestions(false), 150);
  };

  // ---------------------------------------------------------------------------
  // Wyszukiwanie / reset
  // ---------------------------------------------------------------------------

  const handleSearch = useCallback(() => {
    const q = streetQuery.trim();
    if (!q) return;
    setSubmittedStreet({ name: q, id: selectedStreet?.id ?? null });
    if (houseQuery.trim()) setSubmittedHouseNumber(houseQuery.trim());
    setShowStreetSuggestions(false);
    setShowHouseSuggestions(false);
  }, [streetQuery, selectedStreet, houseQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') {
      setShowStreetSuggestions(false);
      setShowHouseSuggestions(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtrowanie zdarzeń
  // Backend wyklucza już 'usunieta'; filtr po ulicy i numerze pozostaje client-side
  // bo isEventAffectingHouseNumber wymaga logiki spatial niedostępnej jako prosty query param.
  // ---------------------------------------------------------------------------

  const filteredEvents = useMemo(() => {
    if (!submittedStreet) return events;

    const searchTerms = submittedStreet.name.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let result = events.filter((e) => {
      const text = `${e.street_name ?? ''} ${formatEventNumbers(e)}`.toLowerCase();
      return searchTerms.every((term) => text.includes(term));
    });

    if (submittedHouseNumber) {
      result = result.filter((e) =>
        isEventAffectingHouseNumber(e, submittedHouseNumber),
      );
    }

    return result;
  }, [events, submittedStreet, submittedHouseNumber]);

  const noResultsForQuery = submittedStreet && filteredEvents.length === 0 && !isLoading;

  // Fly-To po wyszukaniu
  useEffect(() => {
    if (!submittedStreet) {
      setFocusedEventId(null);
      return;
    }
    if (filteredEvents.length > 0) setFocusedEventId(filteredEvents[0].id);
  }, [submittedStreet, submittedHouseNumber, filteredEvents]);

  // Opis aktualnego wyszukiwania (pod nagłówkiem listy)
  const searchDescription = useMemo(() => {
    if (!submittedStreet) return null;
    if (submittedHouseNumber) return `„${submittedStreet.name} ${submittedHouseNumber}"`;
    return `„${submittedStreet.name}"`;
  }, [submittedStreet, submittedHouseNumber]);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      {/* Hero — gradient MPWiK: od hsl(214,65%,36%) do hsl(214,60%,14%) */}
      <section
        className="text-white py-12 px-4"
        style={{ background: 'linear-gradient(135deg, hsl(214,65%,36%) 0%, hsl(214,57%,25%) 50%, hsl(214,60%,14%) 100%)' }}
      >
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold font-heading leading-tight whitespace-normal">
            Sprawdź, czy w Twojej okolicy<br className="hidden sm:block" />
            {' '}występują przerwy w dostawie wody
          </h1>
          <p className="text-white/75 text-sm sm:text-base">
            Wpisz nazwę ulicy, aby sprawdzić aktywne awarie i planowane wyłączenia.
          </p>

          {/* Pasek wyszukiwania: ulica + numer */}
          <div ref={containerRef} className="flex flex-col sm:flex-row gap-2 max-w-2xl mx-auto">

            {/* Pole ulicy */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                placeholder="Wpisz nazwę ulicy..."
                value={streetQuery}
                onChange={handleStreetInputChange}
                onFocus={() => streetQuery.length >= 3 && suggestions.length > 0 && setShowStreetSuggestions(true)}
                onKeyDown={handleKeyDown}
                onBlur={handleStreetBlur}
                className="bg-white text-foreground placeholder:text-muted-foreground border-0 h-12 text-base pl-9"
                aria-label="Szukaj ulicy"
                role="combobox"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={showStreetSuggestions}
                aria-controls="street-suggestions-listbox"
              />
              {streetsLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {showStreetSuggestions && suggestions.length > 0 && (
                <ul
                  id="street-suggestions-listbox"
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-52 overflow-y-auto text-left"
                  role="listbox"
                >
                  {suggestions.map((s) => (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={selectedStreet?.id === s.id}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectStreet(s)}
                    >
                      <span className="font-medium text-foreground">
                        {streetLabel(s.street_type, s.full_name)}
                      </span>
                      <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Pole numeru budynku — widoczne gdy ulica jest wybrana */}
            {selectedStreet && (
              <div className="relative w-full sm:w-36">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  ref={houseInputRef}
                  placeholder="Nr domu"
                  value={houseQuery}
                  onChange={handleHouseInputChange}
                  onFocus={handleHouseFocus}
                  onBlur={handleHouseBlur}
                  onKeyDown={handleKeyDown}
                  className="bg-white text-foreground placeholder:text-muted-foreground border-0 h-12 text-base pl-9"
                  aria-label="Numer budynku"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  aria-expanded={showHouseSuggestions}
                  aria-controls="house-suggestions-listbox"
                />
                {numbersLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {showHouseSuggestions && filteredNumbers.length > 0 && (
                  <ul
                    id="house-suggestions-listbox"
                    className="absolute z-50 left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-48 overflow-y-auto text-left"
                    role="listbox"
                  >
                    {filteredNumbers.map((num) => (
                      <li
                        key={num}
                        role="option"
                        aria-selected={houseQuery === num}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors font-medium text-foreground"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectHouseNumber(num)}
                      >
                        {num}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Button
              onClick={handleSearch}
              size="lg"
              className="bg-white text-primary hover:bg-secondary h-12 px-6 font-semibold shrink-0"
            >
              <Search className="h-4 w-4 mr-2" />
              Sprawdź
            </Button>
          </div>

          {noResultsForQuery && (
            <div className="flex items-center justify-center gap-2 bg-green-500/20 border border-green-300/40 rounded-lg py-3 px-4 max-w-lg mx-auto">
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
                      <EventCard key={event.id} event={event} onFocus={setFocusedEventId} />
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
                  focusedEventId={focusedEventId}
                  setFocusedEventId={setFocusedEventId}
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
