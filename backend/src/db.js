import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'graphlab.sqlite');

/** Kopia zapasowa przy starcie (nie nadpisuje wcześniejszych backupów). */
function backupIfNeeded() {
  if (!existsSync(dbPath)) return;
  const backupsDir = join(dataDir, 'backups');
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    copyFileSync(dbPath, join(backupsDir, `graphlab-startup-${stamp}.sqlite`));
  } catch (error) {
    console.warn('Nie udało się utworzyć kopii SQLite przy starcie:', error);
  }
}

backupIfNeeded();

export const db = new Database(dbPath);
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
CREATE TABLE IF NOT EXISTS research_studies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  config_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  cases_json TEXT NOT NULL,
  interpretation_json TEXT NOT NULL DEFAULT '[]',
  hypothesis_verdict TEXT,
  hypothesis_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_experiments_algorithm ON experiments(algorithm);
CREATE INDEX IF NOT EXISTS idx_experiments_created ON experiments(created_at);
CREATE INDEX IF NOT EXISTS idx_research_studies_updated ON research_studies(updated_at);
`);

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function ensureColumn(table, column, definition) {
  const columns = tableColumns(table);
  if (columns.includes(column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/** Migracje ADD COLUMN — nigdy DROP / DELETE danych. */
const graphMigrations = [
  ensureColumn('graphs', 'library_id', 'TEXT'),
  ensureColumn('graphs', 'origin', "TEXT DEFAULT 'sqlite'"),
];

const experimentMigrations = [
  ensureColumn('experiments', 'client_id', 'TEXT'),
  ensureColumn('experiments', 'run_id', 'TEXT'),
  ensureColumn('experiments', 'median_ms', 'REAL'),
  ensureColumn('experiments', 'std_ms', 'REAL'),
  ensureColumn('experiments', 'topology', 'TEXT'),
  ensureColumn('experiments', 'status', "TEXT DEFAULT 'ran'"),
  ensureColumn('experiments', 'source_label', 'TEXT'),
  ensureColumn('experiments', 'directed', 'INTEGER DEFAULT 0'),
  ensureColumn('experiments', 'weight_min', 'REAL'),
  ensureColumn('experiments', 'weight_max', 'REAL'),
  ensureColumn('experiments', 'generate_ms', 'REAL'),
  ensureColumn('experiments', 'payload_json', 'TEXT'),
  ensureColumn('experiments', 'updated_at', "TEXT DEFAULT (datetime('now'))"),
];

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_graphs_library_id
  ON graphs(library_id) WHERE library_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_experiments_client_id
  ON experiments(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_experiments_run_id ON experiments(run_id);
`);

export const migrationSummary = {
  graphsColumnsAdded: graphMigrations.filter(Boolean).length,
  experimentsColumnsAdded: experimentMigrations.filter(Boolean).length,
};
