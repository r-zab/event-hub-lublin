import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Droplets, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const sidebarItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 bg-water-900 text-water-100 flex flex-col" aria-label="Panel administracyjny">
        <div className="p-4 border-b border-water-700/50">
          <Link to="/admin/dashboard" className="flex items-center gap-2 font-heading font-bold text-sm">
            <Droplets className="h-5 w-5 text-water-200" aria-hidden="true" />
            Panel MPWiK
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1" aria-label="Nawigacja admina">
          {sidebarItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
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
            className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-water-200 hover:bg-water-800 hover:text-water-100 transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Strona główna
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-water-200 hover:bg-water-800 hover:text-water-100 transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Wyloguj
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col bg-background">
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
