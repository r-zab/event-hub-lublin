import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useStreets } from '@/hooks/useStreets';
import { apiFetch } from '@/lib/api';
import { getEvent, updateEvent } from '@/hooks/useEvents';
import { type Street } from '@/data/mockData';
import { toLocalISO, toUTCISO, streetLabel } from '@/lib/utils';
import { LUBLIN_BOUNDS, MIN_ZOOM } from '@/lib/mapConfig';
import { Search, Loader2, MapPin, Plus, X, Send } from 'lucide-react';

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

interface BuildingItem {
  id: number;
  house_number: string | null;
  geom_type: string;
  geojson_polygon: object | null;
  geojson_point: object | null;
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: object;
  properties: { id: number; house_number: string | null };
}

interface QueueItem {
  _id: string;
  event_type: string;
  street_id: number;
  street_name: string;
  street_type: string;
  house_number_from: string;
  house_number_to: string;
  description: string;
  status: string;
  start_time: string | null;
  estimated_end: string | null;
  geojson_segment: object | null;
  custom_message: string;
  displayLabel: string;
}

// ---------------------------------------------------------------------------
// Typy pomocnicze podglądu
// ---------------------------------------------------------------------------

interface InitialEventData {
  status: string;
  estimatedEnd: string;
  description: string;
}

const STATUS_PREVIEW_LABELS: Record<string, string> = {
  zgloszona: 'Zgłoszona',
  w_naprawie: 'W naprawie',
  usunieta: 'Usunięta',
};

// ---------------------------------------------------------------------------
// Helpers — alfanumeryczne sortowanie numerów posesji
// ---------------------------------------------------------------------------

function parseHouseNumber(raw: string): [number, string] {
  const normalized = raw.trim().toUpperCase();
  const match = normalized.match(/^(\d+)([A-Z]?)$/);
  if (match) return [parseInt(match[1], 10), match[2]];
  return [0, normalized];
}

function isInRange(num: string, from: string, to: string): boolean {
  const [n, l] = parseHouseNumber(num);
  if (from) {
    const [fn, fl] = parseHouseNumber(from);
    if (n < fn || (n === fn && l < fl)) return false;
  }
  if (to) {
    const [tn, tl] = parseHouseNumber(to);
    if (n > tn || (n === tn && l > tl)) return false;
  }
  return true;
}

function sortHouseNumbers(nums: string[]): string[] {
  return [...nums].sort((a, b) => {
    const [an, al] = parseHouseNumber(a);
    const [bn, bl] = parseHouseNumber(b);
    if (an !== bn) return an - bn;
    return al.localeCompare(bl);
  });
}

// Wyświetla dokładną listę wybranych numerów bez fałszywych zakresów
function formatBuildingNumbers(nums: string[]): string {
  if (nums.length === 0) return 'wszystkie budynki';
  return `nr ${sortHouseNumbers(nums).join(', ')}`;
}

function buildDisplayLabel(houseFrom: string, houseTo: string, selectedNums: string[]): string {
  if (selectedNums.length > 0) return formatBuildingNumbers(selectedNums);
  if (houseFrom || houseTo) return `nr ${houseFrom || '?'}–${houseTo || '?'}`;
  return 'wszystkie budynki';
}

// Skrócony opis adresów do SMS — zapobiega "ścianie tekstu" przy setkach numerów
function buildShortAddressLabel(houseFrom: string, houseTo: string, selectedNums: string[]): string {
  if (selectedNums.length === 0) {
    if (houseFrom || houseTo) return `nr ${houseFrom || '?'}-${houseTo || '?'}`;
    return '';
  }
  if (selectedNums.length <= 5) return `nr ${selectedNums.join(', ')}`;
  return `nr ${selectedNums[0]}-${selectedNums[selectedNums.length - 1]}`;
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
// Warstwa GeoJSON z dynamicznym stylem
// ---------------------------------------------------------------------------

interface BuildingLayerProps {
  features: GeoJsonFeature[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  renderKey: string;
  streetName: string;
}

function BuildingLayer({ features, selectedIds, onToggle, renderKey, streetName }: BuildingLayerProps) {
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
      const label = streetName ? `${streetName} ${num}` : num;
      (layer as L.Path).bindTooltip(label, {
        permanent: false,
        direction: 'center',
        className: 'text-xs font-semibold',
      });
    }
    layer.on('click', () => onToggle(id));
  }, [onToggle, streetName]);

  // Budynki-punkty renderujemy jako CircleMarker z tym samym kolorem co poligony
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointToLayer = useCallback((feature: any, latlng: L.LatLng): L.Layer => {
    const id: number | undefined = feature?.properties?.id;
    const selected = id !== undefined && selectedIds.has(id);
    return L.circleMarker(latlng, {
      radius: 8,
      color: selected ? '#EF4444' : '#3B82F6',
      fillColor: selected ? '#EF4444' : '#93C5FD',
      weight: selected ? 2.5 : 1,
      fillOpacity: selected ? 0.8 : 0.4,
      opacity: 0.9,
    });
  }, [selectedIds]);

  return (
    <GeoJSON
      key={renderKey}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={fc as any}
      style={style}
      onEachFeature={onEachFeature}
      pointToLayer={pointToLayer}
    />
  );
}

// ---------------------------------------------------------------------------
// Komponent koszyka — pojedynczy element kolejki
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  awaria: 'Awaria',
  planowane_wylaczenie: 'Planowe wył.',
  remont: 'Remont',
};

function QueueCard({ item, onRemove }: { item: QueueItem; onRemove: () => void }) {
  return (
    <div className="flex items-start justify-between rounded-md bg-card border border-border px-3 py-2.5 text-sm gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <Badge variant="outline" className="shrink-0 mt-0.5 text-xs">
          {TYPE_LABELS[item.event_type] ?? item.event_type}
        </Badge>
        <div className="min-w-0">
          <p className="font-medium truncate">
            {streetLabel(item.street_type, item.street_name)}
          </p>
          <p className="text-xs text-muted-foreground">{item.displayLabel}</p>
          {item.description && (
            <p className="text-xs text-muted-foreground italic truncate">{item.description}</p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Usuń z kolejki"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
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

  // --- Pola formularza ---
  const [eventType, setEventType] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [streetQuery, setStreetQuery] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('zgloszona');
  const [startTime, setStartTime] = useState('');
  const [estimatedEnd, setEstimatedEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEvent, setIsLoadingEvent] = useState(isEdit);

  // --- Budynki ---
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<Set<number>>(new Set());

  // --- Zakładki wyboru zakresu ---
  const [activeTab, setActiveTab] = useState('map');
  const [houseFrom, setHouseFrom] = useState('');
  const [houseTo, setHouseTo] = useState('');
  const [listInput, setListInput] = useState('');

  // Źródło ostatniej zmiany zaznaczenia — zapobiega cyklicznym aktualizacjom
  const selectionSourceRef = useRef<'map' | 'range' | 'list'>('map');

  // --- Walidacja numeru budynku ---
  const [houseFromError, setHouseFromError] = useState<string | null>(null);
  const [showHouseFromDropdown, setShowHouseFromDropdown] = useState(false);
  const houseFromWrapperRef = useRef<HTMLDivElement>(null);
  const [showHouseToDropdown, setShowHouseToDropdown] = useState(false);
  const houseToWrapperRef = useRef<HTMLDivElement>(null);

  // --- Walidacja dat ---
  const [dateFieldError, setDateFieldError] = useState<'start_time' | 'estimated_end' | 'both' | null>(null);

  // --- Edytowalna treść powiadomienia ---
  const [customMessage, setCustomMessage] = useState('');
  const [isMessageEdited, setIsMessageEdited] = useState(false);
  // Oryginalne wartości z bazy — do wykrycia scenariusza powiadomienia przy edycji
  const [initialData, setInitialData] = useState<InitialEventData | null>(null);

  // --- Kolejka (bulk) ---
  const [eventsQueue, setEventsQueue] = useState<QueueItem[]>([]);

  // --- Autocomplete ---
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { streets: suggestions, isLoading: streetsLoading } = useStreets(streetQuery);

  // IDs budynków do przywrócenia przy edycji (synchronizacja timingu ładowania)
  const pendingRestoreIdsRef = useRef<number[] | null>(null);

  // ---------------------------------------------------------------------------
  // Parser błędów 422 z FastAPI / Pydantic
  // ---------------------------------------------------------------------------

  const handle422Error = useCallback((rawMessage: string) => {
    // Mapa surowych komunikatów Pydantic → przyjazne polskie opisy
    const MSG_MAP: Array<[RegExp, string]> = [
      [/czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia/i,
        'Błąd daty: Czas zakończenia musi być późniejszy niż czas rozpoczęcia prac.'],
      [/czas zakończenia nie może być wcześniejszy niż aktualna godzina/i,
        'Błąd daty: Czas zakończenia nie może być w przeszłości.'],
      [/czas rozpoczęcia prac planowanych nie może być datą wsteczną/i,
        'Błąd daty: Czas rozpoczęcia prac planowanych nie może być w przeszłości.'],
      [/estimated_end must be after start_time/i,
        'Błąd daty: Czas zakończenia musi być późniejszy niż czas rozpoczęcia.'],
      [/start_time.*past/i,
        'Błąd daty: Czas rozpoczęcia nie może być w przeszłości.'],
    ];

    const translate = (msg: string): string => {
      const clean = msg.replace(/^Value error,\s*/i, '').trim();
      for (const [pattern, translation] of MSG_MAP) {
        if (pattern.test(clean)) return translation;
      }
      return clean;
    };

    try {
      const parsed: { detail?: Array<{ msg?: string; loc?: (string | number)[] }> } = JSON.parse(rawMessage);
      if (!parsed.detail || !Array.isArray(parsed.detail)) return false;

      const messages = parsed.detail.map((e) => translate(e.msg ?? '')).filter(Boolean);
      if (messages.length === 0) return false;

      // Wykryj których pól dotyczą błędy
      const locs = parsed.detail.flatMap((e) => (e.loc ?? []).map(String));
      const raw = parsed.detail.map((e) => (e.msg ?? '').toLowerCase());
      const affectsStart = locs.includes('start_time') ||
        raw.some((m) => m.includes('rozpoczęci') || m.includes('wsteczną') || m.includes('start_time'));
      const affectsEnd = locs.includes('estimated_end') ||
        raw.some((m) => m.includes('zakończeni') || m.includes('zakończenia') || m.includes('estimated_end'));
      const affectsBoth = raw.some((m) => m.includes('rozpoczęcia') && m.includes('zakończenia'));

      if (affectsBoth || (affectsStart && affectsEnd)) setDateFieldError('both');
      else if (affectsStart) setDateFieldError('start_time');
      else if (affectsEnd) setDateFieldError('estimated_end');

      toast({
        title: 'Błąd walidacji',
        description: messages.join(' '),
        variant: 'destructive',
      });
      return true;
    } catch {
      return false;
    }
  }, [toast]);

  // ---------------------------------------------------------------------------
  // Ładowanie zdarzenia przy edycji
  // ---------------------------------------------------------------------------

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
        setStartTime(event.start_time ? toLocalISO(event.start_time) : '');
        setEstimatedEnd(event.estimated_end ? toLocalISO(event.estimated_end) : '');
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
        // Zapamiętaj oryginalne wartości z bazy — do wykrywania scenariusza przy podglądzie
        setInitialData({
          status: event.status,
          estimatedEnd: event.estimated_end ? toLocalISO(event.estimated_end) : '',
          description: event.description ?? '',
        });
        // Przywróć zaznaczenie budynków z geojson_segment (jeśli FeatureCollection)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const seg = event.geojson_segment as any;
        if (seg?.type === 'FeatureCollection' && Array.isArray(seg.features)) {
          const ids = seg.features
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((f: any) => f?.properties?.id)
            .filter((x: unknown): x is number => typeof x === 'number');
          if (ids.length > 0) pendingRestoreIdsRef.current = ids;
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
      .finally(() => { if (!cancelled) setIsLoadingEvent(false); });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Pobieranie budynków gdy zmienia się ulica
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedStreet) {
      setBuildings([]);
      setSelectedBuildingIds(new Set());
      setListInput('');
      setHouseFromError(null);
      setShowHouseFromDropdown(false);
      return;
    }
    let cancelled = false;
    setBuildingsLoading(true);
    apiFetch<BuildingItem[]>(`/streets/${selectedStreet.id}/buildings`)
      .then((data) => {
        if (cancelled) return;
        setBuildings(data ?? []);
        // Przywróć zaznaczenie z edytowanego zdarzenia (timing fix)
        if (pendingRestoreIdsRef.current) {
          selectionSourceRef.current = 'map';
          setSelectedBuildingIds(new Set(pendingRestoreIdsRef.current));
          pendingRestoreIdsRef.current = null;
        } else {
          setSelectedBuildingIds(new Set());
        }
      })
      .catch(() => { if (!cancelled) setBuildings([]); })
      .finally(() => { if (!cancelled) setBuildingsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedStreet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Synchronizacja: selectedBuildingIds → listInput + houseFrom/houseTo
  // Logika źródeł:
  //   'map'   → aktualizuje listInput + houseFrom/houseTo
  //   'range' → aktualizuje tylko listInput (houseFrom/houseTo wpisał user)
  //   'list'  → aktualizuje tylko houseFrom/houseTo (listInput wpisał user)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const nums = buildings
      .filter((b) => selectedBuildingIds.has(b.id) && b.house_number)
      .map((b) => b.house_number!);
    const sorted = sortHouseNumbers(nums);

    if (selectionSourceRef.current !== 'list') {
      setListInput(sorted.join(', '));
    }
    if (selectionSourceRef.current !== 'range' && sorted.length > 0) {
      setHouseFrom(sorted[0]);
      setHouseTo(sorted[sorted.length - 1]);
    }
  }, [selectedBuildingIds, buildings]);

  // ---------------------------------------------------------------------------
  // Zamknij dropdown autocomplete po kliknięciu poza
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowSuggestions(false);
      if (houseFromWrapperRef.current && !houseFromWrapperRef.current.contains(e.target as Node))
        setShowHouseFromDropdown(false);
      if (houseToWrapperRef.current && !houseToWrapperRef.current.contains(e.target as Node))
        setShowHouseToDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);


  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const buildingFeatures = useMemo<GeoJsonFeature[]>(
    () =>
      buildings.flatMap((b) => {
        // Poligon — preferowany
        if (b.geojson_polygon !== null) {
          return [{
            type: 'Feature' as const,
            geometry: b.geojson_polygon,
            properties: { id: b.id, house_number: b.house_number, geom_type: b.geom_type },
          }];
        }
        // Punkt — gdy brak poligonu (geom_type='point', np. adresy z OSM nodes)
        if (b.geojson_point !== null) {
          return [{
            type: 'Feature' as const,
            geometry: b.geojson_point,
            properties: { id: b.id, house_number: b.house_number, geom_type: b.geom_type },
          }];
        }
        return [];
      }),
    [buildings],
  );

  const buildingLayerKey = useMemo(
    () => Array.from(selectedBuildingIds).sort().join(',') || 'none',
    [selectedBuildingIds],
  );

  const selectedNums = useMemo(
    () =>
      sortHouseNumbers(
        buildings
          .filter((b) => selectedBuildingIds.has(b.id) && b.house_number)
          .map((b) => b.house_number!),
      ),
    [buildings, selectedBuildingIds],
  );

  const availableHouseNumbers = useMemo(
    () => sortHouseNumbers(buildings.filter((b) => b.house_number).map((b) => b.house_number!)),
    [buildings],
  );

  const filteredFromNumbers = useMemo(
    () =>
      availableHouseNumbers.filter(
        (n) => !houseFrom || n.toUpperCase().startsWith(houseFrom.trim().toUpperCase()),
      ),
    [availableHouseNumbers, houseFrom],
  );

  const filteredToNumbers = useMemo(
    () =>
      availableHouseNumbers.filter(
        (n) => !houseTo || n.toUpperCase().startsWith(houseTo.trim().toUpperCase()),
      ),
    [availableHouseNumbers, houseTo],
  );

  // ---------------------------------------------------------------------------
  // Auto-generowanie treści powiadomienia — inteligentne scenariusze
  // Scenariusz wykrywany na podstawie porównania z initialData (oryginalne wartości z DB).
  // Uruchamia się tylko gdy dyspozytor nie edytował treści ręcznie.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isMessageEdited) return;
    if (!eventType) { setCustomMessage(''); return; }

    const fmtLocal = (localStr: string) =>
      new Date(localStr).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

    const addrPart = buildShortAddressLabel(houseFrom, houseTo, selectedNums);
    const streetName = selectedStreet
      ? (selectedStreet.full_name || selectedStreet.name || streetQuery)
      : null;
    // Adres wyświetlany — placeholder gdy ulica jeszcze nie wybrana
    const addrDisplay = streetName
      ? `ul. ${streetName}${addrPart ? ` ${addrPart}` : ''}`
      : '[Adres]';

    // Wykryj scenariusz na podstawie zmian względem oryginalnych danych z bazy
    const isStatusChange = isEdit && initialData !== null && status !== initialData.status;
    const isTimeOrDescUpdate = isEdit && initialData !== null
      && status === initialData.status
      && (estimatedEnd !== initialData.estimatedEnd || description !== initialData.description);

    let msg: string;

    if (isStatusChange) {
      // Zmiana statusu → informacja o nowym statusie
      const oldLabel = STATUS_PREVIEW_LABELS[initialData!.status] ?? initialData!.status;
      const newLabel = STATUS_PREVIEW_LABELS[status] ?? status;
      const parts = [`${addrDisplay}: Status zgłoszenia zmienił się z "${oldLabel}" na "${newLabel}"`];
      if (eventType === 'planowane_wylaczenie') {
        if (startTime) parts.push(`Od: ${fmtLocal(startTime)}`);
        if (estimatedEnd) parts.push(`Do: ${fmtLocal(estimatedEnd)}`);
      } else {
        if (estimatedEnd) parts.push(`Szacowany czas naprawy: ${fmtLocal(estimatedEnd)}`);
      }
      parts.push('Przepraszamy za utrudnienia. MPWiK Lublin tel. 994');
      msg = parts.join('. ');

    } else if (isTimeOrDescUpdate) {
      // Bez zmiany statusu, zmienił się czas lub opis → Aktualizacja
      const parts = [`${addrDisplay}: Aktualizacja`];
      if (eventType === 'planowane_wylaczenie') {
        if (startTime) parts.push(`Od: ${fmtLocal(startTime)}`);
        if (estimatedEnd) parts.push(`Do: ${fmtLocal(estimatedEnd)}`);
      } else {
        if (estimatedEnd) parts.push(`Nowy szacowany czas przywrócenia wody: ${fmtLocal(estimatedEnd)}`);
      }
      parts.push('Przepraszamy za utrudnienia. MPWiK Lublin tel. 994');
      msg = parts.join('. ');

    } else {
      // Domyślny: nowe zdarzenie lub edycja bez wykrytych zmian → szablon "nowe zgłoszenie"
      const typeLabel = TYPE_LABELS[eventType] ?? eventType;
      const descPart = description ? ` ${description}.` : '';
      let timePart: string;
      if (eventType === 'planowane_wylaczenie') {
        const fromPart = startTime ? `Od: ${fmtLocal(startTime)}` : '';
        const toPart = estimatedEnd ? `Do: ${fmtLocal(estimatedEnd)}` : '';
        const combined = [fromPart, toPart].filter(Boolean).join('. ');
        timePart = combined ? ` ${combined}.` : '';
      } else {
        const endPart = estimatedEnd ? fmtLocal(estimatedEnd) : 'nieznany';
        timePart = ` Szacowany czas naprawy: ${endPart}.`;
      }
      const streetDisplay = streetName ?? '[Ulica]';
      msg = `MPWiK Lublin: ${typeLabel} na ul. ${streetDisplay}${addrPart ? ` ${addrPart}` : ''}.${descPart}${timePart} Za utrudnienia przepraszamy. tel. 994`;
    }

    setCustomMessage(msg);
  }, [isEdit, initialData, eventType, selectedStreet, streetQuery, houseFrom, houseTo, selectedNums, startTime, estimatedEnd, description, status, isMessageEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Handlery zaznaczania budynków
  // ---------------------------------------------------------------------------

  const toggleBuilding = useCallback((bid: number) => {
    selectionSourceRef.current = 'map';
    setSelectedBuildingIds((prev) => {
      const next = new Set(prev);
      if (next.has(bid)) next.delete(bid);
      else next.add(bid);
      return next;
    });
  }, []);

  const applyRange = () => {
    if (!houseFrom && !houseTo) return;
    selectionSourceRef.current = 'range';
    const newIds = new Set(
      buildings
        .filter((b) => b.house_number && isInRange(b.house_number, houseFrom, houseTo))
        .map((b) => b.id),
    );
    setSelectedBuildingIds((prev) => new Set([...prev, ...newIds]));
    if (newIds.size > 0) {
      toast({ title: `Dodano ${newIds.size} budynków do zaznaczenia`, description: `Zakres: ${houseFrom || '?'}–${houseTo || '?'}` });
    } else {
      toast({
        title: 'Brak pasujących budynków',
        description: buildings.length === 0
          ? 'Brak obrysów dla tej ulicy — zakres zostanie zapisany.'
          : 'Sprawdź wpisany zakres numerów.',
        variant: buildings.length === 0 ? 'default' : 'destructive',
      });
    }
  };

  const handleListInputChange = (value: string) => {
    setListInput(value);
    selectionSourceRef.current = 'list';
    // Parsuj tylko tokeny zakończone przecinkiem lub spacją — nie matchuj częściowo wpisanego numeru
    const raw = value;
    // Rozdziel na segmenty przecinkami; ostatni segment (bez przecinka na końcu) ignorujemy
    // żeby nie matchować np. "1" gdy user wciąż pisze "12"
    const trailingComma = /[,\s]+$/.test(raw);
    const parts = raw.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    // Jeśli ostatni znak NIE jest separatorem, ostatni token jest niekompletny — pomijamy go
    const completedNums = trailingComma ? parts : parts.slice(0, -1);
    const newIds = new Set(
      buildings
        .filter((b) => b.house_number && completedNums.includes(b.house_number.toUpperCase()))
        .map((b) => b.id),
    );
    setSelectedBuildingIds(newIds);
  };

  const clearSelection = () => {
    selectionSourceRef.current = 'map';
    setSelectedBuildingIds(new Set());
    setListInput('');
    setHouseFrom('');
    setHouseTo('');
    setHouseFromError(null);
  };

  const validateHouseFrom = (): boolean => {
    if (!houseFrom.trim() || availableHouseNumbers.length === 0) return true;
    const normalized = houseFrom.trim().toUpperCase();
    const valid = availableHouseNumbers.some((n) => n.toUpperCase() === normalized);
    if (!valid) setHouseFromError('Ten adres nie istnieje w bazie MPWiK');
    return valid;
  };

  // ---------------------------------------------------------------------------
  // Autocomplete ulicy
  // ---------------------------------------------------------------------------

  const handleStreetChange = (v: string) => {
    setStreetQuery(v);
    if (!v) setSelectedStreet(null);
    setShowSuggestions(v.length >= 3);
  };

  const selectStreet = (s: Street) => {
    setSelectedStreet(s);
    setStreetQuery(streetLabel(s.street_type, s.full_name));
    setShowSuggestions(false);
  };

  // ---------------------------------------------------------------------------
  // Budowanie payloadu z aktualnego stanu formularza
  // ---------------------------------------------------------------------------

  const buildCurrentItem = useCallback((): QueueItem => {
    const selectedFeatures = buildingFeatures.filter((f) =>
      selectedBuildingIds.has(f.properties.id),
    );
    const geojson_segment =
      selectedFeatures.length > 0
        ? { type: 'FeatureCollection' as const, features: selectedFeatures }
        : null;

    return {
      _id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      event_type: eventType,
      street_id: selectedStreet!.id,
      street_name: selectedStreet!.full_name || streetQuery,
      street_type: selectedStreet!.street_type || '',
      house_number_from: houseFrom,
      house_number_to: houseTo,
      description,
      status: status || 'zgloszona',
      start_time: startTime ? toUTCISO(startTime) : null,
      estimated_end: estimatedEnd ? toUTCISO(estimatedEnd) : null,
      geojson_segment,
      custom_message: customMessage,
      displayLabel: buildDisplayLabel(houseFrom, houseTo, selectedNums),
    };
  }, [
    eventType, selectedStreet, streetQuery, houseFrom, houseTo,
    description, status, startTime, estimatedEnd, buildingFeatures, selectedBuildingIds, selectedNums, customMessage,
  ]);

  // ---------------------------------------------------------------------------
  // Dodaj bieżącą ulicę do kolejki
  // ---------------------------------------------------------------------------

  const addToQueue = () => {
    if (!selectedStreet) {
      toast({ title: 'Wybierz ulicę', description: 'Wpisz min. 3 znaki i wybierz ulicę z listy.', variant: 'destructive' });
      return;
    }
    if (!eventType) {
      toast({ title: 'Wybierz typ zdarzenia', variant: 'destructive' });
      return;
    }
    if (!validateHouseFrom()) {
      toast({ title: 'Nieprawidłowy numer budynku', description: 'Wybierz numer z listy lub pozostaw puste.', variant: 'destructive' });
      return;
    }
    const item = buildCurrentItem();
    setEventsQueue((prev) => [...prev, item]);
    toast({ title: 'Dodano do kolejki', description: `${streetLabel(item.street_type, item.street_name)} — ${item.displayLabel}` });

    // Reset pól ulicy i budynków, zachowaj typ/status/datę
    setSelectedStreet(null);
    setStreetQuery('');
    setBuildings([]);
    setSelectedBuildingIds(new Set());
    setListInput('');
    setHouseFrom('');
    setHouseTo('');
    setDescription('');
    setActiveTab('map');
    setIsMessageEdited(false);
    setCustomMessage('');
  };

  const removeFromQueue = (qId: string) => {
    setEventsQueue((prev) => prev.filter((item) => item._id !== qId));
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  // Właściwa logika wysyłki — wywoływana z przycisku type="button",
  // żeby HTML5 required nie blokował akcji gdy roboczy formularz jest pusty.
  const handleBulkSubmit = async () => {
    // Zbuduj finalną listę: kolejka + bieżący formularz (jeśli ulica jest wybrana)
    const allItems = [...eventsQueue];
    if (selectedStreet) {
      if (!eventType) {
        toast({ title: 'Wybierz typ zdarzenia', variant: 'destructive' });
        return;
      }
      if (!validateHouseFrom()) {
        toast({ title: 'Nieprawidłowy numer budynku', description: 'Wybierz numer z listy lub pozostaw puste.', variant: 'destructive' });
        return;
      }
      allItems.push(buildCurrentItem());
    }

    if (allItems.length === 0) {
      toast({
        title: 'Puste zgłoszenie',
        description: 'Wybierz ulicę lub dodaj ulice do kolejki.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && id) {
        const item = allItems[0];
        await updateEvent(Number(id), {
          event_type: item.event_type,
          street_id: item.street_id,
          street_name: item.street_name,
          house_number_from: item.house_number_from || null,
          house_number_to: item.house_number_to || null,
          description: item.description || null,
          status: item.status,
          start_time: item.start_time,
          estimated_end: item.estimated_end,
          geojson_segment: item.geojson_segment,
          custom_message: item.custom_message || null,
        });
        toast({ title: 'Zdarzenie zaktualizowane', description: 'Zmiany zostały zapisane.' });
      } else {
        await Promise.all(
          allItems.map((item) =>
            apiFetch('/events', {
              method: 'POST',
              body: JSON.stringify({
                event_type: item.event_type,
                street_id: item.street_id,
                street_name: item.street_name,
                house_number_from: item.house_number_from || null,
                house_number_to: item.house_number_to || null,
                description: item.description || null,
                status: item.status,
                estimated_end: item.estimated_end,
                geojson_segment: item.geojson_segment,
                custom_message: item.custom_message || null,
              }),
            }),
          ),
        );
        const count = allItems.length;
        toast({
          title: count === 1 ? 'Zdarzenie zgłoszone' : `Zgłoszono ${count} ulic`,
          description: 'Powiadomienia zostaną wysłane do mieszkańców.',
        });
      }
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      const rawMsg = (err as Error).message || '';
      const handled = handle422Error(rawMsg);
      if (!handled) {
        toast({
          title: 'Błąd zapisu',
          description: rawMsg || 'Nie udało się zapisać zdarzenia.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleBulkSubmit();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoadingEvent) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showMap = !!selectedStreet;
  const totalToSubmit = eventsQueue.length + (selectedStreet ? 1 : 0);
  const submitLabel = isEdit
    ? 'Zapisz zmiany'
    : totalToSubmit > 1
    ? `Zapisz i powiadom (${totalToSubmit} ulic)`
    : 'Zapisz i powiadom mieszkańców';

  return (
    <div className="w-full max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">
        {isEdit ? `Edytuj zdarzenie #${id}` : 'Nowe zdarzenie'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ---------------------------------------------------------------- */}
        {/* Typ zdarzenia                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <Label>Typ zdarzenia *</Label>
          <Select value={eventType} onValueChange={(v) => { if (v !== 'planowane_wylaczenie') setStartTime(''); setEventType(v); }} required>
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

        {/* ---------------------------------------------------------------- */}
        {/* Autocomplete ulicy                                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="relative" ref={wrapperRef}>
          <Label>
            Ulica *{' '}
            <span className="text-xs text-muted-foreground">(min. 3 znaki)</span>
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
                    {streetLabel(s.street_type, s.full_name)}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
                </li>
              ))}
            </ul>
          )}
          {selectedStreet && (
            <p className="text-xs text-muted-foreground mt-1">
              Wybrano: {streetLabel(selectedStreet.street_type, selectedStreet.full_name)}
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Zakładki wyboru zakresu awarii                                   */}
        {/* Widoczne tylko gdy ulica jest wybrana                            */}
        {/* ---------------------------------------------------------------- */}
        {showMap && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Label>Zakres awarii</Label>
              {selectedBuildingIds.size > 0 && (
                <>
                  <Badge variant="secondary" className="text-xs">
                    {selectedBuildingIds.size} budynków
                  </Badge>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground ml-1"
                    onClick={clearSelection}
                  >
                    Wyczyść
                  </button>
                </>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="map" className="text-xs sm:text-sm">Zaznacz na mapie</TabsTrigger>
                <TabsTrigger value="range" className="text-xs sm:text-sm">Zakres numerów</TabsTrigger>
                <TabsTrigger value="list" className="text-xs sm:text-sm">Lista numerów</TabsTrigger>
              </TabsList>

              {/* --- Zakładka 1: hint --- */}
              <TabsContent value="map" className="mt-3">
                <p className="text-xs text-muted-foreground">
                  Kliknij budynki na mapie poniżej, aby je zaznaczyć lub odznaczyć.
                </p>
              </TabsContent>

              {/* --- Zakładka 2: Zakres numerów --- */}
              <TabsContent value="range" className="space-y-4 mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div ref={houseFromWrapperRef} className="relative">
                    <Label htmlFor="house-from">Nr posesji od</Label>
                    <Input
                      id="house-from"
                      value={houseFrom}
                      onChange={(e) => {
                        setHouseFrom(e.target.value);
                        setHouseFromError(null);
                        if (availableHouseNumbers.length > 0) setShowHouseFromDropdown(true);
                      }}
                      onFocus={() => availableHouseNumbers.length > 0 && setShowHouseFromDropdown(true)}
                      placeholder="np. 1"
                      aria-label="Numer posesji od"
                      className={houseFromError ? 'border-destructive' : ''}
                      autoComplete="off"
                    />
                    {houseFromError && (
                      <p className="text-xs text-destructive mt-1">{houseFromError}</p>
                    )}
                    {showHouseFromDropdown && filteredFromNumbers.length > 0 && (
                      <ul className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {filteredFromNumbers.slice(0, 20).map((n) => (
                          <li
                            key={n}
                            className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectionSourceRef.current = 'range';
                              setHouseFrom(n);
                              setHouseFromError(null);
                              setShowHouseFromDropdown(false);
                            }}
                          >
                            {n}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div ref={houseToWrapperRef} className="relative">
                    <Label htmlFor="house-to">Nr posesji do</Label>
                    <Input
                      id="house-to"
                      value={houseTo}
                      onChange={(e) => {
                        setHouseTo(e.target.value);
                        if (availableHouseNumbers.length > 0) setShowHouseToDropdown(true);
                      }}
                      onFocus={() => availableHouseNumbers.length > 0 && setShowHouseToDropdown(true)}
                      placeholder="np. 20"
                      aria-label="Numer posesji do"
                      autoComplete="off"
                    />
                    {showHouseToDropdown && filteredToNumbers.length > 0 && (
                      <ul className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {filteredToNumbers.slice(0, 20).map((n) => (
                          <li
                            key={n}
                            className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectionSourceRef.current = 'range';
                              setHouseTo(n);
                              setShowHouseToDropdown(false);
                            }}
                          >
                            {n}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={applyRange}
                  disabled={!houseFrom && !houseTo}
                >
                  Zastosuj zakres
                </Button>
                {selectedBuildingIds.size > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Zaznaczono {selectedBuildingIds.size} budynków:
                    </p>
                    <ScrollArea className="max-h-[80px] pr-2">
                      <div className="flex flex-wrap gap-1">
                        {selectedNums.map((n) => (
                          <Badge key={n} variant="secondary" className="text-xs px-2 py-0.5 font-normal">
                            {n}
                          </Badge>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
                {buildings.length === 0 && (houseFrom || houseTo) && (
                  <p className="text-xs text-amber-600">
                    Brak obrysów budynków — zakres zostanie zapisany jako tekst
                    i uwzględniony przez silnik powiadomień.
                  </p>
                )}
              </TabsContent>

              {/* --- Zakładka 3: Lista numerów --- */}
              <TabsContent value="list" className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="list-input">
                    Numery posesji{' '}
                    <span className="text-xs text-muted-foreground">(oddzielone przecinkiem, zatwierdź przecinkiem)</span>
                  </Label>
                  <Input
                    id="list-input"
                    value={listInput}
                    onChange={(e) => handleListInputChange(e.target.value)}
                    placeholder="np. 1, 2, 3A, 4, 5B"
                    aria-label="Lista numerów posesji"
                  />
                </div>
                {selectedBuildingIds.size > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Dopasowano{' '}
                    <span className="font-medium text-foreground">
                      {selectedBuildingIds.size} budynków
                    </span>{' '}
                    z obrysami na mapie.
                  </p>
                ) : listInput.trim() ? (
                  <p className="text-xs text-amber-600">
                    Brak dopasowań w obrysach — numery zostaną zapisane jako tekst.
                  </p>
                ) : null}
              </TabsContent>
            </Tabs>

            {/* --- Mapa — widoczna we wszystkich zakładkach --- */}
            {buildingsLoading ? (
              <div className="flex items-center justify-center h-40 rounded-md border border-border bg-muted/20 mt-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Ładowanie obrysów…</span>
              </div>
            ) : buildingFeatures.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 rounded-md border border-border bg-muted/20 gap-1 mt-3">
                <p className="text-sm text-muted-foreground">
                  Brak obrysów budynków dla tej ulicy.
                </p>
                <p className="text-xs text-muted-foreground">
                  Użyj zakładki „Zakres numerów" lub „Lista numerów".
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="rounded-md overflow-hidden border border-border">
                  <MapContainer
                    center={LUBLIN_CENTER}
                    zoom={16}
                    scrollWheelZoom
                    className="w-full h-[300px] sm:h-[380px] z-0"
                    maxBounds={LUBLIN_BOUNDS}
                    maxBoundsViscosity={1.0}
                    minZoom={MIN_ZOOM}
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
                      streetName={selectedStreet?.full_name ?? ''}
                    />
                  </MapContainer>
                </div>
                <p className="text-xs text-muted-foreground">
                  Budynki z obrysami:{' '}
                  <span className="font-medium">{buildingFeatures.length}</span> •{' '}
                  <span className="text-red-500 font-medium">
                    Zaznaczono: {selectedBuildingIds.size}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Opis zdarzenia                                                   */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <Label htmlFor="desc">Opis</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opis zdarzenia..."
            rows={3}
            aria-label="Opis zdarzenia"
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Status + szacowany czas                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {eventType === 'planowane_wylaczenie' && (
            <div>
              <Label htmlFor="start-time">Czas rozpoczęcia *</Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); setDateFieldError(null); }}
                required
                aria-label="Planowany czas rozpoczęcia"
                className={dateFieldError === 'start_time' || dateFieldError === 'both' ? 'border-destructive' : ''}
              />
            </div>
          )}
          <div>
            <Label htmlFor="est-end">
              {eventType === 'planowane_wylaczenie' ? 'Czas zakończenia *' : 'Szacowany czas usunięcia'}
            </Label>
            <Input
              id="est-end"
              type="datetime-local"
              value={estimatedEnd}
              onChange={(e) => { setEstimatedEnd(e.target.value); setDateFieldError(null); }}
              required={eventType === 'planowane_wylaczenie'}
              aria-label="Szacowany czas zakończenia"
              className={dateFieldError === 'estimated_end' || dateFieldError === 'both' ? 'border-destructive' : ''}
            />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Podgląd wiadomości dla mieszkańców — inteligentny, reaktywny    */}
        {/* Pozycja: bezpośrednio pod polami daty                           */}
        {/* ---------------------------------------------------------------- */}
        {(customMessage || eventType) && (
          <div className="rounded-md border border-border bg-muted/50 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Podgląd wiadomości dla mieszkańców
              </p>
              {isEdit && initialData && (
                <Badge
                  variant="outline"
                  className={`text-xs font-normal ${
                    status !== initialData.status
                      ? 'border-blue-400 text-blue-600'
                      : estimatedEnd !== initialData.estimatedEnd || description !== initialData.description
                      ? 'border-amber-400 text-amber-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {status !== initialData.status
                    ? 'zmiana statusu'
                    : estimatedEnd !== initialData.estimatedEnd || description !== initialData.description
                    ? 'aktualizacja czasu / opisu'
                    : 'brak zmian'}
                </Badge>
              )}
            </div>
            <p className="font-mono text-sm leading-relaxed text-foreground break-words whitespace-pre-wrap">
              {customMessage || '— wybierz typ zdarzenia, aby wygenerować podgląd —'}
            </p>
            {customMessage.length > 0 && (
              <p className={`font-mono text-xs ${customMessage.length > 160 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                {customMessage.length} zn.{customMessage.length > 160 ? ' — przekracza 1 SMS (160 zn.)' : ' — mieści się w 1 SMS'}
              </p>
            )}
            {isMessageEdited && (
              <p className="text-xs text-amber-600 italic">
                Treść zmodyfikowana ręcznie — zostanie wysłana zamiast szablonu.
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Przycisk "Dodaj do kolejki" — tylko w trybie tworzenia           */}
        {/* ---------------------------------------------------------------- */}
        {!isEdit && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={addToQueue}
            disabled={!selectedStreet || !eventType}
          >
            <Plus className="h-4 w-4 mr-2" />
            Dodaj ulicę do zgłoszenia
          </Button>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Kolejka oczekujących zgłoszeń — tylko w trybie tworzenia        */}
        {/* ---------------------------------------------------------------- */}
        {!isEdit && eventsQueue.length > 0 && (
          <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">
              Zgłoszenia oczekujące na wysłanie{' '}
              <Badge variant="outline" className="ml-1 text-xs">
                {eventsQueue.length}
              </Badge>
            </p>
            <div className="space-y-1.5">
              {eventsQueue.map((item) => (
                <QueueCard
                  key={item._id}
                  item={item}
                  onRemove={() => removeFromQueue(item._id)}
                />
              ))}
            </div>
            {selectedStreet && (
              <p className="text-xs text-muted-foreground pt-1">
                + bieżący formularz (
                {streetLabel(selectedStreet.street_type, selectedStreet.full_name)})
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Edycja treści powiadomienia — opcjonalne nadpisanie szablonu    */}
        {/* ---------------------------------------------------------------- */}
        <Card className="p-4 bg-muted/30 border-primary/20">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label htmlFor="custom-message" className="text-sm font-semibold">
                Edytuj treść wiadomości (opcjonalnie)
              </Label>
              {isMessageEdited && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => setIsMessageEdited(false)}
                >
                  Przywróć automatyczny
                </button>
              )}
            </div>
            <Textarea
              id="custom-message"
              value={customMessage}
              onChange={(e) => { setCustomMessage(e.target.value); setIsMessageEdited(true); }}
              rows={3}
              placeholder="Treść wiadomości generowana automatycznie — możesz ją zmienić przed zapisem."
              aria-label="Treść powiadomienia SMS/E-mail"
              className="text-sm resize-none font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {isMessageEdited
                ? 'Treść zmodyfikowana — zostanie wysłana zamiast automatycznego szablonu.'
                : 'Treść generowana automatycznie na podstawie danych powyżej.'}
            </p>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Przyciski submit / anuluj                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            size="lg"
            className="flex-1 font-semibold"
            onClick={handleBulkSubmit}
            disabled={isSubmitting || (!isEdit && totalToSubmit === 0)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Zapisywanie…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {submitLabel}
              </>
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
