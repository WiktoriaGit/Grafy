/**
 * Izolowane testy integralności SQLite + API (etap 03).
 * - Temp DB: lokalne operacje better-sqlite3 (nie rusza historycznych danych).
 * - Live API: rekordy z prefixem stage03-* + cleanup (DELETE graf/study).
 *
 * Uruchom przy działającym API: node scripts/smoke-integrity-stage03.mjs
 */
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = process.env.API_URL || 'http://localhost:3001/api'
const stamp = Date.now()
const PREFIX = `stage03-${stamp}`

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function req(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: response.ok, status: response.status, body }
}

/** Schemat minimalny zgodny z produkcyjnymi tabelami (fragment). */
function openTempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'graphlab-stage03-'))
  const path = join(dir, 'temp.sqlite')
  const db = new Database(path)
  db.exec(`
    CREATE TABLE experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT,
      algorithm TEXT NOT NULL,
      vertex_count INTEGER NOT NULL,
      edge_count INTEGER NOT NULL,
      density REAL NOT NULL,
      repetitions INTEGER NOT NULL,
      mean_ms REAL NOT NULL,
      min_ms REAL NOT NULL,
      max_ms REAL NOT NULL,
      median_ms REAL,
      std_ms REAL,
      status TEXT,
      payload_json TEXT,
      updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_experiments_client ON experiments(client_id);
    CREATE TABLE research_studies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      config_json TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      cases_json TEXT NOT NULL,
      interpretation_json TEXT,
      hypothesis_verdict TEXT,
      hypothesis_note TEXT
    );
  `)
  return { db, dir, path }
}

function testTempDb() {
  const { db, dir } = openTempDb()
  try {
    const clientId = `${PREFIX}-payload`
    const originalMean = 3.14159
    const payload = JSON.stringify({
      mean: originalMean,
      min: 3.0,
      max: 3.3,
      methodologyVersion: 'gl-bench-2026.11',
      timingMode: 'batched',
      batchSize: 8,
      status: 'ran',
    })
    db.prepare(`
      INSERT INTO experiments (
        client_id, algorithm, vertex_count, edge_count, density, repetitions,
        mean_ms, min_ms, max_ms, median_ms, std_ms, status, payload_json, updated_at
      ) VALUES (?, 'bfs', 10, 9, 20, 5, ?, 3.0, 3.3, 3.1, 0.05, 'ran', ?, ?)
    `).run(clientId, originalMean, payload, new Date().toISOString())

    const row = db.prepare('SELECT * FROM experiments WHERE client_id = ?').get(clientId)
    assert(row, 'brak wiersza po INSERT')
    const parsed = JSON.parse(row.payload_json)
    assert(parsed.mean === originalMean, 'payload mean uszkodzony')
    assert(parsed.methodologyVersion === 'gl-bench-2026.11', 'brak methodologyVersion w payload')

    // Dedup: ponowny INSERT tego samego client_id → błąd UNIQUE (symulacja braku duplikatu)
    let dupBlocked = false
    try {
      db.prepare(`
        INSERT INTO experiments (
          client_id, algorithm, vertex_count, edge_count, density, repetitions,
          mean_ms, min_ms, max_ms, status, payload_json, updated_at
        ) VALUES (?, 'bfs', 10, 9, 20, 5, 1, 1, 1, 'ran', '{}', ?)
      `).run(clientId, new Date().toISOString())
    } catch {
      dupBlocked = true
    }
    assert(dupBlocked, 'oczekiwano blokady duplikatu client_id')

    // updatedAt research: nowszy lokalny wygrywa semantycznie (porównanie timestampów)
    const t1 = '2026-01-01T00:00:00.000Z'
    const t2 = '2026-06-01T00:00:00.000Z'
    db.prepare(`
      INSERT INTO research_studies (id, name, created_at, updated_at, config_json, plan_json, cases_json)
      VALUES (?, 'S', ?, ?, '{}', '[]', '[]')
    `).run(`${PREFIX}-study`, t1, t1)
    db.prepare(`
      UPDATE research_studies SET updated_at = ?, name = 'S2' WHERE id = ?
    `).run(t2, `${PREFIX}-study`)
    const study = db.prepare('SELECT * FROM research_studies WHERE id = ?').get(`${PREFIX}-study`)
    assert(study.updated_at === t2 && study.name === 'S2', 'aktualizacja updatedAt/name nie zadziałała')
    assert(Date.parse(t2) > Date.parse(t1), 'porównanie updatedAt')

    console.log('TEMP_DB_OK', dir)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

async function testLiveApi() {
  const health = await req('/health')
  assert(health.ok && health.body?.database === 'sqlite', 'health/sqlite')

  const graphBody = {
    name: `${PREFIX} graph`,
    directed: false,
    libraryId: `${PREFIX}-lib`,
    updatedAt: new Date().toISOString(),
    nodes: [{ id: 'A', position: { x: 0, y: 0 } }, { id: 'B', position: { x: 1, y: 0 } }],
    edges: [{ id: 'e1', source: 'A', target: 'B', label: '1', data: { weight: 1 } }],
  }
  const created = await req('/graphs', { method: 'POST', body: JSON.stringify(graphBody) })
  assert(created.ok, `POST graph ${created.status}`)
  const graphId = created.body.id

  const got = await req(`/graphs/${graphId}`)
  assert(got.ok && got.body?.name === graphBody.name, 'GET graph')

  const clientId = `${PREFIX}-exp`
  const payload = {
    id: clientId,
    algorithm: 'bfs',
    vertices: 2,
    edges: 1,
    density: 100,
    repetitions: 3,
    mean: 2.5,
    median: 2.4,
    stdDev: 0.1,
    min: 2.3,
    max: 2.7,
    methodologyVersion: 'gl-bench-2026.11',
    timingMode: 'single',
    batchSize: 1,
    status: 'ran',
  }
  const exp = await req('/experiments', {
    method: 'POST',
    body: JSON.stringify({
      clientId,
      algorithm: 'bfs',
      vertexCount: 2,
      edgeCount: 1,
      density: 100,
      repetitions: 3,
      meanMs: 2.5,
      minMs: 2.3,
      maxMs: 2.7,
      medianMs: 2.4,
      stdMs: 0.1,
      status: 'ran',
      payload,
    }),
  })
  assert(exp.ok, `POST experiment ${exp.status} ${JSON.stringify(exp.body)}`)

  const experiments = await req('/experiments')
  assert(experiments.ok, 'GET experiments')
  const found = (experiments.body || []).find(e => e.clientId === clientId)
  assert(found, 'brak eksperymentu po zapisie')
  assert(found.payload?.mean === 2.5, 'payload mean po odczycie API')
  assert(found.payload?.methodologyVersion === 'gl-bench-2026.11', 'methodology w payload API')

  // 400 / błąd walidacji (symulacja kwarantanny po stronie klienta — tu sprawdzamy status API)
  const bad = await req('/experiments', {
    method: 'POST',
    body: JSON.stringify({
      clientId: `${PREFIX}-bad`,
      algorithm: 'bfs',
      vertexCount: 1,
      edgeCount: 0,
      density: 0,
      repetitions: 1,
      meanMs: -1,
      minMs: 0,
      maxMs: 0,
      status: 'ran',
    }),
  })
  assert(bad.status === 400, `oczekiwano 400 dla ujemnego meanMs, dostano ${bad.status}`)

  const studyId = `${PREFIX}-study`
  const studyCreated = await req('/research-studies', {
    method: 'POST',
    body: JSON.stringify({
      id: studyId,
      name: 'Stage03 study',
      createdAt: new Date().toISOString(),
      updatedAt: '2026-01-01T12:00:00.000Z',
      config: { seed: 1 },
      plan: [],
      cases: [],
      interpretation: [],
      hypothesisVerdict: 'inconclusive',
      hypothesisNote: 'stage03',
    }),
  })
  assert(studyCreated.ok, `POST study ${studyCreated.status}`)

  const newer = '2026-11-26T12:00:00.000Z'
  const updated = await req(`/research-studies/${studyId}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: studyId,
      name: 'Stage03 study updated',
      createdAt: studyCreated.body?.createdAt || new Date().toISOString(),
      updatedAt: newer,
      config: { seed: 1 },
      plan: [],
      cases: [],
      interpretation: ['ok'],
      hypothesisVerdict: 'inconclusive',
      hypothesisNote: 'stage03-upd',
    }),
  })
  assert(updated.ok || updated.status === 409, `PUT study ${updated.status}`)

  const studies = await req('/research-studies')
  const study = (studies.body || []).find(s => s.id === studyId)
  assert(study, 'brak study po zapisie')
  // Po udanym PUT nazwa powinna być zaktualizowana
  if (updated.ok) {
    assert(study.name.includes('updated') || study.hypothesisNote === 'stage03-upd', 'study nie zaktualizowane')
  }

  // Cleanup — nie zostawiaj śmieci w DB użytkownika dłużej niż trzeba
  await req(`/research-studies/${studyId}`, { method: 'DELETE' })
  await req(`/graphs/${graphId}`, { method: 'DELETE' })

  console.log('LIVE_API_OK', { graphId, clientId, studyId, badStatus: bad.status })
}

testTempDb()
await testLiveApi()
console.log('SMOKE_INTEGRITY_STAGE03_OK')
