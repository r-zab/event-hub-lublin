import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { EVENT_TYPE_ICONS, resolveIcon } from '@/lib/eventTypeIcons';

const CODE_RE = /^[a-z][a-z0-9_]{0,29}$/;
const DIACRITICS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

function slugify(value: string): string {
  return value
    .split('')
    .map((ch) => DIACRITICS[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function validateCode(v: string): string {
  if (!v) return 'Kod jest wymagany.';
  if (!CODE_RE.test(v))
    return 'Musi zaczynać się od litery i zawierać tylko małe litery, cyfry i podkreślenia (max 30 znaków).';
  return '';
}

interface EventTypeItem {
  id: number;
  code: string;
  name_pl: string;
  default_color_rgb: string;
  icon_key: string | null;
  is_active: boolean;
  sort_order: number;
}

async function fetchEventTypes(): Promise<EventTypeItem[]> {
  return apiFetch<EventTypeItem[]>('/event-types?only_active=false');
}

async function createEventType(body: {
  code: string;
  name_pl: string;
  default_color_rgb: string;
  icon_key: string | null;
  is_active: boolean;
  sort_order: number;
}): Promise<EventTypeItem> {
  return apiFetch<EventTypeItem>('/event-types', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function updateEventType(
  id: number,
  body: Partial<Omit<EventTypeItem, 'id' | 'code'>>,
): Promise<EventTypeItem> {
  return apiFetch<EventTypeItem>(`/event-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function deleteEventType(id: number): Promise<void> {
  return apiFetch<void>(`/event-types/${id}`, { method: 'DELETE' });
}

export default function AdminEventTypes() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newCodeError, setNewCodeError] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#1F2937');
  const [newIcon, setNewIcon] = useState<string>('alert_triangle');
  const [newSort, setNewSort] = useState<number>(0);
  const [newActive, setNewActive] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<EventTypeItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#1F2937');
  const [editIcon, setEditIcon] = useState<string>('alert_triangle');
  const [editSort, setEditSort] = useState<number>(0);
  const [editActive, setEditActive] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-event-types'],
    queryFn: fetchEventTypes,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-event-types'] });
    qc.invalidateQueries({ queryKey: ['event-types-active'] });
  };

  const createMutation = useMutation({
    mutationFn: createEventType,
    onSuccess: (item) => {
      toast({ title: 'Typ utworzony', description: `Dodano typ „${item.code}".` });
      setAddOpen(false);
      setNewCode('');
      setNewCodeError('');
      setNewName('');
      setNewColor('#1F2937');
      setNewIcon('alert_triangle');
      setNewSort(0);
      setNewActive(true);
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Omit<EventTypeItem, 'id' | 'code'>> }) =>
      updateEventType(id, body),
    onSuccess: () => {
      toast({ title: 'Typ zaktualizowany' });
      setEditOpen(false);
      setEditItem(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEventType,
    onSuccess: () => {
      toast({ title: 'Typ usunięty' });
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (item: EventTypeItem) => {
    setEditItem(item);
    setEditName(item.name_pl);
    setEditColor(item.default_color_rgb);
    setEditIcon(item.icon_key ?? 'alert_triangle');
    setEditSort(item.sort_order);
    setEditActive(item.is_active);
    setEditOpen(true);
  };

  const handleCreate = () => {
    const codeErr = validateCode(newCode);
    if (codeErr) {
      setNewCodeError(codeErr);
      return;
    }
    if (!newName.trim()) {
      toast({ title: 'Uzupełnij nazwę', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      code: newCode,
      name_pl: newName.trim(),
      default_color_rgb: newColor,
      icon_key: newIcon,
      is_active: newActive,
      sort_order: newSort,
    });
  };

  const handleEdit = () => {
    if (!editItem) return;
    if (!editName.trim()) {
      toast({ title: 'Nazwa nie może być pusta', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({
      id: editItem.id,
      body: {
        name_pl: editName.trim(),
        default_color_rgb: editColor,
        icon_key: editIcon,
        sort_order: editSort,
        is_active: editActive,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Typy zdarzeń</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Słownik typów zdarzeń wykorzystywanych przez dyspozytorów. Kod jest niemodyfikowalny po utworzeniu.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setNewCodeError(''); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Dodaj typ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy typ zdarzenia</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="et-code">Kod (np. „awaria_kanalizacji")</Label>
                <Input
                  id="et-code"
                  value={newCode}
                  onChange={(e) => {
                    const slug = slugify(e.target.value);
                    setNewCode(slug);
                    setNewCodeError(validateCode(slug));
                  }}
                  placeholder="kod_typu"
                  className={newCodeError ? 'border-destructive' : ''}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Dozwolone są tylko małe litery łacińskie, cyfry i podkreślenia.
                </p>
                {newCodeError && (
                  <p className="text-xs text-destructive mt-0.5">{newCodeError}</p>
                )}
              </div>
              <div>
                <Label htmlFor="et-name">Nazwa polska</Label>
                <Input
                  id="et-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="np. Awaria kanalizacji"
                />
              </div>
              <div>
                <Label>Ikona</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {EVENT_TYPE_ICONS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={newIcon === key}
                      onClick={() => setNewIcon(key)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                        newIcon === key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="et-color">Kolor (#RRGGBB)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="et-color"
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-10 w-16 p-1"
                    />
                    <Input
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="et-sort">Sortowanie</Label>
                  <Input
                    id="et-sort"
                    type="number"
                    value={newSort}
                    onChange={(e) => setNewSort(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="et-active" checked={newActive} onCheckedChange={setNewActive} />
                <Label htmlFor="et-active">Aktywny</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Anuluj</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Utwórz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">Błąd ładowania: {(error as Error).message}</p>
      )}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Nazwa</TableHead>
              <TableHead>Ikona</TableHead>
              <TableHead>Kolor</TableHead>
              <TableHead className="text-center">Sort</TableHead>
              <TableHead className="text-center">Aktywny</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell>{item.name_pl}</TableCell>
                <TableCell>
                  {(() => {
                    const IconComp = resolveIcon(item.icon_key);
                    return (
                      <IconComp
                        className="h-5 w-5"
                        style={{ color: item.default_color_rgb }}
                        aria-hidden="true"
                      />
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-5 h-5 rounded border"
                      style={{ backgroundColor: item.default_color_rgb }}
                    />
                    <span className="font-mono text-xs">{item.default_color_rgb}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">{item.sort_order}</TableCell>
                <TableCell className="text-center">
                  {item.is_active ? (
                    <Badge variant="default">Tak</Badge>
                  ) : (
                    <Badge variant="secondary">Nie</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Usunąć typ „{item.code}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Operacji nie można cofnąć. Jeżeli istnieją zdarzenia używające tego typu, usunięcie zostanie zablokowane — w takim przypadku użyj „Aktywny: Nie".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(item.id)}>
                            Usuń
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj typ „{editItem?.code}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="et-edit-name">Nazwa polska</Label>
              <Input
                id="et-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label>Ikona</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {EVENT_TYPE_ICONS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={editIcon === key}
                    onClick={() => setEditIcon(key)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                      editIcon === key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="et-edit-color">Kolor</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="et-edit-color"
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-10 w-16 p-1"
                  />
                  <Input
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="et-edit-sort">Sortowanie</Label>
                <Input
                  id="et-edit-sort"
                  type="number"
                  value={editSort}
                  onChange={(e) => setEditSort(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="et-edit-active" checked={editActive} onCheckedChange={setEditActive} />
              <Label htmlFor="et-edit-active">Aktywny</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Anuluj</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
