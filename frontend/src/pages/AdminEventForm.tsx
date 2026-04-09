import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStreets } from '@/hooks/useStreets';
import { apiFetch } from '@/lib/api';
import { getEvent, updateEvent } from '@/hooks/useEvents';
import { type Street } from '@/data/mockData';
import { Search, Loader2, MapPin } from 'lucide-react';

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

interface BuildingItem {
  id: number;
  house_number: string | null;
  geojson_polygon: object | null;
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: object;
  properties: { id: number; house_number: string | null };
}

// ---------------------------------------------------------------------------
// Pomocniczy komponent: dopasowuje widok mapy do granic załadowanych budynków
// ---------------------------------------------------------------------------

function FitBounds({ features }: { features: GeoJsonFeature[] }) {
  const map = useMap();
  useEffect(() => {
    if (features.length === 0) return;
    try {
      const fc = { type: 'FeatureCollection' as const, features };
      const layer = L.geoJSON(fc as Parameters<typeof L.geoJSON>[0]);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // puste polygony / brak koordynatów — ignoruj
    }
  }, [features, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Komponent GeoJSON z dynamicznym stylem — re-renderuje się gdy zmieni się
// zestaw zaznaczonych ID (key zmienia się przy każdym toggle)
// ---------------------------------------------------------------------------

interface BuildingLayerProps {
  features: GeoJsonFeature[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  renderKey: string;
}

function BuildingLayer({ features, selectedIds, onToggle, renderKey }: BuildingLayerProps) {
  const fc = useMemo(
    () => ({ type: 'FeatureCollection' as const, features }),
    [features],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = useCallback((feature?: any) => {
    const id: number | undefined = feature?.properties?.id;
    const selected = id !== undefined && selectedIds.has(id);
    return {
      color: selected ? '#EF4444' : '#3B82F6',
      fillColor: selected ? '#EF4444' : '#93C5FD',
      weight: selected ? 2.5 : 1,
      fillOpacity: selected ? 0.6 : 0.25,
      opacity: 0.9,
    };
  }, [selectedIds]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const id: number = feature?.properties?.id;
    const num: string | null = feature?.properties?.house_number ?? null;
    if (num) {
      (layer as L.Path).bindTooltip(num, {
        permanent: false,
        direction: 'center',
        className: 'text-xs font-semibold',
      });
    }
    layer.on('click', () => onToggle(id));
  }, [onToggle]);

  return (
    <GeoJSON
      key={renderKey}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={fc as any}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}

// ---------------------------------------------------------------------------
// Główny formularz
// ---------------------------------------------------------------------------

const LUBLIN_CENTER: [number, number] = [51.2465, 22.5684];

const AdminEventForm = () => {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();

  // Pola formularza
  const [eventType, setEventType] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [streetQuery, setStreetQuery] = useState('');
  const [houseFrom, setHouseFrom] = useState('');
  const [houseTo, setHouseTo] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('zgloszona');
  const [estimatedEnd, setEstimatedEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEvent, setIsLoadingEvent] = useState(isEdit);

  // Budynki + zaznaczanie
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<Set<number>>(new Set());

  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { streets: suggestions, isLoading: streetsLoading } = useStreets(streetQuery);

  // Ładowanie zdarzenia przy edycji
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    setIsLoadingEvent(true);
    getEvent(Number(id))
      .then((event) => {
        if (cancelled) return;
        setEventType(event.event_type);
        setHouseFrom(event.house_number_from ?? '');
        setHouseTo(event.house_number_to ?? '');
        setDescription(event.description ?? '');
        setStatus(event.status);
        if (event.estimated_end) setEstimatedEnd(event.estimated_end.slice(0, 16));
        setStreetQuery(event.street_name);
        if (event.street_id) {
          setSelectedStreet({
            id: event.street_id,
            name: event.street_name,
            full_name: event.street_name,
            teryt_sym_ul: '',
            street_type: '',
            city: 'Lublin',
          });
        }
      })
      .catch((err: unknown) => {
        toast({
          title: 'Błąd ładowania',
          description: (err as Error).message || 'Nie udało się pobrać danych zdarzenia.',
          variant: 'destructive',
        });
        navigate('/admin/dashboard');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEvent(false);
      });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pobieranie budynków gdy zmienia się ulica
  useEffect(() => {
    if (!selectedStreet) {
      setBuildings([]);
      setSelectedBuildingIds(new Set());
      return;
    }
    let cancelled = false;
    setBuildingsLoading(true);
    apiFetch<BuildingItem[]>(`/streets/${selectedStreet.id}/buildings`)
      .then((data) => { if (!cancelled) setBuildings(data ?? []); })
      .catch(() => { if (!cancelled) setBuildings([]); })
      .finally(() => { if (!cancelled) setBuildingsLoading(false); });
    setSelectedBuildingIds(new Set());
    return () => { cancelled = true; };
  }, [selectedStreet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zamykanie podpowiedzi ulicy po kliknięciu poza
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Dane do warstwy GeoJSON (tylko budynki z poligonem)
  const buildingFeatures = useMemo<GeoJsonFeature[]>(
    () =>
      buildings
        .filter((b) => b.geojson_polygon !== null)
        .map((b) => ({
          type: 'Feature',
          geometry: b.geojson_polygon!,
          properties: { id: b.id, house_number: b.house_number },
        })),
    [buildings],
  );

  // Klucz do wymuszenia re-renderu GeoJSON przy zmianie zaznaczenia
  const buildingLayerKey = useMemo(
    () => Array.from(selectedBuildingIds).sort().join(',') || 'none',
    [selectedBuildingIds],
  );

  const toggleBuilding = useCallback((id: number) => {
    setSelectedBuildingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleStreetChange = (v: string) => {
    setStreetQuery(v);
    if (!v) setSelectedStreet(null);
    setShowSuggestions(v.length >= 3);
  };

  const selectStreet = (s: Street) => {
    setSelectedStreet(s);
    setStreetQuery(`${s.street_type} ${s.full_name}`);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStreet) {
      toast({
        title: 'Wybierz ulicę',
        description: 'Wpisz min. 3 znaki i wybierz ulicę z listy.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);

    // Buduj geojson_segment z zaznaczonych budynków
    const selectedFeatures = buildingFeatures.filter((f) =>
      selectedBuildingIds.has(f.properties.id),
    );
    const geojson_segment =
      selectedFeatures.length > 0
        ? {
            type: 'FeatureCollection' as const,
            features: selectedFeatures,
          }
        : null;

    const payload = {
      event_type: eventType,
      street_id: selectedStreet.id,
      street_name: selectedStreet.full_name,
      house_number_from: houseFrom,
      house_number_to: houseTo,
      description,
      status: status || 'zgloszona',
      estimated_end: estimatedEnd || null,
      geojson_segment,
    };

    try {
      if (isEdit && id) {
        await updateEvent(Number(id), payload);
        toast({ title: 'Zdarzenie zaktualizowane', description: 'Zmiany zostały zapisane.' });
      } else {
        await apiFetch('/events', { method: 'POST', body: JSON.stringify(payload) });
        toast({
          title: 'Zdarzenie utworzone',
          description: 'Powiadomienia zostaną wysłane do mieszkańców.',
        });
      }
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      toast({
        title: 'Błąd',
        description: (err as Error).message || 'Nie udało się zapisać zdarzenia.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingEvent) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showMap = !!selectedStreet;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">
        {isEdit ? `Edytuj zdarzenie #${id}` : 'Nowe zdarzenie'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Typ zdarzenia */}
        <div>
          <Label>Typ zdarzenia *</Label>
          <Select value={eventType} onValueChange={setEventType} required>
            <SelectTrigger aria-label="Typ zdarzenia">
              <SelectValue placeholder="Wybierz typ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="awaria">Awaria</SelectItem>
              <SelectItem value="planowane_wylaczenie">Planowane wyłączenie</SelectItem>
              <SelectItem value="remont">Remont</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Autocomplete ulicy */}
        <div className="relative" ref={wrapperRef}>
          <Label>
            Ulica * <span className="text-xs text-muted-foreground">(min. 3 znaki)</span>
          </Label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={streetQuery}
              onChange={(e) => handleStreetChange(e.target.value)}
              onFocus={() =>
                streetQuery.length >= 3 && suggestions.length > 0 && setShowSuggestions(true)
              }
              placeholder="Wpisz nazwę ulicy (np. Lipowa)..."
              className="pl-9"
              required
              aria-label="Nazwa ulicy"
            />
            {streetsLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul
              className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
              role="listbox"
            >
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={selectedStreet?.id === s.id}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => selectStreet(s)}
                >
                  <span className="font-medium">
                    {s.street_type} {s.full_name}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
                </li>
              ))}
            </ul>
          )}
          {selectedStreet && (
            <p className="text-xs text-muted-foreground mt-1">
              Wybrano: {selectedStreet.street_type} {selectedStreet.full_name} (ID:{' '}
              {selectedStreet.id})
            </p>
          )}
        </div>

        {/* Mapa z obrysami budynków */}
        {showMap && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Label>
                Zaznacz budynki objęte awarią
                <span className="text-xs text-muted-foreground ml-2">(kliknij budynek na mapie)</span>
              </Label>
            </div>

            {buildingsLoading ? (
              <div className="flex items-center justify-center h-40 rounded-md border border-border bg-muted/20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Ładowanie obrysów budynków…</span>
              </div>
            ) : buildingFeatures.length === 0 ? (
              <div className="flex items-center justify-center h-24 rounded-md border border-border bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  Brak obrysów budynków dla tej ulicy w bazie danych.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md overflow-hidden border border-border">
                  <MapContainer
                    center={LUBLIN_CENTER}
                    zoom={16}
                    scrollWheelZoom
                    className="w-full h-[380px] z-0"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FitBounds features={buildingFeatures} />
                    <BuildingLayer
                      features={buildingFeatures}
                      selectedIds={selectedBuildingIds}
                      onToggle={toggleBuilding}
                      renderKey={buildingLayerKey}
                    />
                  </MapContainer>
                </div>
                <p className="text-xs text-muted-foreground">
                  Budynki z obrysami: {buildingFeatures.length} •{' '}
                  <span className="text-red-500 font-medium">
                    Zaznaczono: {selectedBuildingIds.size}
                  </span>
                  {selectedBuildingIds.size > 0 && (
                    <button
                      type="button"
                      className="ml-3 underline text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedBuildingIds(new Set())}
                    >
                      Wyczyść zaznaczenie
                    </button>
                  )}
                </p>
              </>
            )}
          </div>
        )}

        {/* Numery posesji */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="house-from">Nr posesji od *</Label>
            <Input
              id="house-from"
              value={houseFrom}
              onChange={(e) => setHouseFrom(e.target.value)}
              placeholder="10"
              required
              aria-label="Numer posesji od"
            />
          </div>
          <div>
            <Label htmlFor="house-to">Nr posesji do *</Label>
            <Input
              id="house-to"
              value={houseTo}
              onChange={(e) => setHouseTo(e.target.value)}
              placeholder="15"
              required
              aria-label="Numer posesji do"
            />
          </div>
        </div>

        {/* Opis */}
        <div>
          <Label htmlFor="desc">Opis</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opis zdarzenia..."
            rows={4}
            aria-label="Opis zdarzenia"
          />
        </div>

        {/* Status */}
        <div>
          <Label>Status *</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Status zdarzenia">
              <SelectValue placeholder="Wybierz status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zgloszona">Zgłoszona</SelectItem>
              <SelectItem value="w_naprawie">W naprawie</SelectItem>
              <SelectItem value="usunieta">Usunięta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Szacowany czas */}
        <div>
          <Label htmlFor="est-end">Szacowany czas usunięcia</Label>
          <Input
            id="est-end"
            type="datetime-local"
            value={estimatedEnd}
            onChange={(e) => setEstimatedEnd(e.target.value)}
            aria-label="Szacowany czas zakończenia"
          />
        </div>

        {/* Przyciski */}
        <div className="flex gap-3">
          <Button
            type="submit"
            size="lg"
            className="flex-1 font-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Zapisywanie…
              </>
            ) : isEdit ? (
              'Zapisz zmiany'
            ) : (
              'Zapisz i powiadom mieszkańców'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => navigate('/admin/dashboard')}
          >
            Anuluj
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminEventForm;
