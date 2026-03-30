import { Link, Outlet, useLocation } from 'react-router-dom';
import { Droplets, Map, UserPlus, Info, ShieldCheck, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Mapa', icon: Map },
  { to: '/register', label: 'Rejestracja', icon: UserPlus },
  { to: '/unsubscribe', label: 'Wyrejestruj', icon: UserMinus },
  { to: '/about', label: 'O systemie', icon: Info },
];

export function PublicLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-heading font-bold text-lg text-primary" aria-label="Strona główna Event Hub Lublin">
            <Droplets className="h-6 w-6" aria-hidden="true" />
            <span className="hidden sm:inline">Event Hub Lublin</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Nawigacja główna">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  pathname === to ? 'bg-accent text-primary font-semibold' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border/60 bg-muted/30 py-6">
        <div className="container flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <span>Projekt studencki — Politechnika Lubelska (Sztuczna Inteligencja w Biznesie)</span>
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            aria-label="Panel dyspozytora"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Panel Dyspozytora
          </Link>
        </div>
      </footer>
    </div>
  );
}
