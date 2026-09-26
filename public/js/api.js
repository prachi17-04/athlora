const TOKEN_KEY = 'athlora_token';

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  },
};

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-TZ-Offset': String(new Date().getTimezoneOffset()),
  };
  const token = session.token;
  if (token) headers.Authorization = 'Bearer ' + token;

  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    session.clear();
    location.hash = '';
    location.reload();
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.data = data;
    throw err;
  }
  return data;
}
