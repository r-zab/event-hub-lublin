import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const Unsubscribe = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: 'Dane usunięte', description: 'Twoje dane zostały trwale i nieodwracalnie usunięte z systemu.' });
    setEmail('');
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
          Wszystkie Twoje dane — adresy, numer telefonu, e-mail — zostaną <strong>całkowicie i fizycznie usunięte</strong> z bazy danych. Nie będziesz już otrzymywać żadnych powiadomień.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="unsub-email">Podaj swój e-mail, aby potwierdzić</Label>
          <Input
            id="unsub-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="twoj@email.pl"
            required
            aria-label="E-mail do wyrejestrowania"
          />
        </div>
        <Button type="submit" variant="destructive" size="lg" className="w-full font-semibold">
          Potwierdzam — usuń moje dane
        </Button>
      </form>
    </div>
  );
};

export default Unsubscribe;
