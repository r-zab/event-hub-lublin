import { useState, useEffect, useMemo } from 'react';
import { type EventItem, type EventStatus, type EventType } from '@/data/mockData';
import { apiFetch } from '@/lib/api';

const PAGE_SIZE = 10;

interface UseEventsOptions {
  search?: string;
  statusFilter?: string;
  typeFilter?: string;
  page?: number;
}

interface UseEventsReturn {
  events: EventItem[];
  allEvents: EventItem[];
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEvents({ search = '', statusFilter = '', typeFilter = '', page = 1 }: UseEventsOptions = {}): UseEventsReturn {
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiFetch<EventItem[]>('/events')
      .then((data) => {
        if (!cancelled) setAllEvents(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError('Nie udało się pobrać zdarzeń z serwera.');
          setAllEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const filtered = useMemo(() => {
    let result = allEvents.filter((e) => e.status !== 'usunieta');

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.street_name.toLowerCase().includes(q));
    }
    if (statusFilter && statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (typeFilter && typeFilter !== 'all') {
      result = result.filter((e) => e.event_type === typeFilter);
    }
    return result;
  }, [allEvents, search, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const events = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return { events, allEvents, totalPages, currentPage: safePage, isLoading, error, refetch };
}
