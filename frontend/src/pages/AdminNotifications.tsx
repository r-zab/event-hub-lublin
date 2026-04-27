import { useState, useMemo, useCallback } from 'react';
import { Loader2, Search, ShieldCheck, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface NotificationItem {
  id: number;
  event_id: number | null;
  subscriber_id: number | null;
  channel: 'sms' | 'email';
  recipient: string;
  message_text: string | null;
  status: string;
  sent_at: string;
  error_message: string | null;
}

interface NotificationsResponse {
  items: NotificationItem[];
  total_count: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250] as const;

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'E-mail',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  queued_morning: 'bg-yellow-100 text-yellow-800',
  queued: 'bg-yellow-100 text-yellow-800',
};

const ROW_BG: Record<string, string> = {
  sent: 'bg-green-50/50',
  failed: 'bg-red-50/50',
};

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isLast7Days(dateStr: string): boolean {
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return d >= cutoff;
}

const AdminNotifications = () => {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'sms' | 'email'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'last7'>('all');
  const skip = (page - 1) * pageSize;

  const { data, isLoading, error } = useQuery<NotificationsResponse>({
    queryKey: ['admin-notifications', page, pageSize],
    queryFn: () =>
      apiFetch<NotificationsResponse>(`/admin/notifications?skip=${skip}&limit=${pageSize}`),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / pageSize)) : 1;

  const filteredItems = useMemo(() => {
    let items = data?.items ?? [];

    if (channelFilter !== 'all') {
      items = items.filter((n) => n.channel === channelFilter);
    }
    if (statusFilter === 'sent') {
      items = items.filter((n) => n.status === 'sent');
    } else if (statusFilter === 'failed') {
      items = items.filter((n) => n.status === 'failed');
    }
    if (periodFilter === 'today') {
      items = items.filter((n) => isToday(n.sent_at));
    } else if (periodFilter === 'last7') {
      items = items.filter((n) => isLast7Days(n.sent_at));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (n) =>
          n.recipient.toLowerCase().includes(q) ||
          (n.message_text ?? '').toLowerCase().includes(q),
      );
    }

    return items;
  }, [data?.items, searchQuery, channelFilter, statusFilter, periodFilter]);

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    const sent = items.filter((n) => n.status === 'sent').length;
    const total = items.length;
    const rate = total > 0 ? Math.round((sent / total) * 100) : 0;
    return { sent, total, rate };
  }, [data?.items]);

  const hasFilters =
    searchQuery || channelFilter !== 'all' || statusFilter !== 'all' || periodFilter !== 'all';

  const handleExportCsv = async () => {
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
    const token = sessionStorage.getItem('mpwik_token');
    try {
      const res = await fetch(`${base}/admin/notifications/export.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Eksport nieudany');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `logi_powiadomien_eksport_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Błąd eksportu CSV', variant: 'destructive' });
    }
  };

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
        Błąd ładowania logów: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">
          Log powiadomień
          {data && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({data.total_count})
            </span>
          )}
        </h1>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted-foreground">
            Wysłano łącznie:{' '}
            <span className="font-semibold text-foreground">{stats.sent}</span>
          </span>
          <span className="text-muted-foreground">
            Skuteczność:{' '}
            <span className={`font-semibold ${stats.rate >= 90 ? 'text-green-700' : stats.rate >= 70 ? 'text-yellow-700' : 'text-red-700'}`}>
              {stats.rate}%
            </span>
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        {/* Wyszukiwarka */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Odbiorca lub treść..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-9 h-9 bg-background"
          />
        </div>

        {/* Dropdown kanału */}
        <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v as typeof channelFilter); setPage(1); }}>
          <SelectTrigger className="w-36 h-9 bg-background" aria-label="Filtr kanału">
            <SelectValue placeholder="Kanał" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kanały</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
          </SelectContent>
        </Select>

        {/* Dropdown statusu */}
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
          <SelectTrigger className="w-36 h-9 bg-background" aria-label="Filtr statusu">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="sent">Sukces</SelectItem>
            <SelectItem value="failed">Błąd</SelectItem>
          </SelectContent>
        </Select>

        {/* Dropdown okresu */}
        <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v as typeof periodFilter); setPage(1); }}>
          <SelectTrigger className="w-36 h-9 bg-background" aria-label="Filtr okresu">
            <SelectValue placeholder="Okres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="today">Dzisiaj</SelectItem>
            <SelectItem value="last7">Ostatnie 7 dni</SelectItem>
          </SelectContent>
        </Select>

        {/* Selektor liczby rekordów na stronę + eksport */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Na stronę:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
          >
            <SelectTrigger className="w-20 h-9 bg-background" aria-label="Liczba rekordów na stronę">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm whitespace-nowrap">
            <span className="font-medium text-foreground">{filteredItems.length}</span>{' '}
            <span className="text-muted-foreground">z {data?.items.length ?? 0}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleExportCsv}
            aria-label="Eksportuj do CSV"
          >
            <Download className="h-4 w-4" />
            Eksport CSV
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data wysyłki</TableHead>
              <TableHead>Kanał</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Odbiorca
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600 cursor-help" aria-label="Dane zamaskowane zgodnie z RODO" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      Dane zamaskowane zgodnie z polityką RODO — pełne dane przechowywane są wyłącznie w systemie subskrybentów.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Zdarzenie</TableHead>
              <TableHead>Treść</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {hasFilters ? 'Brak wyników dla wybranych filtrów.' : 'Brak wpisów w logu.'}
                </TableCell>
              </TableRow>
            )}
            {filteredItems.map((notif) => (
              <TableRow key={notif.id} className={ROW_BG[notif.status] ?? ''}>
                <TableCell className="py-3 text-sm whitespace-nowrap">
                  {formatDateTime(notif.sent_at)}
                </TableCell>
                <TableCell className="py-3">
                  <span
                    className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                      notif.channel === 'sms'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {CHANNEL_LABELS[notif.channel] ?? notif.channel}
                  </span>
                </TableCell>
                <TableCell className="py-3 font-mono text-sm">{notif.recipient}</TableCell>
                <TableCell className="py-3">
                  <span
                    className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                      STATUS_COLORS[notif.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {notif.status}
                  </span>
                  {notif.error_message && (
                    <div className="text-xs text-destructive mt-0.5 max-w-[180px] truncate" title={notif.error_message}>
                      {notif.error_message}
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-3 text-sm text-muted-foreground">
                  {notif.event_id != null ? `#${notif.event_id}` : '—'}
                </TableCell>
                <TableCell className="py-3">
                  {notif.message_text ? (
                    <div className="max-w-[280px]">
                      <p className={`text-xs text-muted-foreground break-words ${expandedIds.has(notif.id) ? '' : 'line-clamp-2'}`}>
                        {notif.message_text}
                      </p>
                      {notif.message_text.length > 80 && (
                        <button
                          onClick={() => toggleExpand(notif.id)}
                          className="text-xs text-blue-600 hover:underline mt-0.5 focus:outline-none"
                        >
                          {expandedIds.has(notif.id) ? 'Zwiń' : 'Rozwiń'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
            disabled={page >= totalPages}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40"
          >
            Następna
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
