import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AddressRow } from '@/components/AddressRow';
import { useToast } from '@/hooks/use-toast';

interface Address {
  street_name: string;
  house_number: string;
  apartment_number: string;
}

const emptyAddress = (): Address => ({ street_name: '', house_number: '', apartment_number: '' });

const Register = () => {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([emptyAddress()]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [nightNotifications, setNightNotifications] = useState(false);

  const handleAddressChange = (index: number, field: string, value: string) => {
    setAddresses((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  const addAddress = () => setAddresses((prev) => [...prev, emptyAddress()]);
  const removeAddress = (index: number) => setAddresses((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gdprConsent) {
      toast({ title: 'Wymagana zgoda', description: 'Zaznacz zgodę na przetwarzanie danych.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Rejestracja wysłana!', description: 'Twoje dane zostały przesłane. Otrzymasz potwierdzenie.' });
  };

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
              <Input id="phone" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" required aria-label="Numer telefonu" />
            </div>
            <div>
              <Label htmlFor="email">E-mail *</Label>
              <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="twoj@email.pl" required aria-label="Adres e-mail" />
            </div>
          </div>
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
              <strong>Wyrażam zgodę</strong> na przetwarzanie moich danych osobowych (RODO). System pozwala na całkowite, fizyczne usunięcie danych w dowolnym momencie. <span className="text-destructive">*</span>
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

        <Button type="submit" size="lg" className="w-full text-base font-semibold">
          Zarejestruj się
        </Button>
      </form>
    </div>
  );
};

export default Register;
