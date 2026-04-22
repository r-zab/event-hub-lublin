import { cn } from '@/lib/utils';
import { type EventStatus, STATUS_LABELS } from '@/data/mockData';

const statusStyles: Record<EventStatus, string> = {
  zgloszona: 'bg-status-reported/15 text-status-reported border-status-reported/30',
  w_naprawie: 'bg-status-repairing/15 text-amber-800 border-status-repairing/30',
  usunieta: 'bg-status-resolved/15 text-status-resolved border-status-resolved/30',
  planowane_wylaczenie: 'bg-status-planned/15 text-blue-700 border-status-planned/30',
  remont: 'bg-status-renovation/15 text-purple-800 border-status-renovation/30',
};

interface StatusBadgeProps {
  status: EventStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        statusStyles[status],
        className
      )}
      role="status"
      aria-label={`Status: ${STATUS_LABELS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
