import { Clock, MapPin, AlertTriangle, Wrench, Calendar } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { type EventItem, TYPE_LABELS } from '@/data/mockData';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatEventNumbers } from '@/lib/utils';

const typeIcons = {
  awaria: AlertTriangle,
  planowane_wylaczenie: Calendar,
  remont: Wrench,
};

interface EventCardProps {
  event: EventItem;
}

export function EventCard({ event }: EventCardProps) {
  const Icon = typeIcons[event.event_type];
  const numbers = formatEventNumbers(event);

  return (
    <Card className="hover:shadow-md transition-shadow border-border/60">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />}
          <span className="font-semibold text-sm font-heading">{TYPE_LABELS[event.event_type]}</span>
        </div>
        <StatusBadge status={event.status} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span>{event.street_name}{numbers ? ` ${numbers}` : ''}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
        {event.estimated_end && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Szacowane zakończenie:{' '}
              {new Date(event.estimated_end).toLocaleString('pl-PL', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
