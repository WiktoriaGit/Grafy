/**
 * Smoke test API: health, PUT graphs, research-studies CRUD.
 * Uruchom przy działającym serwerze: node scripts/smoke-api.mjs
 */
const API = process.env.API_URL || 'http://localhost:3001/api'

async function req(path, options) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`${options?.method || 'GET'} ${path} → ${response.status}: ${JSON.stringify(body)}`)
  return body
}

const stamp = Date.now()
const health = await req('/health')
console.log('health', health.status, health.database)

const created = await req('/graphs', {
  method: 'POST',
  body: JSON.stringify({
    name: `Smoke ${stamp}`,
    directed: false,
    libraryId: `smoke-lib-${stamp}`,
    updatedAt: new Date().toISOString(),
    nodes: [{ id: 'A', position: { x: 0, y: 0 } }, { id: 'B', position: { x: 1, y: 0 } }],
    edges: [{ id: 'e1', source: 'A', target: 'B', label: '1', data: { weight: 1 } }],
  }),
})
console.log('created graph', created.id)

const updated = await req(`/graphs/${created.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    name: `Smoke ${stamp} updated`,
    directed: false,
    libraryId: `smoke-lib-${stamp}`,
    updatedAt: new Date().toISOString(),
    nodes: [{ id: 'A', position: { x: 0, y: 0 } }, { id: 'B', position: { x: 2, y: 0 } }],
    edges: [{ id: 'e1', source: 'A', target: 'B', label: '2', data: { weight: 2 } }],
  }),
})
console.log('updated graph', updated.id, updated.name)

const studyId = `smoke-study-${stamp}`
await req('/research-studies', {
  method: 'POST',
  body: JSON.stringify({
    id: studyId,
    name: 'Smoke study',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: { seed: 1 },
    plan: [],
    cases: [],
    interpretation: ['ok'],
    hypothesisVerdict: 'inconclusive',
    hypothesisNote: 'smoke',
  }),
})
const studies = await req('/research-studies')
console.log('studies count', studies.length)

await req('/experiments', {
  method: 'POST',
  body: JSON.stringify({
    clientId: `smoke-exp-${stamp}`,
    algorithm: 'bfs',
    vertexCount: 2,
    edgeCount: 1,
    density: 100,
    repetitions: 1,
    meanMs: 1,
    minMs: 1,
    maxMs: 1,
    medianMs: 1,
    stdMs: 0,
    status: 'ran',
  }),
})
const experiments = await req('/experiments')
console.log('experiments count', experiments.length)

console.log('SMOKE_OK')
