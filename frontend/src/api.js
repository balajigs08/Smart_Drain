const BASE = '/api'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  getDrains:   ()      => apiFetch('/drains'),
  getDrain:    (id)    => apiFetch(`/drains/${id}`),
  getHistory:  (id, limit = 100) => apiFetch(`/drains/${id}/history?limit=${limit}`),
  getIncidents: ()     => apiFetch('/incidents'),
  getDashboard: ()     => apiFetch('/dashboard'),
  getPriorityQueue: () => apiFetch('/priority-queue'),
  getHealth:   ()      => apiFetch('/health'),

  acknowledge: (id, notes) => apiFetch(`/incidents/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),
  dispatch: (id, notes) => apiFetch(`/incidents/${id}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),
  resolve: (id, notes) => apiFetch(`/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),

  // Demo
  simulate: (scenario) => apiFetch('/demo/simulate', {
    method: 'POST',
    body: JSON.stringify({ scenario }),
  }),
  startAutoStream: (scenario, interval_ms) => apiFetch('/demo/autostream', {
    method: 'POST',
    body: JSON.stringify({ scenario, interval_ms }),
  }),
  stopAutoStream: () => apiFetch('/demo/autostream/stop', { method: 'POST' }),
}
