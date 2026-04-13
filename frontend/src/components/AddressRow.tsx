import { Trash2, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useStreets } from '@/hooks/useStreets';
import { useState, useRef, useEffect } from 'react';

interface AddressRowProps {
  index: number;
  street_name: string;
  house_number: string;
  apartment_number: string;
  onChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

export function AddressRow({
  index,
  street_name,
  house_number,
  apartment_number,
  onChange,
  onRemove,
  canRemove,
}: AddressRowProps) {
  const [query, setQuery] = useState(street_name);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { streets: suggestions, isLoading } = useStreets(query);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStreetChange = (value: string) => {
    setQuery(value);
    onChange(index, 'street_name', value);
    // Wyczyść street_id gdy użytkownik ręcznie modyfikuje nazwę (brak TERYT match)
    onChange(index, 'street_id', '');
    setShowSuggestions(value.length >= 3);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end p-3 rounded-lg bg-muted/50 border border-border/50">
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
            placeholder="Wpisz nazwę ulicy..."
            className="pl-9"
            required
            aria-label="Nazwa ulicy"
            aria-autocomplete="list"
          />
          {isLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto" role="listbox">
            {suggestions.map((s) => (
              <li
                key={s.id}
                role="option"
                aria-selected={street_name === s.full_name}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
                onClick={() => {
                  const displayName = s.street_type && !/^\d+$/.test(s.street_type.trim())
                    ? `${s.street_type} ${s.full_name}`
                    : s.full_name;
                  setQuery(displayName);
                  onChange(index, 'street_name', displayName);
                  // Kluczowe: przekaż street_id z bazy TERYT
                  onChange(index, 'street_id', String(s.id));
                  setShowSuggestions(false);
                }}
              >
                <span className="font-medium">
                  {s.street_type && !/^\d+$/.test(s.street_type.trim())
                    ? `${s.street_type} ${s.full_name}`
                    : s.full_name}
                </span>
                <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label htmlFor={`house-${index}`} className="text-xs font-medium mb-1 block">
          Nr budynku *
        </Label>
        <Input
          id={`house-${index}`}
          value={house_number}
          onChange={(e) => onChange(index, 'house_number', e.target.value)}
          placeholder="np. 10"
          className="w-24"
          required
          aria-label="Numer budynku"
        />
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
          className="w-24"
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
