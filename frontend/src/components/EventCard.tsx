import { Clock, MapPin, TriangleAlert, Wrench, CalendarClock } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { type EventItem } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatEventNumbers, formatDateTime } from '@/lib/utils';
import { useEventTypes } from '@/hooks/useEventTypes';

// Kształt ikony per znany typ — nieznane typy dostają trójkąt ostrzeżenia
const typeIcons: Partial<Record<string, typeof TriangleAlert>> = {
  awaria: TriangleAlert,
  planowane_wylaczenie: CalendarClock,
  remont: Wrench,
};

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

interface EventCardProps {
  event: EventItem;
  onFocus?: (id: number) => void;
}

export function EventCard({ event, onFocus }: EventCardProps) {
  const { eventTypes } = useEventTypes();

  // Kolor i etykieta z dynamicznego słownika typów zdarzeń (T2.1 + bugfix)
  const eventTypeDef = eventTypes.find((t) => t.code === event.event_type);
  const eventColor = eventTypeDef?.default_color_rgb ?? '#6B7280';
  const eventLabel = eventTypeDef?.name_pl ?? event.event_type;

  const Icon = typeIcons[event.event_type] ?? TriangleAlert;
  const numbers = formatEventNumbers(event);
  let displayNumbers = numbers;
  let hiddenCount = 0;
  if (numbers) {
    const numList = numbers.split(',').map((n) => n.trim());
    if (numList.length > 3) {
      displayNumbers = numList.slice(0, 3).join(', ');
      hiddenCount = numList.length - 3;
    }
  }

  const isPlanned = event.event_type === 'planowane_wylaczenie';
  const showPlannedRange = isPlanned && event.start_time && event.estimated_end;

  return (
    <Card
      className="hover:shadow-md transition-shadow border-border/60 cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="button"
      tabIndex={0}
      onClick={() => onFocus?.(event.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFocus?.(event.id);
        }
      }}
    >
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon
            className="h-5 w-5 shrink-0"
            style={{ color: eventColor }}
            aria-hidden="true"
          />
          <span
            className="font-semibold text-sm font-heading"
            style={{ color: eventColor }}
          >
            {eventLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {event.source && (
            <Badge variant="outline" className="text-xs">
              źródło: {event.source.toUpperCase()}
            </Badge>
          )}
          <StatusBadge status={event.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="line-clamp-1 break-all">
            {event.street_name}{displayNumbers ? ` ${displayNumbers}` : ''}
          </span>
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              +{hiddenCount} bud.
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
        {showPlannedRange ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Planowane:{' '}
              {formatDateTime(event.start_time!, DATETIME_FORMAT)}
              {' – '}
              {formatDateTime(event.estimated_end!, DATETIME_FORMAT)}
            </span>
          </div>
        ) : event.estimated_end && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Szacowane zakończenie: {formatDateTime(event.estimated_end, DATETIME_FORMAT)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
