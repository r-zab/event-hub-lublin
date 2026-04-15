import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useStreets } from '@/hooks/useStreets';
import { type Street } from '@/data/mockData';
import { type BuildingItem, updateBuildingAddress } from '@/hooks/useBuildings';
import { useToast } from '@/hooks/use-toast';

interface Props {
  building: BuildingItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export function BuildingAddressModal({ building, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [streetQuery, setStreetQuery] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [houseNumber, setHouseNumber] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { streets, isLoading: streetsLoading } = useStreets(streetQuery);

  // Reset stanu przy każdym otwarciu nowego budynku
  useEffect(() => {
    if (building) {
      setStreetQuery(building.street_name ?? '');
      setSelectedStreet(null);
      setHouseNumber(building.house_number ?? '');
      setShowSuggestions(false);
    }
  }, [building]);

  const handleSelectStreet = (street: Street) => {
    setSelectedStreet(street);
    setStreetQuery(street.full_name);
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    if (!building) return;

    if (!selectedStreet && !building.street_id) {
      toast({
        title: 'Brak ulicy',
        description: 'Wybierz ulicę z listy.',
        variant: 'destructive',
      });
      return;
    }
    if (!houseNumber.trim()) {
      toast({
        title: 'Brak numeru',
        description: 'Podaj numer budynku.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateBuildingAddress(building.id, {
        street_id: selectedStreet?.id ?? building.street_id,
        street_name: selectedStreet?.full_name ?? streetQuery,
        house_number: houseNumber.trim(),
      });
      toast({
        title: 'Adres zapisany',
        description: `Budynek #${building.id} → ${selectedStreet?.full_name ?? streetQuery} ${houseNumber.trim()}`,
      });
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd';
      toast({
        title: 'Błąd zapisu',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isOpen = building !== null;
  const geomTypeLabel = building?.geom_type === 'point' ? 'punkt adresowy' : 'poligon budynku';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Uzupełnij adres</DialogTitle>
          <p className="text-sm text-muted-foreground">
            ID budynku: <span className="font-mono">{building?.id}</span>{' '}
            ({geomTypeLabel})
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Ulica — autocomplete */}
          <div className="space-y-1.5">
            <Label htmlFor="street-input">Ulica</Label>
            <div className="relative">
              <Input
                id="street-input"
                placeholder="Wpisz nazwę ulicy..."
                value={streetQuery}
                onChange={(e) => {
                  setStreetQuery(e.target.value);
                  setSelectedStreet(null);
                  if (e.target.value.length >= 3) setShowSuggestions(true);
                  else setShowSuggestions(false);
                }}
                onFocus={() => streetQuery.length >= 3 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                autoComplete="off"
              />
              {streetsLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {showSuggestions && streets.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {streets.map((s) => (
                    <li
                      key={s.id}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectStreet(s)}
                    >
                      <span className="font-medium">{s.street_type} {s.full_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Numer budynku */}
          <div className="space-y-1.5">
            <Label htmlFor="house-number-input">Numer budynku</Label>
            <Input
              id="house-number-input"
              placeholder="np. 12A"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Zapisywanie…</>
            ) : (
              'Zapisz adres'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
