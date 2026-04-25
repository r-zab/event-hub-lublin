export type EventStatus = 'zgloszona' | 'w_naprawie' | 'usunieta' | 'planowane_wylaczenie' | 'remont';
export type EventType = 'awaria' | 'planowane_wylaczenie' | 'remont';

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: object;
    properties: Record<string, unknown>;
  }>;
}

export interface StatusChange {
  id?: number;
  old_status: EventStatus;
  new_status: EventStatus;
  changed_at: string;
  changed_by: number | string;
  note?: string | null;
}

export interface EventItem {
  id: number;
  event_type: string; // T2.1: dynamiczne typy z DB — może być dowolny kod, nie tylko znane 3
  source?: string;
  street_id?: number;
  street_name: string;
  house_number_from: string;
  house_number_to: string;
  status: EventStatus;
  description: string;
  start_time: string | null;
  estimated_end: string | null;
  geojson_segment: [number, number][] | GeoJsonFeatureCollection | null;
  street_geojson?: { type: string; coordinates: [number, number] } | null;
  created_by: number | string;
  created_by_department?: string | null;
  created_at?: string;
  updated_at?: string;
  notified_count?: number;
  history: StatusChange[];
  auto_extend?: boolean;
  auto_close?: boolean;
}

export interface Street {
  id: number;
  teryt_sym_ul: string;
  name: string;
  full_name: string;
  street_type: string;
  city: string;
}

export const STATUS_LABELS: Record<EventStatus, string> = {
  zgloszona: 'Zgłoszona',
  w_naprawie: 'W naprawie',
  usunieta: 'Usunięta',
  planowane_wylaczenie: 'Planowane wyłączenie',
  remont: 'Remont',
};

export const TYPE_LABELS: Record<EventType, string> = {
  awaria: 'Awaria',
  planowane_wylaczenie: 'Planowane wyłączenie',
  remont: 'Remont',
};

