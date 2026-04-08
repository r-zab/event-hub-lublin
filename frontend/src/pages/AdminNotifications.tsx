import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

const PAGE_SIZE = 20;

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

const AdminNotifications = () => {
  const [page, setPage] = useState(1);
  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading, error } = useQuery<NotificationsResponse>({
    queryKey: ['admin-notifications', page],
    queryFn: () =>
      apiFetch<NotificationsResponse>(`/admin/notifications?skip=${skip}&limit=${PAGE_SIZE}`),
  });

  const totalPages = data ? Math.ceil(data.total_count / PAGE_SIZE) : 1;

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data wysyłki</TableHead>
              <TableHead>Kanał</TableHead>
              <TableHead>Odbiorca</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Zdarzenie</TableHead>
              <TableHead>Treść</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Brak wpisów w logu.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((notif) => (
              <TableRow key={notif.id}>
                <TableCell className="text-sm whitespace-nowrap">
                  {new Date(notif.sent_at).toLocaleString('pl-PL')}
                </TableCell>
                <TableCell>
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
                <TableCell className="font-medium">{notif.recipient}</TableCell>
                <TableCell>
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
                <TableCell className="text-sm text-muted-foreground">
                  {notif.event_id != null ? `#${notif.event_id}` : '—'}
                </TableCell>
                <TableCell>
                  {notif.message_text ? (
                    <span
                      className="text-xs text-muted-foreground max-w-[220px] block truncate"
                      title={notif.message_text}
                    >
                      {notif.message_text}
                    </span>
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

export default AdminNotifications;
