import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Droplets, Home, Users, MessageSquare, UserCog, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const allSidebarItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/admin/subscribers', label: 'Subskrybenci', icon: Users, adminOnly: true },
  { to: '/admin/notifications', label: 'Logi powiadomień', icon: MessageSquare, adminOnly: true },
  { to: '/admin/users', label: 'Użytkownicy', icon: UserCog, adminOnly: true },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout, role } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarItems = allSidebarItems.filter(item => !item.adminOnly || role === 'admin');

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
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
      <div className="p-3 border-t border-water-700/50 space-y-1">
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop sidebar — ukryty poniżej lg */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-water-900 text-water-100 flex-col" aria-label="Panel administracyjny">
        <SidebarNav />
      </aside>

      <div className="flex-1 flex flex-col bg-background min-w-0">
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
          <Link to="/admin/dashboard" className="flex items-center gap-2 font-heading font-bold text-sm">
            <Droplets className="h-5 w-5 text-water-200" aria-hidden="true" />
            Panel MPWiK
          </Link>
        </header>

        <main className="flex-1 p-4 lg:p-6 min-w-0 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
