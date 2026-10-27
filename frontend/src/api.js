const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${base}/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}
