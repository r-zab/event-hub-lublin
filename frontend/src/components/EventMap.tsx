import { useEffect, useRef, useState, Fragment, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EventItem, GeoJsonFeatureCollection } from '@/data/mockData';
import { formatEventNumbers } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { LUBLIN_BOUNDS, MIN_ZOOM } from '@/lib/mapConfig';
import { useEventTypes, type EventTypeItem } from '@/hooks/useEventTypes';
import { resolveIconSvg } from '@/lib/eventTypeIcons';

interface Props {
  events: EventItem[];
  focusedEventId?: { id: number; trigger: number } | null;
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

const SVG_WRAPPER = (inner: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

function makeIcon(iconKey: string | null | undefined, color: string) {
  const inner = resolveIconSvg(iconKey);
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:white;border:2px solid ${color};border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)">
        ${SVG_WRAPPER(inner, color)}
        <div style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${color}"></div>
      </div>
    `,
    iconSize: [32, 39],
    iconAnchor: [16, 39],
    popupAnchor: [0, -39],
  });
}

/** Styl obrysu budynku zależny od statusu zdarzenia.
 *  Gdy status == 'usunieta', poligon staje się przezroczysty (powrót do koloru mapy). */
function getBuildingStyle(eventStatus: string, color: string): L.PathOptions {
  if (eventStatus === 'usunieta') {
    return { stroke: false, fillOpacity: 0, weight: 0 };
  }
  return { color, fillColor: color, stroke: true, weight: 1.5, fillOpacity: 0.6 };
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
  focusedEventId: { id: number; trigger: number } | null | undefined;
}

function MapController({ events, focusedEventId }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (focusedEventId == null) return;
    const event = events.find((e) => e.id === focusedEventId.id);
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
      // Dla zdarzeń zewnętrznych (bez poligonów i bez street_geojson) centrujemy na pinezce
      const [lat, lon] = getMarkerPosition(event);
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
// PopupAutoClose — zamyka aktywny popup mapy po 5 sekundach
// Używa useMapEvents (react-leaflet) + useRef, by uniknąć problemów z domknięciami.
// Obsługuje wszystkie typy popupów: <Popup> react-leaflet, bindPopup GeoJSON/Polyline.
// ---------------------------------------------------------------------------

function PopupAutoClose() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const map = useMapEvents({
    popupopen: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => map.closePopup(), 5000);
    },
    popupclose: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// EventMap
// ---------------------------------------------------------------------------

function MapLegend({ eventTypes }: { eventTypes: EventTypeItem[] }) {
  if (eventTypes.length === 0) return null;
  return (
    <div
      className="map-overlay-panel absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm shadow-md rounded-lg border border-border p-3 text-sm space-y-1.5 pointer-events-none"
      role="note"
      aria-label="Legenda mapy"
    >
      <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-1">
        Legenda
      </div>
      {eventTypes.map((t) => {
        const inner = resolveIconSvg(t.icon_key);
        return (
          <div key={t.code} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.default_color_rgb}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
              }}
            />
            <span>{t.name_pl}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EventMap({ events, focusedEventId, setFocusedEventId }: Props) {
  const { eventTypes } = useEventTypes();

  // Mapy: kod → kolor, nazwa, icon_key — odświeżane gdy zmieni się słownik
  const typeColorMap = useMemo(() => {
    const m = new Map<string, string>();
    eventTypes.forEach((t) => m.set(t.code, t.default_color_rgb));
    return m;
  }, [eventTypes]);

  const typeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    eventTypes.forEach((t) => m.set(t.code, t.name_pl));
    return m;
  }, [eventTypes]);

  const typeIconKeyMap = useMemo(() => {
    const m = new Map<string, string | null>();
    eventTypes.forEach((t) => m.set(t.code, t.icon_key));
    return m;
  }, [eventTypes]);

  // Legenda pokazuje tylko typy obecne wśród aktualnie widocznych zdarzeń
  const visibleEventTypes = useMemo(() => {
    const codes = new Set(events.map((e) => e.event_type));
    return eventTypes.filter((t) => codes.has(t.code));
  }, [events, eventTypes]);

  // Skrót statusów wszystkich zdarzeń — wymusza odtworzenie warstw GeoJSON
  // gdy status dowolnego zdarzenia zmieni się (np. → 'usunieta')
  const eventsFingerprint = useMemo(() => {
    let h = 5381;
    for (const e of events) {
      h = (((h << 5) + h) ^ (e.id * 31 + e.status.length)) >>> 0;
    }
    return h;
  }, [events]);

  const getColor = (code: string) => typeColorMap.get(code) ?? '#6B7280';
  const getName = (code: string) => typeNameMap.get(code) ?? code;
  const getIconKey = (code: string) => typeIconKeyMap.get(code) ?? null;

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
      <PopupAutoClose />

      {events.map((event) => {
        const color = getColor(event.event_type);
        const fillColor = color;

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

        const eventNumbers = formatEventNumbers(event);
        const popup = (
          <Popup>
            <div className="space-y-1 text-sm min-w-[180px]">
              <p className="font-bold">{getName(event.event_type)}</p>
              <p>{event.street_name}{eventNumbers ? ` ${eventNumbers}` : ''}</p>
              <StatusBadge status={event.status} />
              <p className="text-muted-foreground text-xs mt-1">{event.custom_message || event.description}</p>
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
              `<p style="font-weight:700;margin:0 0 4px">${getName(event.event_type)}</p>` +
              `<p style="margin:0 0 4px">${label}</p>` +
              `<p style="margin:0;color:#6B7280;font-size:11px">${event.custom_message || event.description || ''}</p>` +
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
            <Fragment key={`group-fc-${event.id}`}>
              <ZoomAwareLayer>
                <GeoJSON
                  key={`fc-${event.id}-${event.status}-${event.event_type}-${eventsFingerprint}`}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data={fc as any}
                  style={getBuildingStyle(event.status, color)}
                  onEachFeature={onEachFeature}
                  pointToLayer={pointToLayer}
                />
              </ZoomAwareLayer>
              <Marker
                key={`pin-${event.id}`}
                position={markerPos}
                icon={makeIcon(getIconKey(event.event_type), color)}
                eventHandlers={markerEvents}
                title={`Zdarzenie: ${event.street_name}`}
                alt={`Marker zdarzenia na ulicy ${event.street_name}`}
              >
                {popup}
              </Marker>
            </Fragment>
          );
        }

        // Polyline — odcinek ulicy + pinezka
        if (Array.isArray(event.geojson_segment) && event.geojson_segment.length >= 2) {
          return (
            <Fragment key={`group-pl-${event.id}`}>
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
                icon={makeIcon(getIconKey(event.event_type), color)}
                eventHandlers={markerEvents}
                title={`Zdarzenie: ${event.street_name}`}
                alt={`Marker zdarzenia na ulicy ${event.street_name}`}
              >
                {popup}
              </Marker>
            </Fragment>
          );
        }

        // Tylko pinezka (street_geojson Point lub fallback centrum)
        return (
          <Marker
            key={event.id}
            position={markerPos}
            icon={makeIcon(getIconKey(event.event_type), color)}
            eventHandlers={markerEvents}
            title={`Zdarzenie: ${event.street_name}`}
            alt={`Marker zdarzenia na ulicy ${event.street_name}`}
          >
            {popup}
          </Marker>
        );
      })}
    </MapContainer>
      <MapLegend eventTypes={visibleEventTypes} />
    </div>
  );
}
