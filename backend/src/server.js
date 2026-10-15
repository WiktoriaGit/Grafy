import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { db } from './db.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

const graphSchema = z.object({
  name: z.string().trim().min(1).max(120),
  directed: z.boolean(),
  nodes: z.array(z.object({ id: z.string().min(1) }).passthrough()).max(10000),
  edges: z.array(z.object({ id: z.string().min(1), source: z.string(), target: z.string() }).passthrough()).max(100000)
});
const experimentSchema = z.object({
  graphId: z.number().int().positive().nullable().optional(),
  algorithm: z.enum(['bfs', 'dfs', 'dijkstra', 'bellman', 'prim', 'kruskal']),
  vertexCount: z.number().int().min(1),
  edgeCount: z.number().int().min(0),
  density: z.number().min(0).max(100),
  repetitions: z.number().int().min(1),
  seed: z.number().int().nullable().optional(),
  meanMs: z.number().finite().min(0),
  minMs: z.number().finite().min(0),
  maxMs: z.number().finite().min(0),
  operations: z.number().int().min(0).nullable().optional()
}).refine(x => x.minMs <= x.meanMs && x.meanMs <= x.maxMs, { message: 'Niespójne statystyki czasu' });

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'sqlite' }));
app.get('/api/graphs', (_req, res) => {
  const rows = db.prepare('SELECT id, name, directed, created_at, updated_at FROM graphs ORDER BY id DESC').all();
  res.json(rows.map(r => ({ ...r, directed: Boolean(r.directed) })));
});
app.get('/api/graphs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM graphs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Nie znaleziono grafu' });
  res.json({ id: row.id, name: row.name, directed: Boolean(row.directed), nodes: JSON.parse(row.nodes_json), edges: JSON.parse(row.edges_json), createdAt: row.created_at, updatedAt: row.updated_at });
});
app.post('/api/graphs', (req, res) => {
  const result = graphSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane grafu', details: result.error.issues });
  const g = result.data;
  const ids = new Set(g.nodes.map(n => n.id));
  if (ids.size !== g.nodes.length || g.edges.some(e => !ids.has(e.source) || !ids.has(e.target))) return res.status(400).json({ error: 'Niepoprawne identyfikatory wierzchołków lub krawędzi' });
  const info = db.prepare('INSERT INTO graphs (name, directed, nodes_json, edges_json) VALUES (?, ?, ?, ?)').run(g.name, Number(g.directed), JSON.stringify(g.nodes), JSON.stringify(g.edges));
  res.status(201).json({ id: Number(info.lastInsertRowid), name: g.name });
});
app.delete('/api/graphs/:id', (req, res) => {
  const info = db.prepare('DELETE FROM graphs WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Nie znaleziono grafu' });
  res.status(204).end();
});
app.get('/api/experiments', (_req, res) => res.json(db.prepare('SELECT * FROM experiments ORDER BY id DESC LIMIT 1000').all()));
app.post('/api/experiments', (req, res) => {
  const result = experimentSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Niepoprawne dane eksperymentu', details: result.error.issues });
  const x = result.data;
  if (x.graphId != null && !db.prepare('SELECT id FROM graphs WHERE id = ?').get(x.graphId)) return res.status(400).json({ error: 'Nie znaleziono powiązanego grafu' });
  const info = db.prepare(`INSERT INTO experiments (graph_id, algorithm, vertex_count, edge_count, density, repetitions, seed, mean_ms, min_ms, max_ms, operations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(x.graphId ?? null, x.algorithm, x.vertexCount, x.edgeCount, x.density, x.repetitions, x.seed ?? null, x.meanMs, x.minMs, x.maxMs, x.operations ?? null);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Błąd serwera' });
});
const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`GraphLab API: http://localhost:${port}/api/health`));
