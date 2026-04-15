import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, ChevronDown, ChevronRight, Mail, Loader2, AlertTriangle, Wrench, Calendar, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { useEvents, deleteEvent } from '@/hooks/useEvents';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatEventNumbers, formatDate, formatDateTime } from '@/lib/utils';
import { AdminMapView } from '@/components/AdminMapView';

const AdminDashboard = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<EventType | ''>('');
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { events, allEvents, totalPages, currentPage, isLoading, error, refetch } = useEvents({
    search, statusFilter, typeFilter, page,
  });

  const handleDeleteConfirm = async () => {
    if (deleteId === null) return;
    setIsDeleting(true);
    try {
      await deleteEvent(deleteId);
      toast({ title: 'Zdarzenie usunięte', description: `Zdarzenie #${deleteId} zostało usunięte.` });
      setDeleteId(null);
      refetch();
    } catch (err: any) {
      toast({ title: 'Błąd usuwania', description: err.message || 'Nie udało się usunąć zdarzenia.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const activeCount = allEvents.filter((e) => e.status !== 'usunieta').length;
  const awaria = allEvents.filter((e) => e.event_type === 'awaria' && e.status !== 'usunieta').length;
  const planowane = allEvents.filter((e) => e.event_type === 'planowane_wylaczenie' && e.status !== 'usunieta').length;

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangle className="h-8 w-8 text-status-reported" />
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Aktywne zdarzenia</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Wrench className="h-8 w-8 text-status-repairing" />
            <div>
              <p className="text-2xl font-bold">{awaria}</p>
              <p className="text-sm text-muted-foreground">Awarie</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Calendar className="h-8 w-8 text-status-planned" />
            <div>
              <p className="text-2xl font-bold">{planowane}</p>
              <p className="text-sm text-muted-foreground">Planowane wyłączenia</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zakładki: Lista zdarzeń | Mapa budynków */}
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Lista zdarzeń</TabsTrigger>
          <TabsTrigger value="mapa">Mapa budynków</TabsTrigger>
        </TabsList>

        <TabsContent value="mapa" className="mt-4">
          <AdminMapView />
        </TabsContent>

        <TabsContent value="lista" className="mt-4 space-y-6">

      {/* Toolbar */}
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
          value={typeFilter}
          onValueChange={(v) => { setTypeFilter(v as EventType | ''); setPage(1); }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Typ zdarzenia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie typy</SelectItem>
            {(Object.entries(TYPE_LABELS) as [EventType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v as EventStatus | ''); setPage(1); }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {(Object.entries(STATUS_LABELS) as [EventStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
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
              <TableHead>Powiadomienia</TableHead>
              <TableHead>Utworzono</TableHead>
              <TableHead className="w-24">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  Brak zdarzeń spełniających kryteria.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => {
                const isOpen = expandedRows.has(event.id);
                return (
                  <Fragment key={event.id}>
                    <TableRow className="group cursor-pointer hover:bg-muted/40" onClick={() => toggleRow(event.id)}>
                      <TableCell>
                        <button className="p-1" aria-label="Rozwiń historię">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.id}</TableCell>
                      <TableCell className="font-medium">{event.street_name}</TableCell>
                      <TableCell>{formatEventNumbers(event) || '–'}</TableCell>
                      <TableCell className="text-sm">{TYPE_LABELS[event.event_type]}</TableCell>
                      <TableCell><StatusBadge status={event.status} /></TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {event.notified_count ?? '–'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
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
                            aria-label={`Usuń zdarzenie ${event.id}`}
                            onClick={() => setDeleteId(event.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={9} className="py-4 px-8">
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Strona {currentPage} z {totalPages}
        </p>
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń zdarzenie #{deleteId}</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Zdarzenie wraz z historią zmian zostanie trwale usunięte z bazy danych.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Usuwanie…</> : 'Usuń zdarzenie'}
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
