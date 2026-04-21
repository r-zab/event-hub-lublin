import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Plus, CheckCircle2, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AddressRow } from '@/components/AddressRow';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

const registerSchema = z
  .object({
    notify_by_sms: z.boolean(),
    notify_by_email: z.boolean(),
    phone: z.string().optional().or(z.literal('')),
    email: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (!data.notify_by_sms && !data.notify_by_email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wybierz co najmniej jeden kanał powiadomień.', path: ['notify_by_sms'] });
    }
    if (data.notify_by_sms && !data.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numer telefonu jest wymagany dla powiadomień SMS.', path: ['phone'] });
    }
    if (data.notify_by_email) {
      if (!data.email?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Adres e-mail jest wymagany dla powiadomień e-mail.', path: ['email'] });
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email.trim())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nieprawidłowy format adresu e-mail.', path: ['email'] });
      }
    }
  });

interface Address {
  street_id: number | null;
  street_name: string;
  house_number: string;
  apartment_number: string;
}

const emptyAddress = (): Address => ({
  street_id: null,
  street_name: '',
  house_number: '',
  apartment_number: '',
});

const Register = () => {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([emptyAddress()]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [nightNotifications, setNightNotifications] = useState(false);
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [notifyBySms, setNotifyBySms] = useState(false);
  const [houseNumberValidity, setHouseNumberValidity] = useState<boolean[]>([true]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unsubscribeToken, setUnsubscribeToken] = useState<string | null>(null);

  const handleAddressChange = (index: number, field: string, value: string) => {
    setAddresses((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        if (field === 'street_id') return { ...a, street_id: value ? Number(value) : null };
        return { ...a, [field]: value };
      })
    );
  };

  const handleHouseNumberValidChange = (index: number, valid: boolean) => {
    setHouseNumberValidity((prev) => {
      const next = [...prev];
      next[index] = valid;
      return next;
    });
  };

  const addAddress = () => {
    setAddresses((prev) => [...prev, emptyAddress()]);
    setHouseNumberValidity((prev) => [...prev, true]);
  };

  const removeAddress = (index: number) => {
    setAddresses((prev) => prev.filter((_, i) => i !== index));
    setHouseNumberValidity((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Walidacja Zod — kanały + pola kontaktowe
    const channelValidation = registerSchema.safeParse({
      notify_by_sms: notifyBySms,
      notify_by_email: notifyByEmail,
      phone,
      email,
    });
    if (!channelValidation.success) {
      const msg = channelValidation.error.issues[0].message;
      toast({ title: 'Błąd walidacji', description: msg, variant: 'destructive' });
      return;
    }

    if (!gdprConsent) {
      toast({ title: 'Wymagana zgoda', description: 'Zaznacz zgodę na przetwarzanie danych.', variant: 'destructive' });
      return;
    }

    const emptyAddr = addresses.find((a) => !a.street_name.trim() || !a.house_number.trim());
    if (emptyAddr) {
      toast({ title: 'Niepełny adres', description: 'Każdy adres musi mieć podaną ulicę i numer budynku.', variant: 'destructive' });
      return;
    }

    const manualStreet = addresses.find((a) => a.street_name.trim() && !a.street_id);
    if (manualStreet) {
      toast({ title: 'Wybierz ulicę z listy', description: `Ulica "${manualStreet.street_name}" musi być wybrana z podpowiedzi — wpisz min. 3 znaki i kliknij wynik.`, variant: 'destructive' });
      return;
    }

    if (houseNumberValidity.some((v) => v === false)) {
      toast({ title: 'Nieprawidłowy numer budynku', description: 'Sprawdź numer budynku — nie figuruje w bazie MPWiK.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    // Puste stringi dla niewybranych kanałów mapujemy na null — nie naruszają unique constraint w DB
    const payload = {
      phone: notifyBySms ? phone.replace(/[\s-]/g, '') : null,
      email: notifyByEmail ? email.trim() : null,
      rodo_consent: gdprConsent,
      night_sms_consent: nightNotifications,
      notify_by_email: notifyByEmail,
      notify_by_sms: notifyBySms,
      addresses: addresses.map((a) => ({
        street_id: a.street_id ?? null,
        street_name: a.street_name,
        house_number: a.house_number,
        flat_number: a.apartment_number || null,
      })),
    };

    try {
      const result = await apiFetch<{ unsubscribe_token: string }>('/subscribers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUnsubscribeToken(result.unsubscribe_token);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      let description = 'Spróbuj ponownie lub skontaktuj się z administratorem.';
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.detail) {
          if (Array.isArray(parsed.detail)) {
            description = parsed.detail.map((e: { msg?: string }) => e.msg ?? String(e)).join(', ');
          } else if (typeof parsed.detail === 'string') {
            description = parsed.detail;
          }
        }
      } catch {
        if (raw) description = raw;
      }
      toast({ title: 'Błąd rejestracji', description, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setUnsubscribeToken(null);
    setAddresses([emptyAddress()]);
    setPhone('');
    setEmail('');
    setGdprConsent(false);
    setNightNotifications(false);
    setNotifyByEmail(false);
    setNotifyBySms(false);
    setHouseNumberValidity([true]);
  };

  if (unsubscribeToken) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <h1 className="font-heading text-2xl font-bold">Rejestracja zakończona!</h1>
          <p className="text-muted-foreground">
            Będziesz otrzymywać powiadomienia o awariach i przerwach w dostawie wody pod wskazanymi adresami.
          </p>
          <div className="w-full rounded-lg border border-border bg-muted/50 p-4 text-left space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kod wyrejestrowania — zachowaj go!</p>
            <p className="font-mono text-sm break-all select-all">{unsubscribeToken}</p>
            <p className="text-xs text-muted-foreground">
              Skopiuj go i wklej na stronie „Wyrejestruj się", aby trwale usunąć swoje dane z systemu (wymaganie RODO).
            </p>
          </div>
          <div className="w-full rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm text-blue-900 space-y-1">
            <p>
              Wysłaliśmy Ci ten kod na{' '}
              <strong>{notifyBySms ? 'Twój numer telefonu (SMS)' : 'Twój adres e-mail'}</strong>.
            </p>
            <p className="text-xs text-blue-700">
              Jeśli go zgubisz — skontaktuj się z BOK MPWiK Lublin: tel. 81 532-42-81.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            <Button asChild variant="outline">
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Wróć do strony głównej
              </Link>
            </Button>
            <Button onClick={resetForm}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Zarejestruj kolejny adres
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Darmowe powiadomienia SMS i E-mail</h1>
        <p className="text-muted-foreground text-sm">
          Zarejestruj się, aby natychmiast otrzymywać informacje o awariach i przerwach w dostawie wody pod Twoim adresem.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Kanały powiadomień — na górze formularza */}
        <fieldset className="space-y-4 rounded-lg border border-border p-4">
          <legend className="font-heading text-lg font-semibold px-1">Preferowany kanał powiadomień</legend>
          <p className="text-xs text-muted-foreground">Wybierz, w jaki sposób chcesz otrzymywać powiadomienia o awariach.</p>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={notifyBySms}
              onCheckedChange={(v) => setNotifyBySms(v === true)}
              aria-label="Powiadomienia przez SMS"
            />
            <span className="text-sm leading-snug">
              Powiadomienia przez <strong>SMS</strong>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={notifyByEmail}
              onCheckedChange={(v) => setNotifyByEmail(v === true)}
              aria-label="Powiadomienia przez e-mail"
            />
            <span className="text-sm leading-snug">
              Powiadomienia przez <strong>e-mail</strong>
            </span>
          </label>
        </fieldset>

        {/* Adresy */}
        <fieldset className="space-y-4">
          <legend className="font-heading text-lg font-semibold">Twoje adresy</legend>
          <p className="text-xs text-muted-foreground">Możesz śledzić wiele adresów jednocześnie.</p>
          <div className="space-y-3">
            {addresses.map((addr, i) => (
              <AddressRow
                key={i}
                index={i}
                street_id={addr.street_id}
                street_name={addr.street_name}
                house_number={addr.house_number}
                apartment_number={addr.apartment_number}
                onChange={handleAddressChange}
                onRemove={removeAddress}
                canRemove={addresses.length > 1}
                onHouseNumberValidChange={handleHouseNumberValidChange}
              />
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addAddress} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Dodaj kolejny adres
          </Button>
        </fieldset>

        {/* Dane kontaktowe — wyświetlane zależnie od wybranego kanału */}
        {(notifyBySms || notifyByEmail) && (
          <fieldset className="space-y-4">
            <legend className="font-heading text-lg font-semibold">Dane kontaktowe</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              {notifyBySms && (
                <div>
                  <Label htmlFor="phone">Telefon *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+48 600 000 000"
                    required
                    pattern="^(\+48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}$"
                    title="Format: 600 000 000, +48 600 000 000 lub 600-000-000"
                    aria-label="Numer telefonu"
                  />
                </div>
              )}
              {notifyByEmail && (
                <div>
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="twoj@email.pl"
                    required
                    aria-label="Adres e-mail"
                  />
                </div>
              )}
            </div>
          </fieldset>
        )}

        {/* Zgody */}
        <fieldset className="space-y-4">
          <legend className="font-heading text-lg font-semibold">Zgody</legend>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={gdprConsent}
              onCheckedChange={(v) => setGdprConsent(v === true)}
              aria-label="Zgoda na przetwarzanie danych osobowych"
              required
            />
            <span className="text-sm leading-snug">
              <strong>Wyrażam zgodę</strong> na przetwarzanie moich danych osobowych (RODO). System pozwala na całkowite,
              fizyczne usunięcie danych w dowolnym momencie.{' '}
              <span className="text-destructive">*</span>
            </span>
          </label>

          {notifyBySms && (
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={nightNotifications}
                onCheckedChange={(v) => setNightNotifications(v === true)}
                aria-label="Zgoda na powiadomienia nocne"
              />
              <span className="text-sm leading-snug text-muted-foreground">
                Chcę otrzymywać powiadomienia SMS także w godzinach nocnych (22:00 – 06:00).
              </span>
            </label>
          )}
        </fieldset>

        {addresses.some((a) => a.street_name.trim() && !a.street_id) && (
          <p className="text-xs text-destructive text-center -mb-2">
            Wybierz ulicę z listy podpowiedzi, aby odblokować rejestrację.
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full text-base font-semibold"
          disabled={
            isSubmitting ||
            addresses.some((a) => a.street_name.trim() !== '' && a.street_id === null) ||
            houseNumberValidity.some((v) => !v)
          }
        >
          {isSubmitting ? 'Rejestrowanie...' : 'Zarejestruj się'}
        </Button>
      </form>
    </div>
  );
};

export default Register;
