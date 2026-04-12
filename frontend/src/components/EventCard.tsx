import { Clock, MapPin, TriangleAlert, Wrench, CalendarClock } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { type EventItem, type EventType, TYPE_LABELS } from '@/data/mockData';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatEventNumbers, formatDateTime } from '@/lib/utils';

const typeIcons: Record<EventType, typeof TriangleAlert> = {
  awaria: TriangleAlert,
  planowane_wylaczenie: CalendarClock,
  remont: Wrench,
};

const typeStyles: Record<EventType, { icon: string; label: string }> = {
  awaria: { icon: 'text-red-600', label: 'text-red-700' },
  planowane_wylaczenie: { icon: 'text-blue-600', label: 'text-blue-700' },
  remont: { icon: 'text-amber-600', label: 'text-amber-700' },
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
  const Icon = typeIcons[event.event_type];
  const styles = typeStyles[event.event_type];
  const numbers = formatEventNumbers(event);

  const isPlanned = event.event_type === 'planowane_wylaczenie';
  const showPlannedRange = isPlanned && event.start_time && event.estimated_end;

  return (
    <Card
      className="hover:shadow-md transition-shadow border-border/60 cursor-pointer hover:bg-muted/50"
      onClick={() => onFocus?.(event.id)}
    >
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 shrink-0 ${styles.icon}`} aria-hidden="true" />}
          <span className={`font-semibold text-sm font-heading ${styles.label}`}>
            {TYPE_LABELS[event.event_type]}
          </span>
        </div>
        <StatusBadge status={event.status} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span>{event.street_name}{numbers ? ` ${numbers}` : ''}</span>
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
