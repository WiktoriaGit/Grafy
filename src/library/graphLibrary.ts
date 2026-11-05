import {
  loadWorkspace,
  parseWorkspace,
  type WorkspaceGraph,
} from '../workspace/graphWorkspace'

export const LIBRARY_KEY = 'graphlab-library-v1'
export const LIBRARY_MIGRATION_KEY = 'graphlab-library-migrated-v1'

export type LibraryGraph = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  graph: WorkspaceGraph
}

export type LibraryExportPayload = {
  version: 1
  exportedAt: string
  graphs: LibraryGraph[]
}

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readRaw(): LibraryGraph[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is LibraryGraph => entry != null)
  } catch {
    return []
  }
}

function writeAll(entries: LibraryGraph[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries))
}

function normalizeEntry(raw: unknown): LibraryGraph | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || !obj.id) return null
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null
  try {
    const graph = parseWorkspace(obj.graph)
    return {
      id: obj.id,
      name: obj.name.trim().slice(0, 120),
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : nowIso(),
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : nowIso(),
      graph,
    }
  } catch {
    return null
  }
}

/** One-time: if library empty and workspace has a graph, seed a named copy. */
export function migrateWorkspaceIntoLibrary(): LibraryGraph | null {
  try {
    if (localStorage.getItem(LIBRARY_MIGRATION_KEY) === '1') return null
    const existing = readRaw()
    if (existing.length > 0) {
      localStorage.setItem(LIBRARY_MIGRATION_KEY, '1')
      return null
    }
    const workspace = loadWorkspace()
    if (!workspace || workspace.nodes.length === 0) {
      localStorage.setItem(LIBRARY_MIGRATION_KEY, '1')
      return null
    }
    const entry: LibraryGraph = {
      id: newId(),
      name: 'Graf z obszaru roboczego',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      graph: workspace,
    }
    writeAll([entry])
    localStorage.setItem(LIBRARY_MIGRATION_KEY, '1')
    return entry
  } catch {
    return null
  }
}

export function listLibraryGraphs(): LibraryGraph[] {
  migrateWorkspaceIntoLibrary()
  return readRaw().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getLibraryGraph(id: string): LibraryGraph | null {
  return readRaw().find(entry => entry.id === id) ?? null
}

export function saveLibraryGraph(name: string, graph: WorkspaceGraph, existingId?: string): LibraryGraph {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) throw new Error('Podaj nazwę grafu.')
  parseWorkspace(graph) // validate
  const entries = readRaw()
  const stamp = nowIso()

  if (existingId) {
    const index = entries.findIndex(e => e.id === existingId)
    if (index < 0) throw new Error('Nie znaleziono grafu do nadpisania.')
    const updated: LibraryGraph = {
      ...entries[index],
      name: trimmed,
      updatedAt: stamp,
      graph,
    }
    entries[index] = updated
    writeAll(entries)
    return updated
  }

  const created: LibraryGraph = {
    id: newId(),
    name: trimmed,
    createdAt: stamp,
    updatedAt: stamp,
    graph,
  }
  entries.unshift(created)
  writeAll(entries)
  return created
}

export function renameLibraryGraph(id: string, name: string): LibraryGraph {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) throw new Error('Podaj nową nazwę grafu.')
  const entries = readRaw()
  const index = entries.findIndex(e => e.id === id)
  if (index < 0) throw new Error('Nie znaleziono grafu.')
  entries[index] = { ...entries[index], name: trimmed, updatedAt: nowIso() }
  writeAll(entries)
  return entries[index]
}

export function duplicateLibraryGraph(id: string): LibraryGraph {
  const source = getLibraryGraph(id)
  if (!source) throw new Error('Nie znaleziono grafu do skopiowania.')
  return saveLibraryGraph(`${source.name} (kopia)`, source.graph)
}

export function deleteLibraryGraph(id: string): void {
  const entries = readRaw().filter(e => e.id !== id)
  writeAll(entries)
}

export function exportLibraryGraphs(ids?: string[]): string {
  const all = listLibraryGraphs()
  const graphs = ids?.length ? all.filter(g => ids.includes(g.id)) : all
  if (!graphs.length) throw new Error('Brak grafów do eksportu.')
  const payload: LibraryExportPayload = {
    version: 1,
    exportedAt: nowIso(),
    graphs,
  }
  return JSON.stringify(payload, null, 2)
}

export function exportSingleLibraryGraph(id: string): string {
  const entry = getLibraryGraph(id)
  if (!entry) throw new Error('Nie znaleziono grafu.')
  return JSON.stringify({
    version: 1,
    exportedAt: nowIso(),
    graphs: [entry],
  } satisfies LibraryExportPayload, null, 2)
}

/** Accepts library export envelope or a bare WorkspaceGraph / LibraryGraph. */
export function importLibraryJson(raw: string): LibraryGraph[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Plik nie jest poprawnym JSON.')
  }

  const imported: LibraryGraph[] = []

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LibraryExportPayload).graphs)) {
    const graphs = (parsed as LibraryExportPayload).graphs
    for (const item of graphs) {
      const graph = parseWorkspace(item.graph ?? item)
      const name = typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : `Import ${imported.length + 1}`
      imported.push(saveLibraryGraph(name, graph))
    }
    return imported
  }

  // Bare workspace graph
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as WorkspaceGraph).nodes)) {
    const graph = parseWorkspace(parsed)
    imported.push(saveLibraryGraph('Zaimportowany graf', graph))
    return imported
  }

  throw new Error('Nie rozpoznano formatu biblioteki ani pojedynczego grafu workspace.')
}

export function librarySummary(entry: LibraryGraph): string {
  const v = entry.graph.nodes.length
  const e = entry.graph.edges.length
  const dir = entry.graph.directed ? 'skierowany' : 'nieskierowany'
  return `${v} V · ${e} E · ${dir}`
}
