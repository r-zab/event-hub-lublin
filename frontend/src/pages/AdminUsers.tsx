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
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, ShieldCheck, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

interface UserItem {
  id: number;
  username: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface UserListResponse {
  items: UserItem[];
  total_count: number;
}

interface CreateUserBody {
  username: string;
  password: string;
  full_name?: string;
  role: 'admin' | 'dispatcher';
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchUsers(): Promise<UserListResponse> {
  return apiFetch<UserListResponse>('/admin/users');
}

async function createUser(body: CreateUserBody): Promise<UserItem> {
  return apiFetch<UserItem>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function updateUserRole(userId: number, role: 'admin' | 'dispatcher'): Promise<UserItem> {
  return apiFetch<UserItem>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

async function toggleUserActive(userId: number, is_active: boolean): Promise<UserItem> {
  return apiFetch<UserItem>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
}

async function deleteUser(userId: number): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Komponent główny
// ---------------------------------------------------------------------------

export default function AdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'dispatcher'>('dispatcher');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      toast({ title: 'Konto utworzone', description: `Użytkownik „${user.username}" został dodany.` });
      setAddDialogOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewRole('dispatcher');
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Błąd', description: err.message, variant: 'destructive' });
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'admin' | 'dispatcher' }) =>
      updateUserRole(id, role),
    onSuccess: () => {
      toast({ title: 'Rola zmieniona' });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Błąd', description: err.message, variant: 'destructive' });
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      toggleUserActive(id, is_active),
    onSuccess: (user) => {
      toast({ title: user.is_active ? 'Konto aktywowane' : 'Konto dezaktywowane' });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Błąd', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      toast({ title: 'Konto usunięte' });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Błąd', description: err.message, variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast({ title: 'Uzupełnij login i hasło', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Hasło musi mieć min. 8 znaków', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      username: newUsername.trim(),
      password: newPassword,
      full_name: newFullName.trim() || undefined,
      role: newRole,
    });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Użytkownicy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zarządzaj kontami administratorów i dyspozytorów systemu MPWiK.
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Dodaj konto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nowe konto użytkownika</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-username">Login</Label>
                <Input
                  id="new-username"
                  placeholder="np. dyspozytor1"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Hasło (min. 8 znaków)</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-fullname">Imię i nazwisko (opcjonalnie)</Label>
                <Input
                  id="new-fullname"
                  placeholder="np. Jan Kowalski"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rola</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'dispatcher')}>
                  <SelectTrigger aria-label="Wybierz rolę">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dispatcher">Dyspozytor</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={createMutation.isPending}>
                Anuluj
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Tworzenie…</>
                ) : (
                  'Utwórz konto'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stan ładowania / błąd */}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ładowanie użytkowników…
        </div>
      )}
      {error && (
        <div className="text-sm text-destructive">
          Błąd: {error instanceof Error ? error.message : 'Nieznany błąd'}
        </div>
      )}

      {/* Tabela */}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            Łącznie: <span className="font-semibold text-foreground">{data.total_count}</span> kont
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Login</TableHead>
                  <TableHead>Imię i nazwisko</TableHead>
                  <TableHead>Rola</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data utworzenia</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-sm font-medium">{user.username}</TableCell>
                    <TableCell className="text-muted-foreground">{user.full_name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === 'admin' ? 'default' : 'secondary'}
                        className="flex items-center gap-1 w-fit"
                      >
                        {user.role === 'admin' ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        {user.role === 'admin' ? 'Administrator' : 'Dyspozytor'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'outline' : 'destructive'}>
                        {user.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {/* Zmiana roli */}
                        <Select
                          value={user.role}
                          onValueChange={(v) =>
                            roleMutation.mutate({ id: user.id, role: v as 'admin' | 'dispatcher' })
                          }
                          disabled={roleMutation.isPending}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={`Zmień rolę użytkownika ${user.username}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dispatcher">Dyspozytor</SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Aktywacja / deaktywacja */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          disabled={activeMutation.isPending}
                          onClick={() =>
                            activeMutation.mutate({ id: user.id, is_active: !user.is_active })
                          }
                        >
                          {user.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                        </Button>

                        {/* Usunięcie */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={deleteMutation.isPending}
                              aria-label={`Usuń konto ${user.username}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Usuń konto</AlertDialogTitle>
                              <AlertDialogDescription>
                                Konto <strong>{user.username}</strong> zostanie trwale usunięte.
                                Tej operacji nie można cofnąć.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Anuluj</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate(user.id)}
                              >
                                Usuń konto
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Brak użytkowników.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
