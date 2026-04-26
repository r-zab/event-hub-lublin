import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Map,
  Search,
  Pencil,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

interface StreetAdminItem {
  id: number;
  teryt_sym_ul: string | null;
  name: string;
  full_name: string;
  street_type: string | null;
  city: string;
  geocoded: boolean;
}

interface StreetPageResponse {
  items: StreetAdminItem[];
  total_count: number;
}

// ---------------------------------------------------------------------------
// Zod schema formularza edycji
// ---------------------------------------------------------------------------

const editSchema = z.object({
  name: z
    .string()
    .min(1, 'Nazwa nie może być pusta.')
    .max(20, 'Nazwa nie może przekraczać 20 znaków.')
    .regex(
      /^[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż0-9\s]+$/,
      'Tylko litery polskiego alfabetu, cyfry i spacje.',
    ),
});

type EditFormValues = z.infer<typeof editSchema>;

// ---------------------------------------------------------------------------
// Stałe
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
type SortBy = 'teryt_id' | 'name';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Nagłówek z sortowaniem
// ---------------------------------------------------------------------------

function SortableHead({
  label,
  column,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  column: SortBy;
  currentSort: SortBy;
  currentDir: SortDir;
  onSort: (col: SortBy) => void;
  className?: string;
}) {
  const active = currentSort === column;
  const Icon = active ? (currentDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${className ?? ''}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon
          className={`h-3.5 w-3.5 ${active ? 'text-foreground' : 'text-muted-foreground/50'}`}
        />
      </span>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Główny komponent
// ---------------------------------------------------------------------------

const AdminStreetsDatabase = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showUngeocoded, setShowUngeocoded] = useState(false);
  const [editStreet, setEditStreet] = useState<StreetAdminItem | null>(null);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '' },
  });

  const skip = (page - 1) * PAGE_SIZE;
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(PAGE_SIZE),
    sort_by: sortBy,
    sort_dir: sortDir,
  });
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (showUngeocoded) params.set('is_geocoded', 'false');

  const { data, isLoading, error } = useQuery<StreetPageResponse>({
    queryKey: ['streets-admin', page, debouncedSearch, sortBy, sortDir, showUngeocoded],
    queryFn: () => apiFetch<StreetPageResponse>(`/streets/manage?${params.toString()}`),
  });

  const totalPages = data ? Math.ceil(data.total_count / PAGE_SIZE) : 1;

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch<StreetAdminItem>(`/streets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: 'Ulica zaktualizowana' });
      setEditStreet(null);
      qc.invalidateQueries({ queryKey: ['streets-admin'] });
    },
    onError: (err: Error) =>
      toast({ title: 'Błąd aktualizacji', description: err.message, variant: 'destructive' }),
  });

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as unknown as { _streetTimer?: ReturnType<typeof setTimeout> })._streetTimer);
    (window as unknown as { _streetTimer?: ReturnType<typeof setTimeout> })._streetTimer = setTimeout(
      () => {
        setDebouncedSearch(v);
        setPage(1);
      },
      400,
    );
  };

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const openEdit = (street: StreetAdminItem) => {
    setEditStreet(street);
    form.reset({ name: street.name });
  };

  const onSubmit = (values: EditFormValues) => {
    if (!editStreet) return;
    if (values.name === editStreet.name) {
      setEditStreet(null);
      return;
    }
    updateMutation.mutate({ id: editStreet.id, body: { name: values.name } });
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
        Błąd ładowania bazy ulic: {(error as Error).message}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Nagłówek */}
        <div className="flex items-center gap-3">
          <Map className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold">
              Baza Ulic
              {data && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  ({data.total_count})
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Rejestr ulic TERYT — ulica jest geokodowana gdy posiada trasę GeoJSON z OSM.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Szukaj ulicy..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-9 bg-background"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="ungeocoded-toggle"
              checked={showUngeocoded}
              onCheckedChange={(v) => {
                setShowUngeocoded(v);
                setPage(1);
              }}
            />
            <Label htmlFor="ungeocoded-toggle" className="text-sm cursor-pointer whitespace-nowrap">
              Tylko bez trasy GeoJSON
            </Label>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>Geokodowana</span>
            <XCircle className="h-4 w-4 text-red-500 ml-2" />
            <span>Brak trasy</span>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Kod TERYT"
                  column="teryt_id"
                  currentSort={sortBy}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHead
                  label="Nazwa"
                  column="name"
                  currentSort={sortBy}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <TableHead className="w-32">Typ ulicy</TableHead>
                <TableHead className="w-28">Miasto</TableHead>
                <TableHead className="w-36 text-center">Status geokodowania</TableHead>
                <TableHead className="w-24 text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.items || data.items.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {debouncedSearch
                      ? 'Nie znaleziono ulic dla podanej frazy.'
                      : 'Brak ulic w bazie.'}
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((street) => (
                <TableRow key={street.id}>
                  <TableCell className="py-3 font-mono text-sm">
                    {street.teryt_sym_ul ?? (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="font-medium text-sm">{street.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">id={street.id}</div>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-muted-foreground">
                    {street.street_type ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 text-sm">{street.city}</TableCell>
                  <TableCell className="py-3 text-center">
                    {street.geocoded ? (
                      <Badge
                        variant="default"
                        className="bg-green-600 hover:bg-green-600 text-white gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Geokodowana
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground gap-1">
                        <XCircle className="h-3 w-3" />
                        Brak trasy
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <div className="inline-flex gap-1.5 items-center justify-end">
                      <Button variant="outline" size="sm" onClick={() => openEdit(street)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edytuj</span>
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="cursor-not-allowed opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Usuń</span>
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-56 text-center">
                          Usuwanie zablokowane — ulica pochodzi ze słownika TERYT. Skontaktuj się z
                          administratorem bazy danych.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Paginacja */}
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
              disabled={page === totalPages}
            >
              Następna
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Modal edycji */}
        <Dialog open={!!editStreet} onOpenChange={(open) => !open && setEditStreet(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edytuj ulicę</DialogTitle>
              {editStreet && (
                <p className="text-sm text-muted-foreground">
                  ID TERYT:{' '}
                  <span className="font-mono font-medium">
                    {editStreet.teryt_sym_ul ?? '—'}
                  </span>{' '}
                  · {editStreet.city}
                </p>
              )}
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nazwa ulicy</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Lipowa" maxLength={20} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditStreet(null)}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Zapisz
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default AdminStreetsDatabase;
