import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin } from 'lucide-react';
import { LUBLIN_BOUNDS, MIN_ZOOM } from '@/lib/mapConfig';
import {
  useBuildings,
  type BuildingItem,
  type BoundsState,
} from '@/hooks/useBuildings';
import { BuildingAddressModal } from './BuildingAddressModal';

const LUBLIN_CENTER: [number, number] = [51.2465, 22.5684];
const BUILDINGS_MIN_ZOOM = 15;

// ---------------------------------------------------------------------------
// Style Leaflet dla warstwy budynków
// ---------------------------------------------------------------------------

const STYLE_HAS_ADDRESS: L.PathOptions = {
  color: '#16a34a',       // green-600
  fillColor: '#4ade80',   // green-400
  weight: 1,
  fillOpacity: 0.35,
  opacity: 0.8,
};

const STYLE_NO_ADDRESS: L.PathOptions = {
  color: '#dc2626',       // red-600
  fillColor: '#fca5a5',   // red-300
  weight: 1.5,
  fillOpacity: 0.5,
  opacity: 0.9,
};

const CIRCLE_HAS_ADDRESS: L.CircleMarkerOptions = {
  radius: 6,
  color: '#16a34a',
  fillColor: '#4ade80',
  weight: 1.5,
  fillOpacity: 0.8,
};

const CIRCLE_NO_ADDRESS: L.CircleMarkerOptions = {
  radius: 7,
  color: '#dc2626',
  fillColor: '#fca5a5',
  weight: 2,
  fillOpacity: 0.9,
};

// ---------------------------------------------------------------------------
// BoundsTracker — wewnętrzny komponent używający kontekstu mapy Leaflet
// ---------------------------------------------------------------------------

interface BoundsTrackerProps {
  onBoundsChange: (b: BoundsState) => void;
}

function BoundsTracker({ onBoundsChange }: BoundsTrackerProps) {
  const map = useMap();

  const update = useCallback(() => {
    const b = map.getBounds();
    onBoundsChange({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLon: b.getWest(),
      maxLon: b.getEast(),
      zoom: map.getZoom(),
    });
  }, [map, onBoundsChange]);

  useMapEvents({
    moveend: update,
    zoomend: update,
  });

  // Pobierz bounds przy pierwszym renderze
  useEffect(() => {
    update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// BuildingsLayer — renderuje GeoJSON budynków wewnątrz MapContainer
// ---------------------------------------------------------------------------

interface BuildingsLayerProps {
  buildings: BuildingItem[];
  onBuildingClick: (id: number) => void;
}

function BuildingsLayer({ buildings, onBuildingClick }: BuildingsLayerProps) {
  // Ref, żeby uniknąć stale closure w onEachFeature
  const clickHandlerRef = useRef(onBuildingClick);
  clickHandlerRef.current = onBuildingClick;

  const geoJson = useMemo(() => {
    const features = buildings.flatMap((b) => {
      const geometry = b.geom_type === 'polygon' ? b.geojson_polygon : b.geojson_point;
      if (!geometry) return [];
      return [
        {
          type: 'Feature' as const,
          geometry,
          properties: {
            id: b.id,
            street_name: b.street_name,
            house_number: b.house_number,
            has_address: b.has_address,
            geom_type: b.geom_type,
          },
        },
      ];
    });
    return { type: 'FeatureCollection' as const, features };
  }, [buildings]);

  // Klucz wymusza remount GeoJSON po zmianie zbioru budynków
  const layerKey = buildings.map((b) => b.id).join(',');

  const getStyle = useCallback((feature: GeoJSON.Feature | undefined): L.PathOptions => {
    return feature?.properties?.has_address ? STYLE_HAS_ADDRESS : STYLE_NO_ADDRESS;
  }, []);

  const pointToLayer = useCallback(
    (feature: GeoJSON.Feature, latlng: L.LatLng): L.Layer => {
      const opts = feature?.properties?.has_address ? CIRCLE_HAS_ADDRESS : CIRCLE_NO_ADDRESS;
      return L.circleMarker(latlng, opts);
    },
    [],
  );

  const onEachFeature = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    const props = feature.properties;
    if (!props) return;

    const hasAddress: boolean = props.has_address as boolean;
    const addressLabel = hasAddress
      ? `${props.street_name as string} ${props.house_number as string}`
      : 'Brak adresu — kliknij, aby uzupełnić';

    (layer as L.Path).bindTooltip(addressLabel, {
      sticky: true,
      className: 'text-xs font-medium',
    });

    if (!hasAddress) {
      layer.on('click', () => clickHandlerRef.current(props.id as number));
      (layer as L.Path).on('mouseover', function () {
        (this as L.Path).setStyle({ weight: 3, fillOpacity: 0.7 });
      });
      (layer as L.Path).on('mouseout', function () {
        (this as L.Path).setStyle(STYLE_NO_ADDRESS);
      });
    }
  }, []);

  if (geoJson.features.length === 0) return null;

  return (
    <GeoJSON
      key={layerKey}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={geoJson as any}
      style={getStyle}
      onEachFeature={onEachFeature}
      pointToLayer={pointToLayer}
    />
  );
}

// ---------------------------------------------------------------------------
// AdminMapView — komponent mapy dyspozytorskiej
// ---------------------------------------------------------------------------

export function AdminMapView() {
  const [bounds, setBounds] = useState<BoundsState | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  const { buildings, isLoading, error } = useBuildings(bounds, refetchTick);

  const handleBoundsChange = useCallback((b: BoundsState) => setBounds(b), []);

  const handleBuildingClick = useCallback((id: number) => {
    setSelectedBuildingId(id);
  }, []);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId],
  );

  const handleModalClose = useCallback(() => setSelectedBuildingId(null), []);
  const handleAddressSaved = useCallback(() => {
    setSelectedBuildingId(null);
    setRefetchTick((t) => t + 1);
  }, []);

  const currentZoom = bounds?.zoom ?? 0;
  const belowMinZoom = currentZoom < BUILDINGS_MIN_ZOOM && currentZoom > 0;

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
      <MapContainer
        center={LUBLIN_CENTER}
        zoom={15}
        scrollWheelZoom
        className="w-full h-full z-0"
        maxBounds={LUBLIN_BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={MIN_ZOOM}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <BoundsTracker onBoundsChange={handleBoundsChange} />

        {!belowMinZoom && (
          <BuildingsLayer
            buildings={buildings}
            onBuildingClick={handleBuildingClick}
          />
        )}
      </MapContainer>

      {/* Legenda */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm shadow-md rounded-lg border border-border p-3 text-sm space-y-1.5 pointer-events-none">
        <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-1">
          Legenda budynków
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-400 border border-green-600" />
          <span>Ma adres</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-300 border border-red-600" />
          <span>Brak adresu (kliknij)</span>
        </div>
      </div>

      {/* Hint: za mały zoom */}
      {belowMinZoom && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm border border-border rounded-xl shadow-lg px-6 py-4 flex items-center gap-3 max-w-xs text-center">
            <MapPin className="h-6 w-6 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Przybliż mapę do poziomu{' '}
              <span className="font-semibold text-foreground">{BUILDINGS_MIN_ZOOM}</span>, aby
              zobaczyć budynki.
            </p>
          </div>
        </div>
      )}

      {/* Loader */}
      {isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] bg-white/90 border border-border rounded-full px-4 py-2 flex items-center gap-2 shadow-sm text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Ładowanie budynków…</span>
        </div>
      )}

      {/* Błąd */}
      {error && !isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] bg-destructive/10 border border-destructive/40 text-destructive rounded-lg px-4 py-2 text-sm shadow-sm">
          {error}
        </div>
      )}

      {/* Licznik */}
      {!belowMinZoom && !isLoading && buildings.length > 0 && (
        <div className="absolute top-4 right-4 z-[1001] bg-white/90 border border-border rounded-full px-3 py-1 text-xs text-muted-foreground shadow-sm">
          {buildings.length} budynków
        </div>
      )}

      <BuildingAddressModal
        building={selectedBuilding}
        onClose={handleModalClose}
        onSaved={handleAddressSaved}
      />
    </div>
  );
}
