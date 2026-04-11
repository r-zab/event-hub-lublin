import { useState, useMemo } from 'react';
import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { useEvents } from '@/hooks/useEvents';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Droplets, Search, CheckCircle2 } from 'lucide-react';

const Index = () => {
  const { events, allEvents, isLoading } = useEvents();
  const [focusedEventId, setFocusedEventId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const handleSearch = () => {
    setSubmittedQuery(searchQuery.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const filteredEvents = useMemo(() => {
    if (!submittedQuery) return events;
    const q = submittedQuery.toLowerCase();
    return events.filter((e) => e.street_name.toLowerCase().includes(q));
  }, [events, submittedQuery]);

  const activeEvents = useMemo(
    () => allEvents.filter((e) => e.status !== 'usunieta'),
    [allEvents],
  );

  const noResultsForQuery = submittedQuery && filteredEvents.length === 0 && !isLoading;

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-12 px-4">
        <div className="container mx-auto max-w-2xl text-center space-y-6">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-heading leading-tight">
            Sprawdź, czy w Twojej okolicy występują przerwy w dostawie wody
          </h1>
          <p className="text-blue-100 text-sm sm:text-base">
            Wpisz nazwę ulicy, aby sprawdzić aktywne awarie i planowane wyłączenia.
          </p>
          <div className="flex gap-2 max-w-lg mx-auto">
            <Input
              placeholder="Wpisz nazwę ulicy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-white text-foreground placeholder:text-muted-foreground border-0 h-12 text-base"
            />
            <Button
              onClick={handleSearch}
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 h-12 px-6 font-semibold shrink-0"
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
      <section className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : activeEvents.length === 0 ? (
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Mobile: Map on top */}
            <div className="lg:hidden">
              <div className="h-[400px] rounded-lg overflow-hidden border">
                <EventMap events={filteredEvents} focusedEventId={focusedEventId} setFocusedEventId={setFocusedEventId} />
              </div>
            </div>

            {/* Left column: scrollable event list */}
            <div className="lg:col-span-5">
              <h2 className="font-heading text-xl font-bold mb-4">
                Aktywne zdarzenia
                {submittedQuery && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    — wyniki dla „{submittedQuery}"
                  </span>
                )}
              </h2>
              {filteredEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">
                  Brak wyników dla podanej frazy.
                </p>
              ) : (
                <div className="space-y-4">
                  {filteredEvents.map((event) => (
                    <EventCard key={event.id} event={event} onFocus={setFocusedEventId} />
                  ))}
                </div>
              )}
            </div>

            {/* Right column: sticky map (desktop only) */}
            <div className="hidden lg:block lg:col-span-7">
              <div className="sticky top-24 h-[calc(100vh-200px)] rounded-lg overflow-hidden border">
                <EventMap events={filteredEvents} focusedEventId={focusedEventId} setFocusedEventId={setFocusedEventId} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Index;
