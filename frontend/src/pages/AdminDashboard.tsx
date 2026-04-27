import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, ChevronDown, ChevronRight, Mail, Loader2, AlertTriangle,
  Wrench, Calendar, Pencil, CheckCircle, Timer, Archive, HardHat, X, AlertCircle, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { useEvents, updateEvent } from '@/hooks/useEvents';
import { useEventTypes } from '@/hooks/useEventTypes';
import { useDepartments } from '@/hooks/useDepartments';
import {
  type EventStatus,
  type EventType,
  type StatusChange,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/data/mockData';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatEventNumbers, formatDate, formatDateTime } from '@/lib/utils';
import { AdminMapView } from '@/components/AdminMapView';

// Ikony dla znanych typów zdarzeń (fallback dla typów spoza DB)
const TYPE_ICON_MAP: Record<string, { Icon: typeof Wrench; cls: string }> = {
  awaria: { Icon: Wrench, cls: 'text-red-500' },
  planowane_wylaczenie: { Icon: Calendar, cls: 'text-blue-500' },
  remont: { Icon: HardHat, cls: 'text-amber-500' },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250] as const;

const AdminDashboard = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [activeTab, setActiveTab] = useState('lista');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [closeId, setCloseId] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const { events, totalPages, currentPage, isLoading, error, refetch } = useEvents({
    search, statusFilter, typeFilter, deptFilter, page, limit: pageSize,
  });

  // Liczniki dla kart statusowych — stałe 4, niezależne od typów w DB
  const { totalCount: activeCount }    = useEvents({ limit: 1 });
  const { totalCount: zgloszoneCount } = useEvents({ statusFilter: 'zgloszona', limit: 1 });
  const { totalCount: wNaprawieCount } = useEvents({ statusFilter: 'w_naprawie', limit: 1 });
  const { totalCount: closedCount }    = useEvents({ statusFilter: 'usunieta', limit: 1 });

  // Typy zdarzeń z bazy — zasilają pill-e filtrowania
  const { eventTypes } = useEventTypes();
  const { departments } = useDepartments();

  const applyCardFilter = (sf: EventStatus | '') => {
    setStatusFilter(sf);
    setDeptFilter('');
    setPage(1);
    setActiveTab('lista');
  };

  const handleCloseConfirm = async () => {
    if (closeId === null) return;
    setIsClosing(true);
    try {
      await updateEvent(closeId, { status: 'usunieta' });
      toast({ title: 'Zdarzenie zakończone', description: `Zdarzenie #${closeId} zostało oznaczone jako zakończone.` });
      setCloseId(null);
      refetch();
    } catch (err) {
      toast({ title: 'Błąd zakończenia', description: (err as Error).message || 'Nie udało się zakończyć zdarzenia.', variant: 'destructive' });
    } finally {
      setIsClosing(false);
    }
  };

  const cardCls = (active: boolean) =>
    `cursor-pointer select-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring${
      active
        ? ' ring-2 ring-primary shadow-md bg-primary/10'
        : ' hover:ring-2 hover:ring-primary/30 hover:shadow-md hover:bg-muted/50'
    }`;

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status_filter', statusFilter);
    if (typeFilter) params.set('type_filter', typeFilter);
    if (deptFilter) params.set('dept_filter', deptFilter);
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
    const token = sessionStorage.getItem('mpwik_token');
    try {
      const res = await fetch(`${base}/events/export.csv?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Eksport nieudany');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `zdarzenia_eksport_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Błąd eksportu CSV', description: 'Nie udało się pobrać pliku.', variant: 'destructive' });
    }
  };

  const activeTypeDef = typeFilter ? eventTypes.find((t) => t.code === typeFilter) : null;
  const hasActiveFilter = typeFilter !== '' || deptFilter !== '' || (statusFilter !== '' && statusFilter !== 'all');

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setDeptFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold">Dashboard dyspozytora</h1>
        <Button asChild className="gap-1.5 font-semibold">
          <Link to="/admin/events/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Zgłoś nowe zdarzenie
          </Link>
        </Button>
      </div>

      {/* Karty statusowe — zawsze 4, niezależne od liczby typów */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className={cardCls(statusFilter === '')}
          role="button" tabIndex={0}
          aria-label="Pokaż wszystkie aktywne zdarzenia"
          onClick={() => applyCardFilter('')}
          onKeyDown={(e) => e.key === 'Enter' && applyCardFilter('')}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">
                Wszystkie aktywne
              </p>
              <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4.5 w-4.5 text-orange-500" aria-hidden="true" />
              </div>
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
              {activeCount ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Kliknij, aby wyświetlić</p>
          </CardContent>
        </Card>
        <Card
          className={cardCls(statusFilter === 'zgloszona')}
          role="button" tabIndex={0}
          aria-label="Filtruj: zgłoszone"
          onClick={() => applyCardFilter('zgloszona')}
          onKeyDown={(e) => e.key === 'Enter' && applyCardFilter('zgloszona')}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">
                Zgłoszone
              </p>
              <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertCircle className="h-4.5 w-4.5 text-red-500" aria-hidden="true" />
              </div>
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
              {zgloszoneCount ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Oczekują na potwierdzenie</p>
          </CardContent>
        </Card>
        <Card
          className={cardCls(statusFilter === 'w_naprawie')}
          role="button" tabIndex={0}
          aria-label="Filtruj: w naprawie"
          onClick={() => applyCardFilter('w_naprawie')}
          onKeyDown={(e) => e.key === 'Enter' && applyCardFilter('w_naprawie')}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">
                W naprawie
              </p>
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Wrench className="h-4.5 w-4.5 text-amber-500" aria-hidden="true" />
              </div>
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
              {wNaprawieCount ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Trwają prace serwisowe</p>
          </CardContent>
        </Card>
        <Card
          className={cardCls(statusFilter === 'usunieta')}
          role="button" tabIndex={0}
          aria-label="Filtruj: zamknięte zgłoszenia"
          onClick={() => applyCardFilter('usunieta')}
          onKeyDown={(e) => e.key === 'Enter' && applyCardFilter('usunieta')}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">
                Zamknięte
              </p>
              <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Archive className="h-4.5 w-4.5 text-slate-400" aria-hidden="true" />
              </div>
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
              {closedCount ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Historia zdarzeń</p>
          </CardContent>
        </Card>
      </div>


      {/* Pill-e typów zdarzeń — dynamiczne z bazy, scrollowalne poziomo */}
      {eventTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Filtruj według typu zdarzenia
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrowanie po typie zdarzenia">
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                typeFilter === ''
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground'
              }`}
              onClick={() => { setTypeFilter(''); setPage(1); setActiveTab('lista'); }}
              aria-pressed={typeFilter === ''}
            >
              Wszystkie typy
            </button>
            {eventTypes.map((t) => {
              const isActive = typeFilter === t.code;
              return (
                <button
                  key={t.code}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? 'text-white border-transparent'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground'
                  }`}
                  style={isActive
                    ? { backgroundColor: t.default_color_rgb, borderColor: t.default_color_rgb }
                    : { '--hover-color': t.default_color_rgb } as React.CSSProperties
                  }
                  onClick={() => { setTypeFilter(isActive ? '' : t.code); setPage(1); setActiveTab('lista'); }}
                  aria-pressed={isActive}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isActive ? 'white' : t.default_color_rgb }}
                    aria-hidden="true"
                  />
                  {t.name_pl}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Zakładki: Lista zdarzeń | Mapa budynków */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="lista">Lista zdarzeń</TabsTrigger>
          <TabsTrigger value="mapa">Mapa budynków</TabsTrigger>
        </TabsList>

        <TabsContent value="mapa" className="mt-4">
          <AdminMapView />
        </TabsContent>

        <TabsContent value="lista" className="mt-4 space-y-4">

          {/* Toolbar — wyszukiwarka + dział + eksport */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj po nazwie ulicy…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select
              value={deptFilter}
              onValueChange={(v) => { setDeptFilter(v === 'all' ? '' : v); setPage(1); }}
            >
              <SelectTrigger className="w-full sm:w-32" aria-label="Wybierz dział">
                <SelectValue placeholder="Dział" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie działy</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.code} value={d.code}>{d.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0 self-center"
              onClick={handleExportCsv}
              aria-label="Eksportuj widok do CSV"
            >
              <Download className="h-4 w-4" />
              Eksport CSV
            </Button>
          </div>

          {/* Baner aktywnego filtrowania */}
          {hasActiveFilter && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm">
              <span className="text-muted-foreground">Widok:</span>
              {activeTypeDef && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activeTypeDef.default_color_rgb }}
                    aria-hidden="true"
                  />
                  {activeTypeDef.name_pl}
                </span>
              )}
              {activeTypeDef && statusFilter && statusFilter !== 'all' && (
                <span className="text-muted-foreground">•</span>
              )}
              {statusFilter && statusFilter !== 'all' && (
                <span className="font-medium">
                  {STATUS_LABELS[statusFilter as EventStatus] ?? statusFilter}
                </span>
              )}
              <button
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                aria-label="Wyczyść filtry"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" />
                Wyczyść
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Ulica</TableHead>
                  <TableHead>Numery</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dział</TableHead>
                  <TableHead>Powiadomienia</TableHead>
                  <TableHead>Utworzono</TableHead>
                  <TableHead className="w-24">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      Brak zdarzeń spełniających kryteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => {
                    const isOpen = expandedRows.has(event.id);
                    const typeConfig = TYPE_ICON_MAP[event.event_type];
                    const TypeIcon = typeConfig?.Icon;
                    const typeLabel =
                      eventTypes.find((t) => t.code === event.event_type)?.name_pl
                      ?? TYPE_LABELS[event.event_type as EventType]
                      ?? event.event_type;
                    const typeColor = eventTypes.find((t) => t.code === event.event_type)?.default_color_rgb;
                    const numbersStr = formatEventNumbers(event);
                    let displayNums = numbersStr;
                    let hiddenNumsCount = 0;
                    if (numbersStr) {
                      const numList = numbersStr.split(',').map((n) => n.trim());
                      if (numList.length > 10) {
                        displayNums = numList.slice(0, 10).join(', ');
                        hiddenNumsCount = numList.length - 10;
                      }
                    }
                    return (
                      <Fragment key={event.id}>
                        <TableRow className="group hover:bg-muted/40" onClick={() => toggleRow(event.id)}>
                          <TableCell>
                            <button
                              className="p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                              aria-label={isOpen ? 'Zwiń szczegóły' : 'Rozwiń szczegóły'}
                              aria-expanded={isOpen}
                              onClick={(e) => { e.stopPropagation(); toggleRow(event.id); }}
                            >
                              {isOpen
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{event.id}</TableCell>
                          <TableCell className="font-medium">{event.street_name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="line-clamp-2 text-sm max-w-[250px]">{displayNums || '–'}</span>
                              {hiddenNumsCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                                  +{hiddenNumsCount}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1.5">
                              {TypeIcon
                                ? <TypeIcon className={`h-3.5 w-3.5 flex-shrink-0 ${typeConfig.cls}`} aria-hidden="true" />
                                : typeColor && (
                                  <span
                                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: typeColor }}
                                    aria-hidden="true"
                                  />
                                )
                              }
                              {typeLabel}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={event.status} />
                              {(event.auto_extend || event.auto_close) && (
                                <span
                                  title={event.auto_extend ? 'Auto-extend: przedłużanie o 1h' : 'Auto-close: automatyczne zamknięcie'}
                                  className="text-muted-foreground"
                                >
                                  <Timer className="h-3.5 w-3.5" aria-label={event.auto_extend ? 'Auto-extend aktywny' : 'Auto-close aktywny'} />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono">
                            {event.created_by_department ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                              <Mail className="h-3.5 w-3.5" />
                              {event.notified_count ?? '–'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {event.created_at ? formatDate(event.created_at) : '–'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button asChild variant="ghost" size="sm" aria-label={`Edytuj zdarzenie ${event.id}`}>
                                <Link to={`/admin/events/edit/${event.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Zakończ zdarzenie ${event.id}`}
                                onClick={() => setCloseId(event.id)}
                                disabled={event.status === 'usunieta'}
                              >
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={10} className="py-4 px-8">
                              <HistoryTimeline history={event.history} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginacja */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Na stronę:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
              >
                <SelectTrigger className="w-20 h-8 text-sm" aria-label="Liczba rekordów na stronę">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Strona {currentPage} z {totalPages}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
                Poprzednia
              </Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Następna
              </Button>
            </div>
          </div>

        </TabsContent>
      </Tabs>

      {/* Dialog potwierdzenia zakończenia zdarzenia */}
      <AlertDialog open={closeId !== null} onOpenChange={(open) => { if (!open) setCloseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zakończ zdarzenie #{closeId}</AlertDialogTitle>
            <AlertDialogDescription>
              Zdarzenie zostanie oznaczone jako zakończone i przeniesione do listy zamkniętych zgłoszeń. Historia i dane zostaną zachowane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseConfirm}
              disabled={isClosing}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isClosing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Zamykanie…</> : 'Zakończ zdarzenie'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function HistoryTimeline({ history }: { history: StatusChange[] }) {
  if (!history.length) {
    return <p className="text-sm text-muted-foreground">Brak historii zmian.</p>;
  }
  return (
    <ol className="relative border-l-2 border-border ml-2 space-y-4">
      {history.map((h, i) => (
        <li key={i} className="ml-4">
          <div className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
          <p className="text-sm font-medium">
            <StatusBadge status={h.old_status} className="mr-1" />
            <span className="text-muted-foreground mx-1">→</span>
            <StatusBadge status={h.new_status} />
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateTime(h.changed_at)}
            {h.note && <span className="ml-2 italic">— {h.note}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default AdminDashboard;
