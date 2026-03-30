import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStreets } from '@/hooks/useStreets';
import { apiFetch } from '@/lib/api';
import { type Street } from '@/data/mockData';
import { Search, Loader2 } from 'lucide-react';

const AdminEventForm = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = pathname.includes('edit');

  const [eventType, setEventType] = useState<string>(isEdit ? 'awaria' : '');
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [streetQuery, setStreetQuery] = useState('');
  const [houseFrom, setHouseFrom] = useState(isEdit ? '10' : '');
  const [houseTo, setHouseTo] = useState(isEdit ? '15' : '');
  const [description, setDescription] = useState(isEdit ? 'Pęknięcie rury magistralnej DN300.' : '');
  const [status, setStatus] = useState<string>(isEdit ? 'zgloszona' : '');
  const [estimatedEnd, setEstimatedEnd] = useState(isEdit ? '2026-03-30T18:00' : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { streets: suggestions, isLoading: streetsLoading } = useStreets(streetQuery);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
      toast({ title: 'Wybierz ulicę', description: 'Wpisz min. 3 znaki i wybierz ulicę z listy.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          event_type: eventType,
          street_id: selectedStreet.id,
          street_name: selectedStreet.full_name,
          house_number_from: houseFrom,
          house_number_to: houseTo,
          description,
          status: status || 'zgloszona',
          estimated_end: estimatedEnd || null,
        }),
      });
      toast({ title: isEdit ? 'Zdarzenie zaktualizowane' : 'Zdarzenie utworzone', description: 'Powiadomienia zostaną wysłane do mieszkańców.' });
      navigate('/admin/dashboard');
    } catch (err: any) {
      toast({ title: 'Błąd', description: err.message || 'Nie udało się zapisać zdarzenia.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">{isEdit ? 'Edytuj zdarzenie' : 'Nowe zdarzenie'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label>Typ zdarzenia *</Label>
          <Select value={eventType} onValueChange={setEventType} required>
            <SelectTrigger aria-label="Typ zdarzenia"><SelectValue placeholder="Wybierz typ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="awaria">Awaria</SelectItem>
              <SelectItem value="planowane_wylaczenie">Planowane wyłączenie</SelectItem>
              <SelectItem value="remont">Remont</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative" ref={wrapperRef}>
          <Label>Ulica * <span className="text-xs text-muted-foreground">(min. 3 znaki)</span></Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={streetQuery}
              onChange={(e) => handleStreetChange(e.target.value)}
              onFocus={() => streetQuery.length >= 3 && suggestions.length > 0 && setShowSuggestions(true)}
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
            <ul className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto" role="listbox">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={selectedStreet?.id === s.id}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => selectStreet(s)}
                >
                  <span className="font-medium">{s.street_type} {s.full_name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{s.city}</span>
                </li>
              ))}
            </ul>
          )}
          {selectedStreet && (
            <p className="text-xs text-muted-foreground mt-1">
              Wybrano: {selectedStreet.street_type} {selectedStreet.full_name} (ID: {selectedStreet.id})
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="house-from">Nr posesji od *</Label>
            <Input id="house-from" value={houseFrom} onChange={(e) => setHouseFrom(e.target.value)} placeholder="10" required aria-label="Numer posesji od" />
          </div>
          <div>
            <Label htmlFor="house-to">Nr posesji do *</Label>
            <Input id="house-to" value={houseTo} onChange={(e) => setHouseTo(e.target.value)} placeholder="15" required aria-label="Numer posesji do" />
          </div>
        </div>

        <div>
          <Label htmlFor="desc">Opis</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opis zdarzenia..." rows={4} aria-label="Opis zdarzenia" />
        </div>

        {isEdit && (
          <div>
            <Label>Status *</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Status zdarzenia"><SelectValue placeholder="Wybierz status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zgloszona">Zgłoszona</SelectItem>
                <SelectItem value="w_naprawie">W naprawie</SelectItem>
                <SelectItem value="usunieta">Usunięta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="est-end">Szacowany czas usunięcia</Label>
          <Input id="est-end" type="datetime-local" value={estimatedEnd} onChange={(e) => setEstimatedEnd(e.target.value)} aria-label="Szacowany czas zakończenia" />
        </div>

        <div className="flex gap-3">
          <Button type="submit" size="lg" className="flex-1 font-semibold" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Zapisywanie…</>
            ) : (
              'Zapisz i powiadom mieszkańców'
            )}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => navigate('/admin/dashboard')}>
            Anuluj
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminEventForm;
