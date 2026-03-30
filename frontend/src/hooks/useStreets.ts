import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { type Street } from '@/data/mockData';

export function useStreets(query: string) {
  const [streets, setStreets] = useState<Street[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (query.length < 3) {
      setStreets([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiFetch<Street[]>(`/streets?q=${encodeURIComponent(query)}`)
      .then((data) => {
        if (!cancelled) setStreets(data);
      })
      .catch(() => {
        if (!cancelled) setStreets([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [query]);

  return { streets, isLoading };
}
