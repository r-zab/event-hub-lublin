const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('mpwik_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function clearSessionAndRedirect() {
  localStorage.removeItem('mpwik_token');
  localStorage.removeItem('mpwik_refresh_token');
  window.location.href = '/admin/login';
}

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('mpwik_refresh_token');
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data: { access_token?: string; refresh_token?: string } = await res.json();
    if (!data.access_token) return null;
    localStorage.setItem('mpwik_token', data.access_token);
    if (data.refresh_token) {
      localStorage.setItem('mpwik_refresh_token', data.refresh_token);
    }
    return data.access_token;
  } catch {
    return null;
  }
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
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (!newToken) {
      clearSessionAndRedirect();
      return undefined as T;
    }
    const retryRes = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...defaultHeaders,
        Authorization: `Bearer ${newToken}`,
        ...(init?.headers ?? {}),
      },
    });
    if (retryRes.status === 401) {
      clearSessionAndRedirect();
      return undefined as T;
    }
    if (!retryRes.ok) {
      const body = await retryRes.text().catch(() => '');
      throw new Error(body || `HTTP ${retryRes.status}`);
    }
    if (retryRes.status === 204) return undefined as T;
    return retryRes.json();
  }
  if (res.status === 429) {
    throw new Error("Zbyt wiele zapytań — odczekaj chwilę i spróbuj ponownie.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
