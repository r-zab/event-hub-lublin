const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('mpwik_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...defaultHeaders,
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
