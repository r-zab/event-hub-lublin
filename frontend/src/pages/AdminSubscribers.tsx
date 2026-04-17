import { useState, useMemo } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AddressItem {
  street_name: string;
  house_number: string;
  flat_number?: string | null;
}

interface SubscriberItem {
  id: number;
  email: string | null;
  phone: string | null;
  rodo_consent: boolean;
  night_sms_consent: boolean;
  notify_by_email: boolean;
  notify_by_sms: boolean;
  created_at: string;
  addresses: AddressItem[];
}

interface SubscribersResponse {
  items: SubscriberItem[];
  total_count: number;
}

const PAGE_SIZE = 20;

const AdminSubscribers = () => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [streetFilter, setStreetFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'sms' | 'email'>('all');
  const [nightOnly, setNightOnly] = useState(false);
  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading, error } = useQuery<SubscribersResponse>({
    queryKey: ['admin-subscribers', page],
    queryFn: () =>
      apiFetch<SubscribersResponse>(`/admin/subscribers?skip=${skip}&limit=${PAGE_SIZE}`),
  });

  const totalPages = data ? Math.ceil(data.total_count / PAGE_SIZE) : 1;

  const uniqueStreets = useMemo(() => {
    const names = new Set<string>();
    data?.items.forEach((s) => s.addresses.forEach((a) => names.add(a.street_name)));
    return Array.from(names).sort();
  }, [data?.items]);

  const filteredItems = useMemo(() => {
    let items = data?.items ?? [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (s) =>
          (s.email?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.includes(q) ?? false),
      );
    }
    if (streetFilter !== 'all') {
      items = items.filter((s) =>
        s.addresses.some((a) => a.street_name === streetFilter),
      );
    }
    if (channelFilter === 'sms') {
      items = items.filter((s) => s.notify_by_sms);
    } else if (channelFilter === 'email') {
      items = items.filter((s) => s.notify_by_email);
    }
    if (nightOnly) {
      items = items.filter((s) => s.night_sms_consent);
    }

    return items;
  }, [data?.items, searchQuery, streetFilter, channelFilter, nightOnly]);

  const formatAddress = (addr: AddressItem) => {
    const flat = addr.flat_number ? `/${addr.flat_number}` : '';
    return `${addr.street_name} ${addr.house_number}${flat}`;
  };

  const hasFilters = searchQuery || streetFilter !== 'all' || channelFilter !== 'all' || nightOnly;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-water-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Błąd ładowania subskrybentów: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">
          Subskrybenci
          {data && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({data.total_count})
            </span>
          )}
        </h1>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        {/* Wyszukiwarka */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="E-mail lub telefon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background"
          />
        </div>

        {/* Dropdown ulicy */}
        <Select value={streetFilter} onValueChange={setStreetFilter}>
          <SelectTrigger className="w-44 h-9 bg-background" aria-label="Filtr ulicy">
            <SelectValue placeholder="Ulica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie ulice</SelectItem>
            {uniqueStreets.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dropdown kanału */}
        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as typeof channelFilter)}>
          <SelectTrigger className="w-36 h-9 bg-background" aria-label="Filtr kanału">
            <SelectValue placeholder="Kanał" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kanały</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
          </SelectContent>
        </Select>

        {/* Przełącznik zgody nocnej */}
        <div className="flex items-center gap-2">
          <Switch
            id="night-filter"
            checked={nightOnly}
            onCheckedChange={setNightOnly}
          />
          <Label htmlFor="night-filter" className="text-sm cursor-pointer whitespace-nowrap">
            Zgoda nocna
          </Label>
        </div>

        {/* Licznik */}
        <span className="ml-auto text-sm font-medium whitespace-nowrap">
          Znaleziono:{' '}
          <span className="text-foreground">{filteredItems.length}</span>{' '}
          <span className="text-muted-foreground">subskrybentów</span>
        </span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Kanały</TableHead>
              <TableHead>Zgody</TableHead>
              <TableHead>Adresy</TableHead>
              <TableHead>Data rejestracji</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {hasFilters ? 'Brak wyników dla wybranych filtrów.' : 'Brak subskrybentów.'}
                </TableCell>
              </TableRow>
            )}
            {filteredItems.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell className="font-medium">{sub.email ?? <span className="text-muted-foreground">Brak</span>}</TableCell>
                <TableCell>{sub.phone ?? <span className="text-muted-foreground">Brak</span>}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {sub.notify_by_email && (
                      <span className="text-xs bg-blue-100 text-blue-800 rounded px-1.5 py-0.5">
                        E-mail
                      </span>
                    )}
                    {sub.notify_by_sms && (
                      <span className="text-xs bg-green-100 text-green-800 rounded px-1.5 py-0.5">
                        SMS
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs space-y-0.5">
                    <div className={sub.rodo_consent ? 'text-green-700' : 'text-red-600'}>
                      RODO: {sub.rodo_consent ? 'Tak' : 'Nie'}
                    </div>
                    <div className={sub.night_sms_consent ? 'text-green-700' : 'text-muted-foreground'}>
                      SMS nocny: {sub.night_sms_consent ? 'Tak' : 'Nie'}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs space-y-0.5">
                    {sub.addresses.length === 0 ? (
                      <span className="text-muted-foreground">Brak</span>
                    ) : (
                      sub.addresses.map((addr, i) => (
                        <div key={i}>{formatAddress(addr)}</div>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(sub.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40"
          >
            Poprzednia
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40"
          >
            Następna
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminSubscribers;
