import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface AddressInfo {
  id: number;
  street_name: string;
  house_number: string;
  flat_number: string | null;
}

interface SubscriberInfo {
  email: string;
  phone: string;
  addresses: AddressInfo[];
}

const Unsubscribe = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [subscriber, setSubscriber] = useState<SubscriberInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const verifyToken = async (t: string) => {
    setLoading(true);
    setSubscriber(null);
    try {
      const data = await apiFetch<SubscriberInfo>(`/subscribers/${t}`);
      setSubscriber(data);
    } catch {
      toast({
        title: 'Nieprawidłowy token',
        description: 'Token jest nieprawidłowy lub nie istnieje w systemie.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-weryfikacja gdy token pochodzi z URL
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      verifyToken(urlToken);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (t) verifyToken(t);
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/subscribers/${token.trim()}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `HTTP ${res.status}`);
      }
      toast({
        title: 'Dane usunięte',
        description: 'Twoje dane zostały trwale i nieodwracalnie usunięte z systemu.',
      });
      navigate('/');
    } catch {
      toast({
        title: 'Błąd usuwania',
        description: 'Nie udało się usunąć danych. Spróbuj ponownie.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-md py-16 space-y-8">
      <div className="text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Wyrejestrowanie z systemu</h1>
      </div>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-2">
        <p className="font-semibold text-destructive">Uwaga! Ta operacja jest nieodwracalna.</p>
        <p className="text-muted-foreground">
          Wszystkie Twoje dane — adresy, numer telefonu, e-mail — zostaną{' '}
          <strong>całkowicie i fizycznie usunięte</strong> z bazy danych. Nie będziesz już
          otrzymywać żadnych powiadomień.
        </p>
      </div>

      {!subscriber ? (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <Label htmlFor="unsub-token">Token wyrejestrowania</Label>
            <Input
              id="unsub-token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Wklej token otrzymany przy rejestracji"
              required
              aria-label="Token wyrejestrowania"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Token znajdziesz na ekranie po rejestracji lub w e-mailu potwierdzającym.
            </p>
          </div>
          <Button type="submit" variant="outline" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Weryfikacja…
              </>
            ) : (
              'Sprawdź dane'
            )}
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-semibold">Dane powiązane z tym tokenem:</p>
            <p className="text-sm text-muted-foreground">E-mail: {subscriber.email}</p>
            <p className="text-sm text-muted-foreground">Telefon: {subscriber.phone}</p>
            {subscriber.addresses.length > 0 && (
              <div>
                <p className="text-sm font-medium mt-2">Subskrybowane adresy:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {subscriber.addresses.map((addr) => (
                    <li key={addr.id}>
                      {addr.street_name} {addr.house_number}
                      {addr.flat_number ? `/${addr.flat_number}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Czy na pewno chcesz trwale usunąć powyższe dane?
          </p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => {
                setSubscriber(null);
                setToken('');
              }}
              disabled={loading}
            >
              Anuluj
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="flex-1 font-semibold"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Usuwanie…
                </>
              ) : (
                'Potwierdzam — usuń moje dane'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Unsubscribe;
