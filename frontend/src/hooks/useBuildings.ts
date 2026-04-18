import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export interface BuildingItem {
  id: number;
  street_id: number | null;
  street_name: string | null;
  house_number: string | null;
  geom_type: 'polygon' | 'point';
  geojson_polygon: Record<string, unknown> | null;
  geojson_point: Record<string, unknown> | null;
  has_address: boolean;
}

export interface BoundsState {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom: number;
}

const MIN_ZOOM = 15;

export function useBuildings(bounds: BoundsState | null, refetchTick: number) {
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bounds || bounds.zoom < MIN_ZOOM) {
      setBuildings([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      min_lat: String(bounds.minLat),
      max_lat: String(bounds.maxLat),
      min_lon: String(bounds.minLon),
      max_lon: String(bounds.maxLon),
    });

    apiFetch<BuildingItem[]>(`/buildings?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setBuildings(data);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Nie udało się pobrać budynków.');
          setBuildings([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // Serializujemy bounds do prymitywów, żeby Effect nie strzelał co render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bounds?.minLat,
    bounds?.maxLat,
    bounds?.minLon,
    bounds?.maxLon,
    bounds?.zoom,
    refetchTick,
  ]);

  return { buildings, isLoading, error };
}

export async function updateBuildingAddress(
  buildingId: number,
  data: { street_id: number | null; street_name: string; house_number: string },
): Promise<BuildingItem> {
  return apiFetch<BuildingItem>(`/buildings/${buildingId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteBuildingAddress(buildingId: number): Promise<void> {
  return apiFetch<void>(`/buildings/${buildingId}`, {
    method: 'DELETE',
  });
}
