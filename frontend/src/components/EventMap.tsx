import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
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

const ICON_SVGS: Record<EventItem['event_type'], string> = {
  awaria: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.73 18 13.73 3.99a2 2 0 0 0-3.46 0L2.27 18a2 2 0 0 0 1.73 3h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  planowane_wylaczenie: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>`,
  remont: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
};

const TYPE_COLORS: Record<EventItem['event_type'], string> = {
  awaria: '#DC2626',           // red-600
  planowane_wylaczenie: '#2563EB', // blue-600
  remont: '#D97706',           // amber-600
};

const TYPE_FILL_COLORS: Record<EventItem['event_type'], string> = {
  awaria: '#EF4444',           // red-500
  planowane_wylaczenie: '#3B82F6', // blue-500
  remont: '#F59E0B',           // amber-500
};

function makeIcon(eventType: EventItem['event_type']) {
  const color = TYPE_COLORS[eventType] ?? '#6B7280';
  const svg = ICON_SVGS[eventType] ?? ICON_SVGS.awaria;
  return L.divIcon({
    className: '',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 bg-white border-2 rounded-full shadow-md" style="border-color:${color};color:${color}">
        ${svg}
        <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]" style="border-top-color:${color}"></div>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
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
// Próg zoomu poniżej którego chowamy warstwy budynków (zostaje tylko pinezka)
// ---------------------------------------------------------------------------

const BUILDINGS_ZOOM_THRESHOLD = 15;

// ---------------------------------------------------------------------------
// ZoomAwareLayer — renderuje dzieci tylko przy wystarczającym zoomie
// ---------------------------------------------------------------------------

function ZoomAwareLayer({ children }: { children: React.ReactNode }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  if (zoom < BUILDINGS_ZOOM_THRESHOLD) return null;
  return <>{children}</>;
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

function MapLegend() {
  return (
    <div
      className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm shadow-md rounded-lg border border-border p-3 text-sm space-y-1.5 pointer-events-none"
      role="note"
      aria-label="Legenda mapy"
    >
      <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-1">
        Legenda
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full bg-red-600 border border-red-700" />
        <span>Awaria</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full bg-blue-600 border border-blue-700" />
        <span>Planowane wyłączenie</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full bg-amber-600 border border-amber-700" />
        <span>Remont</span>
      </div>
    </div>
  );
}

export function EventMap({ events, focusedEventId, setFocusedEventId }: Props) {
  return (
    <div className="relative w-full h-full">
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
        const color = TYPE_COLORS[event.event_type] ?? STATUS_COLORS[event.status] ?? '#6B7280';
        const fillColor = TYPE_FILL_COLORS[event.event_type] ?? color;

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

          // Budynki-punkty (geom_type='point') renderujemy jako CircleMarker
          // z kolorem awarii zamiast domyślnego niebieskiego markera Leaflet
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pointToLayer = (_feature: any, latlng: L.LatLng): L.Layer => {
            return L.circleMarker(latlng, {
              radius: 8,
              color,
              fillColor,
              weight: 2,
              fillOpacity: 0.8,
            });
          };

          return (
            <>
              <ZoomAwareLayer>
                <GeoJSON
                  key={`fc-${event.id}`}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data={fc as any}
                  style={{ color, fillColor, stroke: true, weight: 1.5, fillOpacity: 0.6 }}
                  onEachFeature={onEachFeature}
                  pointToLayer={pointToLayer}
                />
              </ZoomAwareLayer>
              <Marker
                key={`pin-${event.id}`}
                position={markerPos}
                icon={makeIcon(event.event_type)}
                eventHandlers={markerEvents}
                title={`Zdarzenie: ${event.street_name}`}
                alt={`Marker zdarzenia na ulicy ${event.street_name}`}
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
                icon={makeIcon(event.event_type)}
                eventHandlers={markerEvents}
                title={`Zdarzenie: ${event.street_name}`}
                alt={`Marker zdarzenia na ulicy ${event.street_name}`}
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
            icon={makeIcon(event.event_type)}
            eventHandlers={markerEvents}
            title={`Zdarzenie: ${event.street_name}`}
            alt={`Marker zdarzenia na ulicy ${event.street_name}`}
          >
            {popup}
          </Marker>
        );
      })}
    </MapContainer>
      <MapLegend />
    </div>
  );
}
