const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function expectArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label} response. Expected an array.`);
  }
  return value;
}

export function expectObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} response. Expected an object.`);
  }
  return value;
}

export async function api(path, options = {}) {
  if (import.meta.env.PROD && !base) {
    throw new Error('Production API URL is not configured. Set VITE_API_BASE_URL in Vercel and redeploy.');
  }

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
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const message = response.ok
      ? 'The API returned a web page instead of JSON. Check VITE_API_BASE_URL and the backend deployment.'
      : `Request failed (${response.status}). Check the API deployment and VITE_API_BASE_URL.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error('The API returned invalid JSON. Check the backend deployment.');
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}
