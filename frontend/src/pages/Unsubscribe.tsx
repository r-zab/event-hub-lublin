import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

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

type UnsubStep = 'token' | 'info' | 'code_sent';

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

const Unsubscribe = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<UnsubStep>('token');
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [subscriber, setSubscriber] = useState<SubscriberInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState('');

  // 2FA delete code
  const [deleteCode, setDeleteCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const verifyToken = async (t: string) => {
    setLoading(true);
    setSubscriber(null);
    try {
      const data = await apiFetch<SubscriberInfo>(`/subscribers/${t}`);
      setSubscriber(data);
      setStep('info');
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

  // Auto-weryfikacja gdy token pochodzi z URL (pomijamy captcha dla linków bezpośrednich)
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      verifyToken(urlToken);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();

    if (!turnstileToken) {
      toast({
        title: 'Weryfikacja wymagana',
        description: 'Zaznacz pole weryfikacji Cloudflare.',
        variant: 'destructive',
      });
      return;
    }

    const t = token.trim();
    if (t) verifyToken(t);
  };

  const handleSendCode = async () => {
    setIsSendingCode(true);
    try {
      const result = await apiFetch<{ detail: string }>(`/subscribers/${token.trim()}/send-code`, { method: 'POST' });
      toast({ title: 'Kod wysłany', description: result?.detail ?? 'Sprawdź SMS lub e-mail.' });
      setStep('code_sent');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      let description = 'Nie udało się wysłać kodu. Spróbuj ponownie.';
      try { const p = JSON.parse(raw); if (p?.detail) description = p.detail; } catch { if (raw) description = raw; }
      toast({ title: 'Błąd wysyłania kodu', description, variant: 'destructive' });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteCode.trim().length !== 6) {
      toast({ title: 'Nieprawidłowy kod', description: 'Kod musi mieć 6 cyfr.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      await apiFetch(`/subscribers/${token.trim()}?code=${deleteCode.trim()}`, { method: 'DELETE' });
      toast({ title: 'Dane usunięte', description: 'Twoje dane zostały trwale i nieodwracalnie usunięte z systemu.' });
      navigate('/');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      let description = 'Nie udało się usunąć danych. Sprawdź kod i spróbuj ponownie.';
      try { const p = JSON.parse(raw); if (p?.detail) description = p.detail; } catch { if (raw) description = raw; }
      toast({ title: 'Błąd usuwania', description, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
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
        <p className="font-semibold text-red-700">Uwaga! Ta operacja jest nieodwracalna.</p>
        <p className="text-slate-700">
          Wszystkie Twoje dane — adresy, numer telefonu, e-mail — zostaną{' '}
          <strong>całkowicie i fizycznie usunięte</strong> z bazy danych. Nie będziesz już
          otrzymywać żadnych powiadomień.
        </p>
      </div>

      {/* Krok 1: Wpisz token + captcha */}
      {step === 'token' && (
        <form onSubmit={handleVerify} className="space-y-5">
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

          {/* Weryfikacja Cloudflare Turnstile */}
          <div className="flex justify-center w-full my-4">
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              options={{ theme: 'auto' }}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              onError={() => setTurnstileToken('')}
            />
          </div>

          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={loading || !turnstileToken}
          >
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
      )}

      {/* Krok 2: Pokaż dane subskrybenta + wyślij kod 2FA */}
      {step === 'info' && subscriber && (
        <div className="space-y-5">
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-semibold">Dane powiązane z tym tokenem:</p>
            <p className="text-sm text-muted-foreground">E-mail: {subscriber.email || '—'}</p>
            <p className="text-sm text-muted-foreground">Telefon: {subscriber.phone || '—'}</p>
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

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              Wymagana weryfikacja tożsamości (2FA)
            </div>
            <p className="text-xs text-blue-700">
              Aby trwale usunąć dane, wyślemy jednorazowy kod potwierdzający na Twój numer telefonu lub adres e-mail.
              Kod jest ważny 15 minut.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => { setSubscriber(null); setStep('token'); setToken(''); setTurnstileToken(''); }}
              disabled={isSendingCode}
            >
              Anuluj
            </Button>
            <Button
              size="lg"
              className="flex-1 font-semibold"
              onClick={handleSendCode}
              disabled={isSendingCode}
            >
              {isSendingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wysyłanie…
                </>
              ) : (
                'Wyślij kod potwierdzający'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Krok 3: Wpisz kod 2FA i potwierdź usunięcie */}
      {step === 'code_sent' && (
        <form onSubmit={handleConfirmDelete} className="space-y-5">
          <p className="text-sm text-center text-muted-foreground">
            Wpisz 6-cyfrowy kod wysłany SMS-em lub e-mailem, aby potwierdzić usunięcie danych.
          </p>

          <div className="space-y-2">
            <Label htmlFor="delete-code">Kod potwierdzający</Label>
            <Input
              id="delete-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={deleteCode}
              onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoComplete="one-time-code"
              className="text-center text-2xl tracking-widest font-mono"
              required
              aria-label="Kod potwierdzający usunięcie"
            />
            <p className="text-xs text-muted-foreground">
              Kod jest ważny 15 minut.{' '}
              <button
                type="button"
                className="underline text-primary"
                onClick={handleSendCode}
                disabled={isSendingCode}
              >
                Wyślij ponownie
              </button>
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setStep('info')}
              disabled={isDeleting}
            >
              Wróć
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              className="flex-1 font-semibold"
              disabled={isDeleting || deleteCode.length !== 6}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Usuwanie…
                </>
              ) : (
                'Potwierdzam — usuń moje dane'
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Unsubscribe;
