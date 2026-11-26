import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { db, migrationSummary } from './db.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '15mb' }));

const graphSchema = z.object({
  name: z.string().trim().min(1).max(120),
  directed: z.boolean(),
  nodes: z.array(z.object({ id: z.string().min(1) }).passthrough()).max(10000),
  edges: z.array(z.object({ id: z.string().min(1), source: z.string(), target: z.string() }).passthrough()).max(100000),
  libraryId: z.string().trim().min(1).max(80).nullable().optional(),
  origin: z.string().trim().max(40).optional(),
  updatedAt: z.string().datetime().optional(),
});

const experimentSchema = z.object({
  graphId: z.number().int().positive().nullable().optional(),
  clientId: z.string().trim().min(1).max(120).optional(),
  runId: z.string().trim().max(120).nullable().optional(),
  algorithm: z.enum(['bfs', 'dfs', 'dijkstra', 'bellman', 'prim', 'kruskal']),
  vertexCount: z.number().int().min(1),
  edgeCount: z.number().int().min(0),
  // density/repetitions: przyjmujemy szerszy zakres wejścia, potem normalizujemy (bez utraty pomiaru).
  density: z.number().finite(),
  repetitions: z.number().int().min(0),
  seed: z.number().int().nullable().optional(),
  meanMs: z.number().finite().min(0),
  minMs: z.number().finite().min(0),
  maxMs: z.number().finite().min(0),
  medianMs: z.number().finite().min(0).nullable().optional(),
  stdMs: z.number().finite().min(0).nullable().optional(),
  operations: z.number().int().min(0).nullable().optional(),
  topology: z.string().max(40).nullable().optional(),
  status: z.enum(['ran', 'skipped', 'error']).optional(),
  sourceLabel: z.string().max(240).nullable().optional(),
  directed: z.boolean().optional(),
  weightMin: z.number().finite().nullable().optional(),
  weightMax: z.number().finite().nullable().optional(),
  generateMs: z.number().finite().min(0).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  updatedAt: z.string().optional(),
}).transform((x) => {
  const meanMs = x.meanMs;
  return {
    ...x,
    density: Math.min(100, Math.max(0, x.density)),
    repetitions: Math.max(1, x.repetitions),
    minMs: Math.min(x.minMs, meanMs),
    maxMs: Math.max(x.maxMs, meanMs),
  };
}).refine(x => x.minMs <= x.meanMs && x.meanMs <= x.maxMs, { message: 'Niespójne statystyki czasu' });

const researchStudySchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()),
  plan: z.array(z.unknown()),
  cases: z.array(z.unknown()),
  interpretation: z.array(z.string()).optional(),
  hypothesisVerdict: z.string().max(40).nullable().optional(),
  hypothesisNote: z.string().max(4000).nullable().optional(),
});

function mapGraphRow(row, includePayload = false) {
  const base = {
    id: row.id,
    name: row.name,
    directed: Boolean(row.directed),
    created_at: row.created_at,
    updated_at: row.updated_at,
    libraryId: row.library_id ?? null,
    origin: row.origin ?? 'sqlite',
  };
  if (!includePayload) return base;
  return {
    ...base,
    nodes: JSON.parse(row.nodes_json),
    edges: JSON.parse(row.edges_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExperimentRow(row) {
  let payload = null;
  if (row.payload_json) {
    try { payload = JSON.parse(row.payload_json); } catch { payload = null; }
  }
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    graphId: row.graph_id ?? null,
    runId: row.run_id ?? null,
    algorithm: row.algorithm,
    vertexCount: row.vertex_count,
    edgeCount: row.edge_count,
    density: row.density,
    repetitions: row.repetitions,
    seed: row.seed,
    meanMs: row.mean_ms,
    minMs: row.min_ms,
    maxMs: row.max_ms,
    medianMs: row.median_ms ?? null,
    stdMs: row.std_ms ?? null,
    operations: row.operations,
    topology: row.topology ?? null,
    status: row.status ?? 'ran',
    sourceLabel: row.source_label ?? null,
    directed: Boolean(row.directed),
    weightMin: row.weight_min ?? null,
    weightMax: row.weight_max ?? null,
    generateMs: row.generate_ms ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    payload,
  };
}

function mapStudyRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    config: JSON.parse(row.config_json),
    plan: JSON.parse(row.plan_json),
    cases: JSON.parse(row.cases_json),
    interpretation: JSON.parse(row.interpretation_json || '[]'),
    hypothesisVerdict: row.hypothesis_verdict ?? 'unset',
    hypothesisNote: row.hypothesis_note ?? '',
  };
}

function validateGraphIds(g) {
  const ids = new Set(g.nodes.map(n => n.id));
  if (ids.size !== g.nodes.length || g.edges.some(e => !ids.has(e.source) || !ids.has(e.target))) {
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    migrations: migrationSummary,
    time: new Date().toISOString(),
  });
});

app.get('/api/graphs', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, directed, created_at, updated_at, library_id, origin
    FROM graphs ORDER BY updated_at DESC, id DESC
  `).all();
  res.json(rows.map(r => mapGraphRow(r)));
});

app.get('/api/graphs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM graphs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Nie znaleziono grafu' });
  res.json(mapGraphRow(row, true));
});

app.get('/api/graphs/by-library/:libraryId', (req, res) => {
  const row = db.prepare('SELECT * FROM graphs WHERE library_id = ?').get(req.params.libraryId);
  if (!row) return res.status(404).json({ error: 'Nie znaleziono grafu biblioteki' });
  res.json(mapGraphRow(row, true));
});

app.post('/api/graphs', (req, res) => {
  const result = graphSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane grafu', details: result.error.issues });
  const g = result.data;
  if (!validateGraphIds(g)) return res.status(400).json({ error: 'Niepoprawne identyfikatory wierzchołków lub krawędzi' });

  if (g.libraryId) {
    const existing = db.prepare('SELECT id, updated_at FROM graphs WHERE library_id = ?').get(g.libraryId);
    if (existing) {
      return res.status(409).json({
        error: 'Graf z tym libraryId już istnieje — użyj PUT /graphs/:id',
        id: existing.id,
        updatedAt: existing.updated_at,
      });
    }
  }

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO graphs (name, directed, nodes_json, edges_json, created_at, updated_at, library_id, origin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    g.name,
    Number(g.directed),
    JSON.stringify(g.nodes),
    JSON.stringify(g.edges),
    now,
    g.updatedAt || now,
    g.libraryId ?? null,
    g.origin ?? 'sqlite',
  );
  res.status(201).json({ id: Number(info.lastInsertRowid), name: g.name, libraryId: g.libraryId ?? null, updatedAt: g.updatedAt || now });
});

app.put('/api/graphs/:id', (req, res) => {
  const result = graphSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane grafu', details: result.error.issues });
  const g = result.data;
  if (!validateGraphIds(g)) return res.status(400).json({ error: 'Niepoprawne identyfikatory wierzchołków lub krawędzi' });

  const existing = db.prepare('SELECT id, updated_at, library_id FROM graphs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nie znaleziono grafu' });

  const incomingUpdated = g.updatedAt ? Date.parse(g.updatedAt) : NaN;
  const existingUpdated = Date.parse(existing.updated_at);
  if (Number.isFinite(incomingUpdated) && Number.isFinite(existingUpdated) && incomingUpdated < existingUpdated) {
    return res.status(409).json({
      error: 'Konflikt: nowszy zapis istnieje już w SQLite — nie nadpisano.',
      id: existing.id,
      updatedAt: existing.updated_at,
    });
  }

  if (g.libraryId) {
    const clash = db.prepare('SELECT id FROM graphs WHERE library_id = ? AND id != ?').get(g.libraryId, req.params.id);
    if (clash) return res.status(409).json({ error: 'libraryId jest już powiązany z innym grafem', id: clash.id });
  }

  const now = g.updatedAt || new Date().toISOString();
  db.prepare(`
    UPDATE graphs
    SET name = ?, directed = ?, nodes_json = ?, edges_json = ?, updated_at = ?, library_id = COALESCE(?, library_id), origin = COALESCE(?, origin)
    WHERE id = ?
  `).run(
    g.name,
    Number(g.directed),
    JSON.stringify(g.nodes),
    JSON.stringify(g.edges),
    now,
    g.libraryId ?? null,
    g.origin ?? null,
    req.params.id,
  );
  res.json({ id: Number(req.params.id), name: g.name, updatedAt: now, libraryId: g.libraryId ?? existing.library_id ?? null });
});

app.delete('/api/graphs/:id', (req, res) => {
  const info = db.prepare('DELETE FROM graphs WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Nie znaleziono grafu' });
  res.status(204).end();
});

app.get('/api/experiments', (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : null;
  const rows = runId
    ? db.prepare('SELECT * FROM experiments WHERE run_id = ? ORDER BY id DESC').all(runId)
    : db.prepare('SELECT * FROM experiments ORDER BY id DESC LIMIT 2000').all();
  res.json(rows.map(mapExperimentRow));
});

app.post('/api/experiments', (req, res) => {
  const result = experimentSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane eksperymentu', details: result.error.issues });
  const x = result.data;
  if (x.graphId != null && !db.prepare('SELECT id FROM graphs WHERE id = ?').get(x.graphId)) {
    return res.status(400).json({ error: 'Nie znaleziono powiązanego grafu' });
  }

  if (x.clientId) {
    const existing = db.prepare('SELECT id, updated_at FROM experiments WHERE client_id = ?').get(x.clientId);
    if (existing) {
      const incoming = x.updatedAt ? Date.parse(x.updatedAt) : Date.now();
      const current = Date.parse(existing.updated_at || '') || 0;
      if (incoming < current) {
        return res.status(409).json({
          error: 'Konflikt: nowszy pomiar już istnieje w SQLite',
          id: existing.id,
          updatedAt: existing.updated_at,
        });
      }
      const now = x.updatedAt || new Date().toISOString();
      db.prepare(`
        UPDATE experiments SET
          graph_id = ?, algorithm = ?, vertex_count = ?, edge_count = ?, density = ?, repetitions = ?, seed = ?,
          mean_ms = ?, min_ms = ?, max_ms = ?, median_ms = ?, std_ms = ?, operations = ?,
          run_id = ?, topology = ?, status = ?, source_label = ?, directed = ?, weight_min = ?, weight_max = ?,
          generate_ms = ?, payload_json = ?, updated_at = ?
        WHERE client_id = ?
      `).run(
        x.graphId ?? null, x.algorithm, x.vertexCount, x.edgeCount, x.density, x.repetitions, x.seed ?? null,
        x.meanMs, x.minMs, x.maxMs, x.medianMs ?? null, x.stdMs ?? null, x.operations ?? null,
        x.runId ?? null, x.topology ?? null, x.status ?? 'ran', x.sourceLabel ?? null, Number(Boolean(x.directed)),
        x.weightMin ?? null, x.weightMax ?? null, x.generateMs ?? null,
        x.payload ? JSON.stringify(x.payload) : null, now, x.clientId,
      );
      return res.json({ id: existing.id, clientId: x.clientId, updated: true, updatedAt: now });
    }
  }

  const now = x.updatedAt || new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO experiments (
      graph_id, algorithm, vertex_count, edge_count, density, repetitions, seed,
      mean_ms, min_ms, max_ms, operations, created_at,
      client_id, run_id, median_ms, std_ms, topology, status, source_label,
      directed, weight_min, weight_max, generate_ms, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    x.graphId ?? null, x.algorithm, x.vertexCount, x.edgeCount, x.density, x.repetitions, x.seed ?? null,
    x.meanMs, x.minMs, x.maxMs, x.operations ?? null, now,
    x.clientId ?? null, x.runId ?? null, x.medianMs ?? null, x.stdMs ?? null, x.topology ?? null,
    x.status ?? 'ran', x.sourceLabel ?? null, Number(Boolean(x.directed)),
    x.weightMin ?? null, x.weightMax ?? null, x.generateMs ?? null,
    x.payload ? JSON.stringify(x.payload) : null, now,
  );
  res.status(201).json({ id: Number(info.lastInsertRowid), clientId: x.clientId ?? null, updated: false, updatedAt: now });
});

app.get('/api/research-studies', (_req, res) => {
  const rows = db.prepare('SELECT * FROM research_studies ORDER BY updated_at DESC').all();
  res.json(rows.map(mapStudyRow));
});

app.get('/api/research-studies/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM research_studies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Nie znaleziono serii badawczej' });
  res.json(mapStudyRow(row));
});

app.post('/api/research-studies', (req, res) => {
  const result = researchStudySchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane serii', details: result.error.issues });
  const s = result.data;
  const existing = db.prepare('SELECT id, updated_at FROM research_studies WHERE id = ?').get(s.id);
  if (existing) {
    return res.status(409).json({
      error: 'Seria już istnieje — użyj PUT /research-studies/:id',
      id: existing.id,
      updatedAt: existing.updated_at,
    });
  }
  const updatedAt = s.updatedAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO research_studies (
      id, name, created_at, updated_at, config_json, plan_json, cases_json,
      interpretation_json, hypothesis_verdict, hypothesis_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.id, s.name, s.createdAt, updatedAt,
    JSON.stringify(s.config), JSON.stringify(s.plan), JSON.stringify(s.cases),
    JSON.stringify(s.interpretation ?? []), s.hypothesisVerdict ?? 'unset', s.hypothesisNote ?? '',
  );
  res.status(201).json({ id: s.id, updatedAt });
});

app.put('/api/research-studies/:id', (req, res) => {
  const result = researchStudySchema.safeParse({ ...req.body, id: req.params.id });
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane serii', details: result.error.issues });
  const s = result.data;
  const existing = db.prepare('SELECT id, updated_at FROM research_studies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nie znaleziono serii badawczej' });

  const incoming = s.updatedAt ? Date.parse(s.updatedAt) : Date.now();
  const current = Date.parse(existing.updated_at) || 0;
  if (incoming < current) {
    return res.status(409).json({
      error: 'Konflikt: nowsza seria istnieje już w SQLite — nie nadpisano.',
      id: existing.id,
      updatedAt: existing.updated_at,
    });
  }

  const updatedAt = s.updatedAt || new Date().toISOString();
  db.prepare(`
    UPDATE research_studies SET
      name = ?, updated_at = ?, config_json = ?, plan_json = ?, cases_json = ?,
      interpretation_json = ?, hypothesis_verdict = ?, hypothesis_note = ?
    WHERE id = ?
  `).run(
    s.name, updatedAt,
    JSON.stringify(s.config), JSON.stringify(s.plan), JSON.stringify(s.cases),
    JSON.stringify(s.interpretation ?? []), s.hypothesisVerdict ?? 'unset', s.hypothesisNote ?? '',
    req.params.id,
  );
  res.json({ id: req.params.id, updatedAt });
});

app.delete('/api/research-studies/:id', (req, res) => {
  const info = db.prepare('DELETE FROM research_studies WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Nie znaleziono serii badawczej' });
  res.status(204).end();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Błąd serwera' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`GraphLab API: http://localhost:${port}/api/health`);
  console.log('Migracje:', migrationSummary);
});
