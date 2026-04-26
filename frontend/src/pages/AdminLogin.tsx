import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Droplets, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginValue || !password) {
      toast({ title: 'Błąd', description: 'Wypełnij wszystkie pola.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    const success = await login(loginValue, password);
    setIsSubmitting(false);
    if (success) {
      // Hard reload flushes React Query cache — prevents stale admin/dispatcher data cross-contamination
      window.location.href = '/admin/dashboard';
    } else {
      toast({ title: 'Błąd', description: 'Nieprawidłowe dane logowania.', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Droplets className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-xl font-bold">Panel Dyspozytora</h1>
          <p className="text-sm text-muted-foreground">MPWiK Lublin — logowanie</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-lg border border-border/60 shadow-sm">
          <div>
            <Label htmlFor="admin-login">Login</Label>
            <Input id="admin-login" value={loginValue} onChange={(e) => setLoginValue(e.target.value)} placeholder="dyspozytor" required aria-label="Login" />
          </div>
          <div>
            <Label htmlFor="admin-password">Hasło</Label>
            <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required aria-label="Hasło" />
          </div>
          <Button type="submit" className="w-full font-semibold" disabled={isSubmitting}>
            {isSubmitting ? 'Logowanie…' : 'Zaloguj się'}
          </Button>
        </form>

        <div className="text-center">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Wróć na stronę główną
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
