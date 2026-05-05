import { Link, Outlet, useLocation } from 'react-router-dom';
import { Droplets, Map, UserPlus, Info, ShieldCheck, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccessibilityWidget } from '@/components/AccessibilityWidget';

const navItems = [
  { to: '/', label: 'Mapa', short: 'Mapa', icon: Map },
  { to: '/register', label: 'Rejestracja', short: 'Rejestr.', icon: UserPlus },
  { to: '/unsubscribe', label: 'Wyrejestruj', short: 'Wyrej.', icon: UserMinus },
  { to: '/about', label: 'O systemie', short: 'O syst.', icon: Info },
];

export function PublicLayout() {
  const { pathname } = useLocation();

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-12 md:h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-heading font-bold text-base md:text-lg text-primary" aria-label="Strona główna — System Powiadomień MPWiK Lublin">
            <Droplets className="h-5 w-5 md:h-6 md:w-6" aria-hidden="true" />
            <span className="hidden md:inline">Powiadomienia MPWiK</span>
          </Link>

          <nav className="flex items-center gap-0.5 md:gap-1" aria-label="Nawigacja główna">
            {navItems.map(({ to, label, short, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-label={label}
                className={cn(
                  'flex flex-col md:flex-row items-center gap-0.5 md:gap-1.5 rounded-md px-1.5 md:px-2.5 py-1 md:py-1.5 font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  pathname === to ? 'bg-accent text-primary font-semibold' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
                <span className="text-[10px] leading-tight md:hidden">{short}</span>
                <span className="hidden md:inline text-xs">{label}</span>
              </Link>
            ))}
            <AccessibilityWidget />
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
            to="/sys-panel/login"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
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
