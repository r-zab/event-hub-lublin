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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

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

interface MessageTemplateItem {
  id: number;
  code: string;
  body: string;
  event_type_id: number | null;
  is_active: boolean;
}

interface EventTypeItem {
  id: number;
  code: string;
  name_pl: string;
}

async function fetchTemplates(): Promise<MessageTemplateItem[]> {
  return apiFetch<MessageTemplateItem[]>('/message-templates?only_active=false');
}

async function fetchEventTypes(): Promise<EventTypeItem[]> {
  return apiFetch<EventTypeItem[]>('/event-types?only_active=false');
}

interface CreateBody {
  code: string;
  body: string;
  event_type_id: number | null;
  is_active: boolean;
}

async function createTemplate(body: CreateBody): Promise<MessageTemplateItem> {
  return apiFetch<MessageTemplateItem>('/message-templates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function updateTemplate(
  id: number,
  body: Partial<Omit<MessageTemplateItem, 'id'>>,
): Promise<MessageTemplateItem> {
  return apiFetch<MessageTemplateItem>(`/message-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function deleteTemplate(id: number): Promise<void> {
  return apiFetch<void>(`/message-templates/${id}`, { method: 'DELETE' });
}

const NONE_VALUE = '__none__';

export default function AdminMessageTemplates() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newCodeError, setNewCodeError] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newType, setNewType] = useState<string>(NONE_VALUE);
  const [newActive, setNewActive] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<MessageTemplateItem | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editCodeError, setEditCodeError] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editType, setEditType] = useState<string>(NONE_VALUE);
  const [editActive, setEditActive] = useState(true);

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['admin-message-templates'],
    queryFn: fetchTemplates,
  });

  const { data: eventTypes } = useQuery({
    queryKey: ['admin-event-types'],
    queryFn: fetchEventTypes,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-message-templates'] });

  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      toast({ title: 'Szablon utworzony' });
      setAddOpen(false);
      setNewCode('');
      setNewCodeError('');
      setNewBody('');
      setNewType(NONE_VALUE);
      setNewActive(true);
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Omit<MessageTemplateItem, 'id'>> }) =>
      updateTemplate(id, body),
    onSuccess: () => {
      toast({ title: 'Szablon zaktualizowany' });
      setEditOpen(false);
      setEditItem(null);
      setEditCodeError('');
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      toast({ title: 'Szablon usunięty' });
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (item: MessageTemplateItem) => {
    setEditItem(item);
    setEditCode(item.code);
    setEditCodeError('');
    setEditBody(item.body);
    setEditType(item.event_type_id === null ? NONE_VALUE : String(item.event_type_id));
    setEditActive(item.is_active);
    setEditOpen(true);
  };

  const typeLabel = (id: number | null): string => {
    if (id === null) return 'Uniwersalny';
    return eventTypes?.find((t) => t.id === id)?.name_pl ?? `id=${id}`;
  };

  const handleCreate = () => {
    const codeErr = validateCode(newCode);
    if (codeErr) {
      setNewCodeError(codeErr);
      return;
    }
    if (!newBody.trim()) {
      toast({ title: 'Uzupełnij treść', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      code: newCode,
      body: newBody.trim(),
      event_type_id: newType === NONE_VALUE ? null : parseInt(newType, 10),
      is_active: newActive,
    });
  };

  const handleEdit = () => {
    if (!editItem) return;
    const codeErr = validateCode(editCode);
    if (codeErr) {
      setEditCodeError(codeErr);
      return;
    }
    if (!editBody.trim()) {
      toast({ title: 'Treść nie może być pusta', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({
      id: editItem.id,
      body: {
        code: editCode,
        body: editBody.trim(),
        event_type_id: editType === NONE_VALUE ? null : parseInt(editType, 10),
        is_active: editActive,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Szablony komunikatów</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gotowe teksty wstawiane do pola „Opis" w formularzu zdarzenia. Można je przypisać do typu lub pozostawić uniwersalne.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setNewCodeError(''); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Dodaj szablon
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy szablon</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="mt-code">Kod (np. „woda_niezdatna")</Label>
                <Input
                  id="mt-code"
                  value={newCode}
                  onChange={(e) => {
                    const slug = slugify(e.target.value);
                    setNewCode(slug);
                    setNewCodeError(validateCode(slug));
                  }}
                  placeholder="kod_szablonu"
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
                <Label htmlFor="mt-type">Typ zdarzenia (opcjonalnie)</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger id="mt-type">
                    <SelectValue placeholder="Uniwersalny" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Uniwersalny</SelectItem>
                    {eventTypes?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name_pl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="mt-body">Treść</Label>
                <Textarea
                  id="mt-body"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={5}
                  placeholder="Np. Woda niezdatna do picia. Prosimy o przegotowanie przed spożyciem..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="mt-active" checked={newActive} onCheckedChange={setNewActive} />
                <Label htmlFor="mt-active">Aktywny</Label>
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

      {templates && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Treść</TableHead>
              <TableHead className="text-center">Aktywny</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell>
                  <Badge variant="outline">{typeLabel(item.event_type_id)}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                  {item.body}
                </TableCell>
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
                          <AlertDialogTitle>Usunąć szablon „{item.code}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Operacji nie można cofnąć.
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

      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditCodeError(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj szablon</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="mt-edit-code">Kod</Label>
              <Input
                id="mt-edit-code"
                value={editCode}
                onChange={(e) => {
                  const slug = slugify(e.target.value);
                  setEditCode(slug);
                  setEditCodeError(validateCode(slug));
                }}
                className={editCodeError ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dozwolone są tylko małe litery łacińskie, cyfry i podkreślenia.
              </p>
              {editCodeError && (
                <p className="text-xs text-destructive mt-0.5">{editCodeError}</p>
              )}
            </div>
            <div>
              <Label htmlFor="mt-edit-type">Typ zdarzenia</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger id="mt-edit-type">
                  <SelectValue placeholder="Uniwersalny" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Uniwersalny</SelectItem>
                  {eventTypes?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name_pl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mt-edit-body">Treść</Label>
              <Textarea
                id="mt-edit-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={5}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="mt-edit-active" checked={editActive} onCheckedChange={setEditActive} />
              <Label htmlFor="mt-edit-active">Aktywny</Label>
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
