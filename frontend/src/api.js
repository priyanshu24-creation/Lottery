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
  let response;
  try {
    response = await fetch(`/api${path}`, {
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
      ? 'The API returned a web page instead of JSON. Check the unified Netlify API deployment.'
      : `Request failed (${response.status}). Check the unified Netlify API deployment.`;
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
