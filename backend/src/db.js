import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
export const db = new Database(join(dataDir, 'graphlab.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS graphs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  directed INTEGER NOT NULL DEFAULT 0,
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id INTEGER REFERENCES graphs(id) ON DELETE SET NULL,
  algorithm TEXT NOT NULL,
  vertex_count INTEGER NOT NULL,
  edge_count INTEGER NOT NULL,
  density REAL NOT NULL,
  repetitions INTEGER NOT NULL,
  seed INTEGER,
  mean_ms REAL NOT NULL,
  min_ms REAL NOT NULL,
  max_ms REAL NOT NULL,
  operations INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_experiments_algorithm ON experiments(algorithm);
CREATE INDEX IF NOT EXISTS idx_experiments_created ON experiments(created_at);
`);
