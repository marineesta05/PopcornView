export function getCsrfToken() {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='));
  if (!m) return null;
  return decodeURIComponent(m.split('=')[1] || '');
}

export function attachCsrfHeader(headers = {}) {
  const t = getCsrfToken();
  if (t) headers['x-csrf-token'] = t;
  return headers;
}
