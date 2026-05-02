import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Droplets, Home, Users, MessageSquare, UserCog, Menu, Tags, FileText, Building2, History, Map, CircleUserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { AccessibilityWidget } from '@/components/AccessibilityWidget';

const allSidebarItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/admin/streets', label: 'Baza Ulic', icon: Map, adminOnly: false },
  { to: '/admin/subscribers', label: 'Subskrybenci', icon: Users, adminOnly: true },
  { to: '/admin/notifications', label: 'Logi powiadomień', icon: MessageSquare, adminOnly: true },
  { to: '/admin/logs', label: 'Logi dyspozytorów', icon: History, adminOnly: true },
  { to: '/admin/users', label: 'Użytkownicy', icon: UserCog, adminOnly: true },
  { to: '/admin/event-types', label: 'Typy zdarzeń', icon: Tags, adminOnly: true },
  { to: '/admin/message-templates', label: 'Szablony', icon: FileText, adminOnly: true },
  { to: '/admin/departments', label: 'Działy', icon: Building2, adminOnly: true },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout, role, username, department, sessionExpired, acknowledgeSessionExpiry } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarItems = allSidebarItems.filter(item => !item.adminOnly || role === 'admin');

  const handleLogout = () => {
    logout();
    navigate('/sys-panel/login');
  };

  const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="p-4 border-b border-water-700/50">
        <Link
          to="/admin/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 font-heading font-bold text-sm"
        >
          <Droplets className="h-5 w-5 text-water-200" aria-hidden="true" />
          Panel MPWiK
        </Link>
      </div>
      <div className="px-3 py-2.5 border-b border-water-700/50">
        <div className="flex items-start gap-2.5 bg-water-800/60 rounded-lg px-3 py-2.5">
          <CircleUserRound className="h-4 w-4 text-water-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] text-water-400 uppercase tracking-wide font-medium leading-none mb-1">
              Zalogowano jako:
            </p>
            <p className="text-sm font-semibold text-water-100 truncate" title={username ?? undefined}>
              {username ?? '—'}
            </p>
            <p className="text-xs text-water-400 mt-0.5">
              Rola:{' '}
              <span className="text-water-200 font-medium">
                {role === 'admin' ? 'Administrator' : role === 'dispatcher' ? 'Dyspozytor' : '—'}
              </span>
              {department ? <span className="text-water-400"> · {department}</span> : null}
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1" aria-label="Nawigacja admina">
        {sidebarItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              pathname.startsWith(to)
                ? 'bg-water-700/50 text-water-100'
                : 'text-water-200 hover:bg-water-800 hover:text-water-100'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 pb-6 border-t border-water-700/50 space-y-1">
        <AccessibilityWidget
          align="start"
          triggerClassName="w-full justify-start text-water-200 hover:bg-water-800 hover:text-water-100"
        />
        <Link
          to="/"
          onClick={onNavigate}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-water-200 hover:bg-water-800 hover:text-water-100 transition-colors"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Strona główna
        </Link>
        <button
          onClick={() => { onNavigate?.(); handleLogout(); }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-water-200 hover:bg-water-800 hover:text-water-100 transition-colors"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Wyloguj
        </button>
      </div>
    </>
  );

  const handleLoginRedirect = () => {
    acknowledgeSessionExpiry();
    logout();
    navigate('/sys-panel/login');
  };

  return (
    <>
      {sessionExpired && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expired-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center space-y-5">
            <div className="flex justify-center">
              <div className="bg-red-100 rounded-full p-3">
                <LogOut className="h-8 w-8 text-red-600" aria-hidden="true" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 id="session-expired-title" className="text-lg font-bold text-gray-900">
                Sesja wygasła
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Zostałeś wylogowany, ponieważ wykryto logowanie na Twoje konto
                z innego urządzenia lub przeglądarki.
              </p>
            </div>
            <button
              onClick={handleLoginRedirect}
              className="w-full bg-water-700 hover:bg-water-800 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              Przejdź do logowania
            </button>
          </div>
        </div>
      )}
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
      {/* Desktop sidebar — ukryty poniżej lg */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-water-900 text-water-100 flex-col overflow-y-auto" aria-label="Panel administracyjny">
        <SidebarNav />
      </aside>

      <div className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
        {/* Mobile header — widoczny tylko poniżej lg */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-water-900 text-water-100 shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-water-100 hover:bg-water-800 hover:text-water-100"
                aria-label="Otwórz menu nawigacji"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-water-900 text-water-100 border-water-700">
              <div className="flex flex-col h-full">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Link to="/admin/dashboard" className="flex-1 flex items-center gap-2 font-heading font-bold text-sm">
            <Droplets className="h-5 w-5 text-water-200" aria-hidden="true" />
            Panel MPWiK
          </Link>
          <AccessibilityWidget triggerClassName="text-water-200 hover:bg-water-800 hover:text-water-100" />
        </header>

        <main className="flex-1 p-4 lg:p-6 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </>
  );
}
