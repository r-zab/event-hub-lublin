import { useState } from 'react';
import { Clock, MapPin, CalendarClock, ChevronDown } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { type EventItem } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { formatEventNumbers, formatDateTime } from '@/lib/utils';
import { useEventTypes } from '@/hooks/useEventTypes';
import { resolveIcon } from '@/lib/eventTypeIcons';

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
  const { eventTypes, isLoading: typesLoading } = useEventTypes();
  const [expanded, setExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const eventTypeDef = eventTypes.find((t) => t.code === event.event_type);
  const eventColor = eventTypeDef?.default_color_rgb ?? '#6B7280';
  const eventLabel = eventTypeDef?.name_pl ?? (typesLoading ? ' ' : event.event_type);

  const Icon = resolveIcon(eventTypeDef?.icon_key);
  const numbers = formatEventNumbers(event);
  let displayNumbers = numbers;
  let numList: string[] = [];
  let hiddenCount = 0;
  if (numbers) {
    numList = numbers.split(',').map((n) => n.trim());
    if (numList.length > 3) {
      displayNumbers = numList.slice(0, 3).join(', ');
      hiddenCount = numList.length - 3;
    }
  }

  const isPlanned = event.event_type === 'planowane_wylaczenie';
  const isDeleted = event.status === 'usunięta';
  const showPlannedRange = isPlanned && event.start_time && event.estimated_end && !isDeleted;

  const description = event.custom_message || event.description || '';
  const isLongDesc = description.length > 100;

  const handleActivate = () => {
    onFocus?.(event.id);
  };

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card
        className="hover:shadow-md transition-shadow border-border/60 cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring p-4 sm:p-6"
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleActivate();
          }
        }}
      >
        <CardHeader className="pb-2 flex flex-col sm:flex-row items-start justify-between gap-1.5 sm:gap-2 p-0">
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
              <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                źródło: {event.source.toUpperCase()}
              </Badge>
            )}
            <StatusBadge status={event.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 p-0 pt-2">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 sm:line-clamp-1 break-words">
              {event.street_name}{displayNumbers ? ` ${displayNumbers}` : ''}
            </span>
            {hiddenCount > 0 && (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 h-5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 font-medium hover:bg-blue-200 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  aria-expanded={expanded}
                >
                  {expanded ? 'Ukryj' : `+${hiddenCount} bud.`}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
            )}
          </div>
          <CollapsibleContent>
            <div className="pt-1 pb-0.5">
              <p className="text-xs font-medium text-muted-foreground mb-1">Wszystkie adresy:</p>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                {numList.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>
          </CollapsibleContent>
          <div>
            <p className={`text-sm text-muted-foreground ${!descExpanded && isLongDesc ? 'line-clamp-2' : ''}`}>
              {description}
            </p>
            {isLongDesc && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDescExpanded(!descExpanded); }}
                className="text-xs text-primary mt-0.5 hover:underline focus:outline-none"
              >
                {descExpanded ? 'Zwiń opis' : 'Rozwiń opis'}
              </button>
            )}
          </div>
          {showPlannedRange ? (
            <div className="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-1 text-xs text-muted-foreground items-start">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Rozpoczęcie: {formatDateTime(event.start_time!, DATETIME_FORMAT)}</span>
              <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Zakończenie: {formatDateTime(event.estimated_end!, DATETIME_FORMAT)}</span>
            </div>
          ) : !isDeleted && event.estimated_end && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Szacowane zakończenie: {formatDateTime(event.estimated_end, DATETIME_FORMAT)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Collapsible>
  );
}
