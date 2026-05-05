import { useState, useEffect } from 'react';
import { Clock, MapPin, CalendarClock } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { type EventItem } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setIsOpen(false), 5000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const eventTypeDef = eventTypes.find((t) => t.code === event.event_type);
  const eventColor = eventTypeDef?.default_color_rgb ?? '#6B7280';
  const eventLabel = eventTypeDef?.name_pl ?? (typesLoading ? ' ' : event.event_type);

  const Icon = resolveIcon(eventTypeDef?.icon_key);
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
  const isDeleted = event.status === 'usunięta';
  const showPlannedRange = isPlanned && event.start_time && event.estimated_end && !isDeleted;

  const handleActivate = () => {
    onFocus?.(event.id);
    setIsOpen(true);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <Card
          className="hover:shadow-md transition-shadow border-border/60 cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <CardContent className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="line-clamp-1 break-all">
                {event.street_name}{displayNumbers ? ` ${displayNumbers}` : ''}
              </span>
              {hiddenCount > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-5 bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
                >
                  +{hiddenCount} bud.
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{event.custom_message || event.description}</p>
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
      </PopoverAnchor>
      <PopoverContent
        className="p-0 border-0 bg-transparent shadow-none w-auto"
        sideOffset={8}
      >
        <div className="leaflet-popup-content-wrapper shadow-lg border">
          <div className="leaflet-popup-content" style={{ width: '301px' }}>
            <div className="space-y-1 text-sm min-w-[180px]">
              <p className="font-bold">{eventLabel}</p>
              <p className="break-words">{event.street_name}{numbers ? ` ${numbers}` : ''}</p>
              <StatusBadge status={event.status} />
              <p className="text-muted-foreground text-xs mt-1">{event.custom_message || event.description}</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
