import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, Marker, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EventItem, GeoJsonFeatureCollection, TYPE_LABELS } from '@/data/mockData';
import { StatusBadge } from './StatusBadge';
import { LUBLIN_BOUNDS, MIN_ZOOM } from '@/lib/mapConfig';

const STATUS_COLORS: Record<string, string> = {
  zgloszona: '#EF4444',
  w_naprawie: '#F59E0B',
  usunieta: '#10B981',
  planowane_wylaczenie: '#3B82F6',
  remont: '#8B5CF6',
};

interface Props {
  events: EventItem[];
  focusedEventId?: number | null;
  setFocusedEventId?: (id: number) => void;
}

const LUBLIN_CENTER: [number, number] = [51.2465, 22.5684];

/** Type-safe check: is geojson_segment a FeatureCollection with at least one feature? */
function isValidFeatureCollection(
  seg: EventItem['geojson_segment'],
): seg is GeoJsonFeatureCollection {
  return (
    !!seg &&
    typeof seg === 'object' &&
    !Array.isArray(seg) &&
    (seg as GeoJsonFeatureCollection).type === 'FeatureCollection' &&
    Array.isArray((seg as GeoJsonFeatureCollection).features) &&
    (seg as GeoJsonFeatureCollection).features.length > 0
  );
}

function makeIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/** Zwróć pozycję Leaflet [lat, lng] dla zdarzenia — z street_geojson lub centrum Lublina. */
function getMarkerPosition(event: EventItem): [number, number] {
  if (event.street_geojson?.type === 'Point') {
    const [lon, lat] = event.street_geojson.coordinates;
    return [lat, lon];
  }
  return LUBLIN_CENTER;
}

// ---------------------------------------------------------------------------
// MapController — reaguje na zmianę focusedEventId i animuje mapę flyTo
// ---------------------------------------------------------------------------

interface MapControllerProps {
  events: EventItem[];
  focusedEventId: number | null | undefined;
}

function MapController({ events, focusedEventId }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (focusedEventId == null) return;
    const event = events.find((e) => e.id === focusedEventId);
    if (!event) return;

    try {
      // FeatureCollection (obrysy budynków) → flyToBounds
      if (isValidFeatureCollection(event.geojson_segment)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bounds = L.geoJSON(event.geojson_segment as any).getBounds();
        if (bounds && bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5, maxZoom: 18 });
          return;
        }
      }

      // Punkt (street_geojson) lub fallback centrum — używamy flyTo
      const [lat, lon] = getMarkerPosition(event);
      // Nie leć do centrum Lublina — brak precyzyjnych danych
      if (lat === LUBLIN_CENTER[0] && lon === LUBLIN_CENTER[1]) return;
      if (
        typeof lat === 'number' && !isNaN(lat) &&
        typeof lon === 'number' && !isNaN(lon)
      ) {
        map.flyTo([lat, lon], 16, { duration: 1.5 });
      }
    } catch {
      // nieprawidłowe współrzędne — ignorujemy, aby nie crashować aplikacji
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedEventId]);

  return null;
}

// ---------------------------------------------------------------------------
// EventMap
// ---------------------------------------------------------------------------

export function EventMap({ events, focusedEventId, setFocusedEventId }: Props) {
  return (
    <MapContainer
      center={LUBLIN_CENTER}
      zoom={14}
      scrollWheelZoom={true}
      className="w-full h-full z-0"
      maxBounds={LUBLIN_BOUNDS}
      maxBoundsViscosity={1.0}
      minZoom={MIN_ZOOM}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController events={events} focusedEventId={focusedEventId} />

      {events.map((event) => {
        const color = STATUS_COLORS[event.status] ?? '#6B7280';

        // Oblicz pozycję markera: centroid poligonów > street_geojson > centrum Lublina
        let markerPos: [number, number] = getMarkerPosition(event);
        if (isValidFeatureCollection(event.geojson_segment)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bounds = L.geoJSON(event.geojson_segment as any).getBounds();
            if (bounds.isValid()) {
              const c = bounds.getCenter();
              markerPos = [c.lat, c.lng];
            }
          } catch {
            // bounds obliczenie zawiodło — zostajemy przy fallbacku
          }
        }

        const popup = (
          <Popup>
            <div className="space-y-1 text-sm min-w-[180px]">
              <p className="font-bold">{TYPE_LABELS[event.event_type]}</p>
              <p>{event.street_name} {event.house_number_from}–{event.house_number_to}</p>
              <StatusBadge status={event.status} />
              <p className="text-muted-foreground text-xs mt-1">{event.description}</p>
            </div>
          </Popup>
        );

        const markerEvents = setFocusedEventId
          ? { click: () => setFocusedEventId(event.id) }
          : undefined;

        // FeatureCollection — obrysy budynków + pinezka nad nimi
        if (isValidFeatureCollection(event.geojson_segment)) {
          const fc = event.geojson_segment as GeoJsonFeatureCollection;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const onEachFeature = (feature: any, layer: L.Layer) => {
            const num: string | null = feature?.properties?.house_number ?? null;
            const label = num ? `${event.street_name} ${num}` : event.street_name;
            (layer as L.Path).bindTooltip(label, {
              permanent: false,
              direction: 'center',
              className: 'text-xs',
            });
            (layer as L.Path).bindPopup(
              `<div style="min-width:180px;font-size:13px">` +
              `<p style="font-weight:700;margin:0 0 4px">${TYPE_LABELS[event.event_type]}</p>` +
              `<p style="margin:0 0 4px">${label}</p>` +
              `<p style="margin:0;color:#6B7280;font-size:11px">${event.description ?? ''}</p>` +
              `</div>`
            );
          };
          return (
            <>
              <GeoJSON
                key={`fc-${event.id}`}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data={fc as any}
                style={{ color, fillColor: color, stroke: false, weight: 0, fillOpacity: 0.6 }}
                onEachFeature={onEachFeature}
              />
              <Marker
                key={`pin-${event.id}`}
                position={markerPos}
                icon={makeIcon(color)}
                eventHandlers={markerEvents}
              >
                {popup}
              </Marker>
            </>
          );
        }

        // Polyline — odcinek ulicy + pinezka
        if (Array.isArray(event.geojson_segment) && event.geojson_segment.length >= 2) {
          return (
            <>
              <Polyline
                key={`pl-${event.id}`}
                positions={event.geojson_segment}
                pathOptions={{ color, weight: 6, opacity: 0.85 }}
              >
                {popup}
              </Polyline>
              <Marker
                key={`pin-${event.id}`}
                position={markerPos}
                icon={makeIcon(color)}
                eventHandlers={markerEvents}
              >
                {popup}
              </Marker>
            </>
          );
        }

        // Tylko pinezka (street_geojson Point lub fallback centrum)
        return (
          <Marker
            key={event.id}
            position={markerPos}
            icon={makeIcon(color)}
            eventHandlers={markerEvents}
          >
            {popup}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
