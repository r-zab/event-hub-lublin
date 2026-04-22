import { useState, useEffect } from 'react';
import { type EventItem } from '@/data/mockData';
import { apiFetch } from '@/lib/api';

export async function getEvent(id: number): Promise<EventItem> {
  return apiFetch<EventItem>(`/events/${id}`);
}

export async function updateEvent(id: number, data: Record<string, unknown>): Promise<EventItem> {
  return apiFetch<EventItem>(`/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEvent(id: number): Promise<void> {
  await apiFetch<void>(`/events/${id}`, { method: 'DELETE' });
}

const PAGE_SIZE = 10;

interface UseEventsOptions {
  search?: string;
  statusFilter?: string;
  typeFilter?: string;
  page?: number;
  limit?: number;
  refetchInterval?: number;
}

interface PaginatedResponse {
  items: EventItem[];
  total_count: number;
}

interface UseEventsReturn {
  events: EventItem[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEvents({
  search = '',
  statusFilter = '',
  typeFilter = '',
  page = 1,
  limit = PAGE_SIZE,
  refetchInterval,
}: UseEventsOptions = {}): UseEventsReturn {
  const [data, setData] = useState<PaginatedResponse>({ items: [], total_count: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('skip', String((page - 1) * limit));
    params.set('limit', String(limit));
    if (search) params.set('search', search);
    if (statusFilter && statusFilter !== 'all') params.set('status_filter', statusFilter);
    if (typeFilter && typeFilter !== 'all') params.set('type_filter', typeFilter);

    apiFetch<PaginatedResponse>(`/events?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res ?? { items: [], total_count: 0 });
      })
      .catch(() => {
        if (!cancelled) {
          setError('Nie udało się pobrać zdarzeń z serwera.');
          setData({ items: [], total_count: 0 });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick, page, search, statusFilter, typeFilter, limit]);

  useEffect(() => {
    if (!refetchInterval) return;
    const id = setInterval(() => setTick((t) => t + 1), refetchInterval);
    return () => clearInterval(id);
  }, [refetchInterval]);

  const totalPages = Math.max(1, Math.ceil(data.total_count / limit));

  return {
    events: data.items,
    totalPages,
    currentPage: Math.min(page, totalPages),
    totalCount: data.total_count,
    isLoading,
    error,
    refetch,
  };
}
