import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface EventTypeItem {
  id: number;
  code: string;
  name_pl: string;
  default_color_rgb: string;
  is_active: boolean;
  sort_order: number;
}

export function useEventTypes() {
  const { data, isLoading } = useQuery<EventTypeItem[]>({
    queryKey: ['event-types-active'],
    queryFn: () => apiFetch<EventTypeItem[]>('/event-types?only_active=true'),
    staleTime: 5 * 60 * 1000,
  });
  return { eventTypes: data ?? [], isLoading };
}
