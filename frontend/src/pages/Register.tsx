import { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AddressRow } from '@/components/AddressRow';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

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
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyBySms, setNotifyBySms] = useState(true);
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

  const addAddress = () => setAddresses((prev) => [...prev, emptyAddress()]);
  const removeAddress = (index: number) => setAddresses((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gdprConsent) {
      toast({ title: 'Wymagana zgoda', description: 'Zaznacz zgodę na przetwarzanie danych.', variant: 'destructive' });
      return;
    }
    if (!notifyByEmail && !notifyBySms) {
      toast({ title: 'Wybierz kanał powiadomień', description: 'Zaznacz co najmniej e-mail lub SMS.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    const payload = {
      phone,
      email,
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
        description = parsed?.detail ?? description;
      } catch {
        if (raw) description = raw;
      }
      toast({ title: 'Błąd rejestracji', description, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Ekran sukcesu ---
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token wyrejestrowania — zachowaj go!</p>
            <p className="font-mono text-sm break-all select-all">{unsubscribeToken}</p>
            <p className="text-xs text-muted-foreground">
              Możesz go użyć w dowolnym momencie, aby usunąć swoje dane z systemu (wymaganie RODO).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Formularz ---
  return (
    <div className="container max-w-2xl py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Darmowe powiadomienia SMS i E-mail</h1>
        <p className="text-muted-foreground text-sm">
          Zarejestruj się, aby natychmiast otrzymywać informacje o awariach i przerwach w dostawie wody pod Twoim adresem.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Addresses */}
        <fieldset className="space-y-4">
          <legend className="font-heading text-lg font-semibold">Twoje adresy</legend>
          <p className="text-xs text-muted-foreground">Możesz śledzić wiele adresów jednocześnie.</p>
          <div className="space-y-3">
            {addresses.map((addr, i) => (
              <AddressRow
                key={i}
                index={i}
                street_name={addr.street_name}
                house_number={addr.house_number}
                apartment_number={addr.apartment_number}
                onChange={handleAddressChange}
                onRemove={removeAddress}
                canRemove={addresses.length > 1}
              />
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addAddress} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Dodaj kolejny adres
          </Button>
        </fieldset>

        {/* Contact */}
        <fieldset className="space-y-4">
          <legend className="font-heading text-lg font-semibold">Dane kontaktowe</legend>
          <div className="grid sm:grid-cols-2 gap-4">
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
                aria-label="Numer telefonu"
              />
            </div>
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
          </div>
        </fieldset>

        {/* Notification channels */}
        <fieldset className="space-y-4">
          <legend className="font-heading text-lg font-semibold">Kanały powiadomień</legend>
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

        {/* Consents */}
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
        </fieldset>

        <Button type="submit" size="lg" className="w-full text-base font-semibold" disabled={isSubmitting}>
          {isSubmitting ? 'Rejestrowanie...' : 'Zarejestruj się'}
        </Button>
      </form>
    </div>
  );
};

export default Register;
