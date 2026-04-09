import { MapContainer, TileLayer, Polyline, Popup, Marker, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EventItem, GeoJsonFeatureCollection, STATUS_LABELS, TYPE_LABELS } from '@/data/mockData';
import { StatusBadge } from './StatusBadge';

const STATUS_COLORS: Record<string, string> = {
  zgloszona: '#EF4444',
  w_naprawie: '#F59E0B',
  usunieta: '#10B981',
  planowane_wylaczenie: '#3B82F6',
  remont: '#8B5CF6',
};

interface Props {
  events: EventItem[];
}

const LUBLIN_CENTER: [number, number] = [51.2465, 22.5684];

// Simple circle icon for events without geojson
function makeIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function EventMap({ events }: Props) {
  return (
    <MapContainer
      center={LUBLIN_CENTER}
      zoom={14}
      scrollWheelZoom={true}
      className="w-full h-[350px] sm:h-[500px] z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {events.map((event) => {
        const color = STATUS_COLORS[event.status] ?? '#6B7280';
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

        // Nowy format: FeatureCollection z obrysami budynków
        if (
          event.geojson_segment &&
          !Array.isArray(event.geojson_segment) &&
          (event.geojson_segment as GeoJsonFeatureCollection).type === 'FeatureCollection'
        ) {
          const fc = event.geojson_segment as GeoJsonFeatureCollection;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const onEachFeature = (feature: any, layer: L.Layer) => {
            const num: string | null = feature?.properties?.house_number ?? null;
            if (num) {
              (layer as L.Path).bindTooltip(`${event.street_name} ${num}`, {
                permanent: false,
                direction: 'center',
                className: 'text-xs',
              });
            }
          };
          return (
            <GeoJSON
              key={event.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={fc as any}
              style={{ color, fillColor: color, weight: 2, fillOpacity: 0.5 }}
              onEachFeature={onEachFeature}
            >
              {popup}
            </GeoJSON>
          );
        }

        // Stary format: tablica współrzędnych dla Polyline
        if (Array.isArray(event.geojson_segment) && event.geojson_segment.length >= 2) {
          return (
            <Polyline
              key={event.id}
              positions={event.geojson_segment}
              pathOptions={{ color, weight: 6, opacity: 0.85 }}
            >
              {popup}
            </Polyline>
          );
        }

        // GeoJSON Point z geokodowania Nominatim: [longitude, latitude] → Leaflet: [latitude, longitude]
        if (event.street_geojson?.type === 'Point') {
          const [lon, lat] = event.street_geojson.coordinates;
          return (
            <Marker key={event.id} position={[lat, lon]} icon={makeIcon(color)}>
              {popup}
            </Marker>
          );
        }

        // Ostatni fallback: centrum Lublina (brak współrzędnych)
        return (
          <Marker key={event.id} position={LUBLIN_CENTER} icon={makeIcon(color)}>
            {popup}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
