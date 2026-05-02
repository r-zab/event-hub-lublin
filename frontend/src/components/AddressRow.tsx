import { Trash2, Search, Loader2, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useStreets } from '@/hooks/useStreets';
import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface BuildingOption {
  id: number;
  house_number: string;
}

interface AddressRowProps {
  index: number;
  street_id: number | null;
  street_name: string;
  house_number: string;
  apartment_number: string;
  onChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  onHouseNumberValidChange?: (index: number, valid: boolean) => void;
}

export function AddressRow({
  index,
  street_id,
  street_name,
  house_number,
  apartment_number,
  onChange,
  onRemove,
  canRemove,
  onHouseNumberValidChange,
}: AddressRowProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState(street_name);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showHouseDropdown, setShowHouseDropdown] = useState(false);
  const [houseNumberError, setHouseNumberError] = useState<string | null>(null);
  const [streetTouched, setStreetTouched] = useState(false);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [activeHouseIndex, setActiveHouseIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const houseWrapperRef = useRef<HTMLDivElement>(null);
  const streetListRef = useRef<HTMLUListElement>(null);
  const houseListRef = useRef<HTMLUListElement>(null);
  const prevHouseErrorRef = useRef<string | null>(null);
  const { streets: suggestions, isLoading } = useStreets(query);

  useEffect(() => {
    if (!street_id) {
      setBuildings([]);
      return;
    }
    let cancelled = false;
    setBuildingsLoading(true);
    apiFetch<{ id: number; house_number: string | null }[]>(`/streets/${street_id}/buildings`)
      .then((data) => {
        if (!cancelled) {
          const options = data
            .filter((b) => b.house_number)
            .map((b) => ({ id: b.id, house_number: b.house_number! }))
            .sort((a, b) => a.house_number.localeCompare(b.house_number, undefined, { numeric: true, sensitivity: 'base' }));
          setBuildings(options);
        }
      })
      .catch(() => { if (!cancelled) setBuildings([]); })
      .finally(() => { if (!cancelled) setBuildingsLoading(false); });
    return () => { cancelled = true; };
  }, [street_id]);

  useEffect(() => {
    if (!house_number.trim() || buildings.length === 0) {
      setHouseNumberError(null);
      onHouseNumberValidChange?.(index, true);
      prevHouseErrorRef.current = null;
      return;
    }
    const normalized = house_number.trim().toUpperCase();
    const found = buildings.some((b) => b.house_number.toUpperCase() === normalized);
    const nextError = found ? null : 'invalid';
    if (nextError && prevHouseErrorRef.current !== nextError) {
      toast({
        title: 'Błąd walidacji adresu',
        description: 'Wybrany numer budynku nie figuruje w oficjalnej bazie MPWiK Lublin. Wybierz numer z listy podpowiedzi.',
        variant: 'destructive',
      });
    }
    prevHouseErrorRef.current = nextError;
    setHouseNumberError(nextError);
    onHouseNumberValidChange?.(index, found);
  }, [house_number, buildings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowSuggestions(false);
      if (houseWrapperRef.current && !houseWrapperRef.current.contains(e.target as Node))
        setShowHouseDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { setActiveSuggestionIndex(-1); }, [suggestions]);
  useEffect(() => { setActiveHouseIndex(-1); }, [showHouseDropdown]);

  useEffect(() => {
    if (!streetListRef.current || activeSuggestionIndex < 0) return;
    streetListRef.current.querySelectorAll('li')[activeSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeSuggestionIndex]);

  useEffect(() => {
    if (!houseListRef.current || activeHouseIndex < 0) return;
    houseListRef.current.querySelectorAll('li')[activeHouseIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeHouseIndex]);

  const handleStreetKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
      e.preventDefault();
      const s = suggestions[activeSuggestionIndex];
      const displayName = s.street_type && !/^\d+$/.test(s.street_type.trim())
        ? `${s.street_type} ${s.full_name}`
        : s.full_name;
      setQuery(displayName);
      onChange(index, 'street_name', displayName);
      onChange(index, 'street_id', String(s.id));
      onChange(index, 'house_number', '');
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
    }
  }, [showSuggestions, suggestions, activeSuggestionIndex, index, onChange]);

  const handleHouseKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, displayed: BuildingOption[]) => {
    if (!showHouseDropdown || displayed.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveHouseIndex((i) => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveHouseIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeHouseIndex >= 0) {
      e.preventDefault();
      onChange(index, 'house_number', displayed[activeHouseIndex].house_number);
      setShowHouseDropdown(false);
      setActiveHouseIndex(-1);
    } else if (e.key === 'Escape') {
      setShowHouseDropdown(false);
      setActiveHouseIndex(-1);
    }
  }, [showHouseDropdown, activeHouseIndex, index, onChange]);

  const handleStreetChange = (value: string) => {
    setQuery(value);
    onChange(index, 'street_name', value);
    onChange(index, 'street_id', '');
    onChange(index, 'house_number', '');
    setShowSuggestions(value.length >= 3);
    setStreetTouched(false);
  };

  const filteredBuildings = buildings.filter((b) =>
    !house_number || b.house_number.toUpperCase().startsWith(house_number.trim().toUpperCase()),
  );
  const displayedBuildings = filteredBuildings.slice(0, 20);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(150px,3fr)_5rem_5rem_auto] gap-3 items-end p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className="relative" ref={wrapperRef}>
        <Label htmlFor={`street-${index}`} className="text-xs font-medium mb-1 block">
          Ulica * <span className="text-muted-foreground">(min. 3 znaki)</span>
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`street-${index}`}
            value={query}
            onChange={(e) => handleStreetChange(e.target.value)}
            onFocus={() => query.length >= 3 && suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setStreetTouched(true)}
            onKeyDown={handleStreetKeyDown}
            placeholder="Wpisz nazwę ulicy..."
            className={`pl-9 ${streetTouched && query.trim() && !street_id ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            required
            aria-label="Nazwa ulicy"
            aria-autocomplete="list"
            aria-invalid={streetTouched && !!query.trim() && !street_id}
            aria-activedescendant={activeSuggestionIndex >= 0 ? `street-option-${index}-${activeSuggestionIndex}` : undefined}
          />
          {isLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul
            ref={streetListRef}
            className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto"
            role="listbox"
          >
            {suggestions.map((s, i) => {
              const displayName = s.street_type && !/^\d+$/.test(s.street_type.trim())
                ? `${s.street_type} ${s.full_name}`
                : s.full_name;
              return (
                <li
                  key={s.id}
                  id={`street-option-${index}-${i}`}
                  role="option"
                  aria-selected={i === activeSuggestionIndex}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${i === activeSuggestionIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                  onClick={() => {
                    setQuery(displayName);
                    onChange(index, 'street_name', displayName);
                    onChange(index, 'street_id', String(s.id));
                    onChange(index, 'house_number', '');
                    setShowSuggestions(false);
                    setActiveSuggestionIndex(-1);
                  }}
                >
                  <span className="font-medium">{displayName}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div ref={houseWrapperRef} className="relative">
        <Label htmlFor={`house-${index}`} className="text-xs font-medium mb-1 block">
          Nr budynku *
        </Label>
        <div className="relative">
          <Input
            id={`house-${index}`}
            value={house_number}
            onChange={(e) => {
              onChange(index, 'house_number', e.target.value);
              setShowHouseDropdown(e.target.value.length > 0 && buildings.length > 0);
            }}
            onFocus={() => buildings.length > 0 && setShowHouseDropdown(true)}
            onKeyDown={(e) => handleHouseKeyDown(e, displayedBuildings)}
            placeholder="np. 10"
            className={`w-full pr-7 ${houseNumberError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            required
            aria-label="Numer budynku"
            aria-invalid={!!houseNumberError}
            aria-activedescendant={activeHouseIndex >= 0 ? `house-option-${index}-${activeHouseIndex}` : undefined}
            autoComplete="off"
          />
          {buildingsLoading ? (
            <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : buildings.length > 0 ? (
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          ) : null}
        </div>
        {showHouseDropdown && displayedBuildings.length > 0 && (
          <ul
            ref={houseListRef}
            className="absolute z-20 w-32 mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto"
            role="listbox"
          >
            {displayedBuildings.map((b, i) => (
              <li
                key={b.id}
                id={`house-option-${index}-${i}`}
                role="option"
                aria-selected={i === activeHouseIndex}
                className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${i === activeHouseIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(index, 'house_number', b.house_number);
                  setShowHouseDropdown(false);
                  setActiveHouseIndex(-1);
                }}
              >
                {b.house_number}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label htmlFor={`apt-${index}`} className="text-xs font-medium mb-1 block">
          Nr mieszkania
        </Label>
        <Input
          id={`apt-${index}`}
          value={apartment_number}
          onChange={(e) => onChange(index, 'apartment_number', e.target.value)}
          placeholder="np. 5"
          className="w-full"
          aria-label="Numer mieszkania (opcjonalne)"
        />
      </div>

      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          aria-label="Usuń adres"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 self-end"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
