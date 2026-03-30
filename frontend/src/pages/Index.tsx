import { EventCard } from '@/components/EventCard';
import { EventMap } from '@/components/EventMap';
import { useEvents } from '@/hooks/useEvents';
import { Loader2, Droplets } from 'lucide-react';

const Index = () => {
  const { events, isLoading } = useEvents();

  return (
    <div className="space-y-8">
      {/* Map */}
      <section aria-label="Mapa zdarzeń">
        <EventMap events={events} />
      </section>

      {/* Events list */}
      <section className="container pb-12" aria-label="Lista aktywnych zdarzeń">
        <h1 className="font-heading text-2xl font-bold mb-6">Aktywne zdarzenia</h1>

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Index;
