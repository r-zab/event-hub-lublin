import { useState, useMemo, useEffect } from 'react';
import { History, Search, ChevronLeft, ChevronRight, Eye, Download, Loader2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface AuditLogItem {
  id: number;
  source: 'building' | 'street' | 'event';
  entity_id: number;
  action: string;
  user_id: number | null;
  username: string | null;
  full_name: string | null;
  timestamp: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  note: string | null;
}

interface AuditLogList {
  items: AuditLogItem[];
  total_count: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250] as const;

const SOURCE_LABELS: Record<string, string> = {
  building: 'Budynek',
  street: 'Ulica',
  event: 'Zdarzenie',
};

const SOURCE_COLORS: Record<string, string> = {
  building: 'bg-orange-100 text-orange-800',
  street: 'bg-blue-100 text-blue-800',
  event: 'bg-purple-100 text-purple-800',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Utwórz',
  update: 'Aktualizuj',
  delete: 'Usuń',
  status_change: 'Zmiana statusu',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-yellow-100 text-yellow-800',
  delete: 'bg-red-100 text-red-800',
  status_change: 'bg-purple-100 text-purple-800',
};

function DiffView({ old_data, new_data }: { old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }) {
  const allKeys = Array.from(new Set([
    ...Object.keys(old_data ?? {}),
    ...Object.keys(new_data ?? {}),
  ]));

  if (allKeys.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Brak danych do wyświetlenia.</p>;
  }

  return (
    <div className="space-y-2">
      {allKeys.map((key) => {
        const oldVal = old_data?.[key];
        const newVal = new_data?.[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div key={key} className={`rounded p-2 text-sm ${changed ? 'bg-yellow-50 border border-yellow-200' : 'bg-muted/30'}`}>
            <span className="font-mono text-xs font-semibold text-muted-foreground uppercase">{key}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Przed</p>
                <p className={`font-mono text-xs break-all ${changed ? 'text-red-700 line-through' : ''}`}>
                  {oldVal !== undefined ? String(oldVal) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Po</p>
                <p className={`font-mono text-xs break-all ${changed ? 'text-green-700 font-semibold' : ''}`}>
                  {newVal !== undefined ? String(newVal) : '—'}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const AdminAuditLogs = () => {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [debouncedUser, setDebouncedUser] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedUser]);

  const skip = (page - 1) * pageSize;

  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(pageSize),
  });
  if (sourceFilter !== 'all') params.set('source', sourceFilter);
  if (actionFilter !== 'all') params.set('action_filter', actionFilter);
  if (debouncedUser) params.set('user_filter', debouncedUser);

  const { data, isLoading, error } = useQuery<AuditLogList>({
    queryKey: ['audit-logs', page, pageSize, sourceFilter, actionFilter, debouncedUser],
    queryFn: () => apiFetch<AuditLogList>(`/admin/audit-logs?${params.toString()}`),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / pageSize)) : 1;

  const availableActions = useMemo(() => {
    if (sourceFilter === 'event') return ['status_change'];
    if (sourceFilter === 'building' || sourceFilter === 'street') return ['create', 'update', 'delete'];
    return ['create', 'update', 'delete', 'status_change'];
  }, [sourceFilter]);

  const handleUserSearch = (v: string) => {
    setUserSearch(v);
    clearTimeout((window as unknown as { _auditTimer?: ReturnType<typeof setTimeout> })._auditTimer);
    (window as unknown as { _auditTimer?: ReturnType<typeof setTimeout> })._auditTimer = setTimeout(() => {
      setDebouncedUser(v);
      setPage(1);
    }, 400);
  };

  const handleExportCsv = async () => {
    const exportParams = new URLSearchParams();
    if (sourceFilter !== 'all') exportParams.set('source', sourceFilter);
    if (actionFilter !== 'all') exportParams.set('action_filter', actionFilter);
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
    const token = sessionStorage.getItem('mpwik_token');
    try {
      const res = await fetch(`${base}/admin/audit-logs/export.csv?${exportParams.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Eksport nieudany');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `logi_audytowe_eksport_${dateStr}.csv`;
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
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-heading font-bold">
            Logi dyspozytorów
            {data && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({data.total_count})
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Operacje na budynkach, ulicach oraz zmiany statusów zdarzeń.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Użytkownik..."
            value={userSearch}
            onChange={(e) => handleUserSearch(e.target.value)}
            className="pl-9 h-9 bg-background"
          />
        </div>

        <Select
          value={sourceFilter}
          onValueChange={(v) => { setSourceFilter(v); setActionFilter('all'); setPage(1); }}
        >
          <SelectTrigger className="w-40 h-9 bg-background" aria-label="Filtr źródła">
            <SelectValue placeholder="Źródło" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie źródła</SelectItem>
            <SelectItem value="building">Budynki</SelectItem>
            <SelectItem value="street">Ulice</SelectItem>
            <SelectItem value="event">Zdarzenia</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={actionFilter}
          onValueChange={(v) => { setActionFilter(v); setPage(1); }}
        >
          <SelectTrigger className="w-44 h-9 bg-background" aria-label="Filtr akcji">
            <SelectValue placeholder="Akcja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie akcje</SelectItem>
            {availableActions.map((a) => (
              <SelectItem key={a} value={a}>{ACTION_LABELS[a] ?? a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Data</TableHead>
              <TableHead className="w-28">Źródło</TableHead>
              <TableHead className="w-28">Akcja</TableHead>
              <TableHead className="w-24">ID obiektu</TableHead>
              <TableHead>Wykonał</TableHead>
              <TableHead>Notatka</TableHead>
              <TableHead className="w-16 text-right">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!data?.items || data.items.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Brak wpisów dla wybranych filtrów.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((log) => (
              <TableRow key={`${log.source}-${log.id}`}>
                <TableCell className="text-sm whitespace-nowrap py-3">
                  {formatDateTime(log.timestamp)}
                </TableCell>
                <TableCell className="py-3">
                  <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${SOURCE_COLORS[log.source] ?? 'bg-gray-100 text-gray-700'}`}>
                    {SOURCE_LABELS[log.source] ?? log.source}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                </TableCell>
                <TableCell className="py-3 font-mono text-sm text-muted-foreground">
                  #{log.entity_id}
                </TableCell>
                <TableCell className="py-3">
                  <div className="text-sm font-medium">{log.username ?? <span className="text-muted-foreground italic">system</span>}</div>
                  {log.full_name && (
                    <div className="text-xs text-muted-foreground">{log.full_name}</div>
                  )}
                </TableCell>
                <TableCell className="py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                  {log.note ?? '—'}
                </TableCell>
                <TableCell className="py-3 text-right">
                  {(log.old_data || log.new_data) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                      aria-label="Pokaż różnice"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Poprzednia
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Następna
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Dialog z diff */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${SOURCE_COLORS[selectedLog?.source ?? ''] ?? ''}`}>
                {SOURCE_LABELS[selectedLog?.source ?? ''] ?? ''}
              </span>
              #{selectedLog?.entity_id} — {ACTION_LABELS[selectedLog?.action ?? ''] ?? selectedLog?.action}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              {selectedLog && formatDateTime(selectedLog.timestamp)}
              {selectedLog?.username && ` · ${selectedLog.username}`}
            </p>
            {selectedLog && (
              <DiffView old_data={selectedLog.old_data} new_data={selectedLog.new_data} />
            )}
            {selectedLog?.note && (
              <div className="rounded bg-muted/50 p-2 text-sm">
                <span className="text-xs font-semibold text-muted-foreground">Notatka: </span>
                {selectedLog.note}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAuditLogs;
