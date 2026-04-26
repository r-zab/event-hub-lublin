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
import type { DepartmentItem } from '@/hooks/useDepartments';

async function fetchDepartments(): Promise<DepartmentItem[]> {
  return apiFetch<DepartmentItem[]>('/departments?only_active=false');
}

async function createDepartment(body: { code: string; name: string; is_active: boolean }): Promise<DepartmentItem> {
  return apiFetch<DepartmentItem>('/departments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function updateDepartment(id: number, body: { name?: string; is_active?: boolean }): Promise<DepartmentItem> {
  return apiFetch<DepartmentItem>(`/departments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function deleteDepartment(id: number): Promise<void> {
  return apiFetch<void>(`/departments/${id}`, { method: 'DELETE' });
}

export default function AdminDepartments() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newActive, setNewActive] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<DepartmentItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: fetchDepartments,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-departments'] });
    qc.invalidateQueries({ queryKey: ['departments'] });
  };

  const createMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: (item) => {
      toast({ title: 'Dział utworzony', description: `Dodano dział „${item.code}".` });
      setAddOpen(false);
      setNewCode('');
      setNewName('');
      setNewActive(true);
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name?: string; is_active?: boolean } }) =>
      updateDepartment(id, body),
    onSuccess: () => {
      toast({ title: 'Dział zaktualizowany' });
      setEditOpen(false);
      setEditItem(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      toast({ title: 'Dział usunięty' });
      invalidate();
    },
    onError: (err: Error) => toast({ title: 'Błąd', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (item: DepartmentItem) => {
    setEditItem(item);
    setEditName(item.name);
    setEditActive(item.is_active);
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!newCode.trim() || !newName.trim()) {
      toast({ title: 'Uzupełnij kod i nazwę', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ code: newCode.trim(), name: newName.trim(), is_active: newActive });
  };

  const handleEdit = () => {
    if (!editItem) return;
    if (!editName.trim()) {
      toast({ title: 'Nazwa nie może być pusta', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({ id: editItem.id, body: { name: editName.trim(), is_active: editActive } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Działy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Słownik działów organizacyjnych przypisywanych do użytkowników i zdarzeń. Kod jest niemodyfikowalny po utworzeniu.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Dodaj dział
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy dział</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dept-code">Kod (wielkie litery, max 5 znaków, np. „TSK")</Label>
                <Input
                  id="dept-code"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="TSK"
                  maxLength={5}
                />
              </div>
              <div>
                <Label htmlFor="dept-name">Nazwa działu</Label>
                <Input
                  id="dept-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="np. Techniczny - Sieć Kanalizacyjna"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="dept-active" checked={newActive} onCheckedChange={setNewActive} />
                <Label htmlFor="dept-active">Aktywny</Label>
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
              <TableHead className="text-center">Aktywny</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs font-semibold">{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
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
                          <AlertDialogTitle>Usunąć dział „{item.code}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Operacji nie można cofnąć. Jeżeli do działu są przypisani użytkownicy, usunięcie zostanie zablokowane — w takim przypadku użyj „Aktywny: Nie".
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
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Brak działów.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj dział „{editItem?.code}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="dept-edit-name">Nazwa działu</Label>
              <Input
                id="dept-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="dept-edit-active" checked={editActive} onCheckedChange={setEditActive} />
              <Label htmlFor="dept-edit-active">Aktywny</Label>
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
