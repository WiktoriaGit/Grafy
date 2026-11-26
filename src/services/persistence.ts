/**
 * Warstwa synchronizacji GraphLab: SQLite (źródło prawdy) + localStorage (cache/offline).
 * Nie czyści localStorage i nie nadpisuje nowszych rekordów starszymi.
 */
import type { Edge, Node } from '@xyflow/react'
import type { BenchResult } from '../utils/benchmark'
import { loadResults, saveResults } from '../utils/benchmark'
import {
  LIBRARY_KEY,
  listLibraryGraphs,
  type LibraryGraph,
} from '../library/graphLibrary'
import {
  loadResearchStudies,
  saveResearchStudy,
  type ResearchStudy,
} from '../utils/researchStudy'
import { saveWorkspace, type WorkspaceGraph } from '../workspace/graphWorkspace'
import {
  checkApiHealth,
  deleteResearchStudyApi,
  getExperiments,
  getResearchStudies,
  getSavedGraph,
  getSavedGraphs,
  saveExperiment,
  saveGraph,
  saveResearchStudyApi,
  updateGraph,
  updateResearchStudyApi,
  type ExperimentToSave,
  type GraphToSave,
  type SavedGraph,
} from './graphApi'
import {
  isPermanentSyncRejection,
  normalizeExperimentToSave,
} from './experimentPayload'

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'error'

export type SyncConflict = {
  entity: 'graph' | 'experiment' | 'research'
  id: string
  message: string
  serverUpdatedAt?: string
}

export type SyncReport = {
  status: ConnectionStatus
  message: string
  pushed: number
  pulled: number
  conflicts: SyncConflict[]
  errors: string[]
}

const QUEUE_KEY = 'graphlab-sync-queue-v1'
/** Kopie pozycji trwale odrzuconych (np. 400) — nie usuwa danych bez kopii. */
const QUARANTINE_KEY = 'graphlab-sync-quarantine-v1'
const STATUS_EVENT = 'graphlab-connection-status'
const LAST_SYNC_KEY = 'graphlab-last-sync-v1'

type QueueItem =
  | { id: string; entity: 'graph'; op: 'upsert'; payload: GraphToSave & { sqliteId?: number; libraryId?: string; updatedAt: string } }
  | { id: string; entity: 'experiment'; op: 'upsert'; payload: ExperimentToSave }
  | { id: string; entity: 'research'; op: 'upsert' | 'delete'; payload: ResearchStudy | { id: string; updatedAt: string } }

type StatusListener = (status: ConnectionStatus, detail?: string) => void

const listeners = new Set<StatusListener>()
let currentStatus: ConnectionStatus = 'offline'
let currentDetail = 'Sprawdzanie połączenia z bazą…'

export function getConnectionStatus() {
  return { status: currentStatus, detail: currentDetail }
}

export function subscribeConnectionStatus(listener: StatusListener): () => void {
  listeners.add(listener)
  listener(currentStatus, currentDetail)
  return () => {
    listeners.delete(listener)
  }
}

function setStatus(status: ConnectionStatus, detail: string) {
  currentStatus = status
  currentDetail = detail
  for (const listener of listeners) listener(status, detail)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { status, detail } }))
  }
}

function readQueue(): QueueItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(raw) ? raw as QueueItem[] : []
  } catch {
    return []
  }
}

function writeQueue(items: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(0, 500)))
}

function enqueue(item: QueueItem) {
  const queue = readQueue().filter(q => !(q.entity === item.entity && q.id === item.id && q.op === item.op))
  queue.push(item)
  writeQueue(queue)
}

function quarantineItem(
  item: QueueItem,
  reason: string,
  httpStatus?: number,
  extra?: Record<string, unknown>,
) {
  try {
    const raw = JSON.parse(localStorage.getItem(QUARANTINE_KEY) || '[]')
    const list = Array.isArray(raw) ? raw : []
    list.push({
      quarantinedAt: new Date().toISOString(),
      reason,
      httpStatus: httpStatus ?? null,
      item,
      ...extra,
    })
    localStorage.setItem(QUARANTINE_KEY, JSON.stringify(list.slice(-200)))
  } catch {
    // Nie blokuj sync przy awarii kwarantanny — kolejka i tak nie wchłonie pozycji 400.
  }
}

function httpStatusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    return Number.isFinite(status) ? status : undefined
  }
  return undefined
}

function iso(value?: string) {
  if (value && !Number.isNaN(Date.parse(value))) return value
  return new Date().toISOString()
}

function newer(a?: string, b?: string) {
  return Date.parse(iso(a)) >= Date.parse(iso(b))
}

function workspaceToApiGraph(entry: LibraryGraph): GraphToSave & { libraryId: string; updatedAt: string; origin: string } {
  return {
    name: entry.name,
    directed: entry.graph.directed,
    libraryId: entry.id,
    updatedAt: entry.updatedAt,
    origin: 'library',
    nodes: entry.graph.nodes.map(n => ({
      id: n.id,
      position: n.position,
      data: { label: n.id },
    })) as Node[],
    edges: entry.graph.edges.map((e, index) => ({
      id: `e-${e.source}-${e.target}-${index}`,
      source: e.source,
      target: e.target,
      label: String(e.weight ?? 1),
      data: { weight: Number(e.weight ?? 1) },
    })) as Edge[],
  }
}

function apiGraphToLibrary(graph: SavedGraph): LibraryGraph | null {
  if (!graph.libraryId && !graph.id) return null
  try {
    const nodes = graph.nodes.map(n => ({
      id: String(n.id),
      position: (n as Node).position ?? { x: 0, y: 0 },
    }))
    const edges = graph.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      weight: Number((e as Edge & { data?: { weight?: number }; label?: string }).data?.weight
        ?? (e as Edge).label
        ?? 1),
    }))
    return {
      id: graph.libraryId || `sqlite-${graph.id}`,
      name: graph.name,
      createdAt: graph.createdAt,
      updatedAt: graph.updatedAt,
      graph: {
        version: 1,
        directed: graph.directed,
        nodes,
        edges,
      },
    }
  } catch {
    return null
  }
}

function benchToExperiment(row: BenchResult): ExperimentToSave {
  return normalizeExperimentToSave({
    clientId: row.id,
    runId: row.runId ?? null,
    algorithm: row.algorithm,
    vertexCount: row.vertices,
    edgeCount: row.edges,
    density: row.density,
    repetitions: row.repetitions,
    seed: row.seed,
    meanMs: row.mean,
    minMs: row.min,
    maxMs: row.max,
    medianMs: row.median,
    stdMs: row.stdDev,
    operations: row.operations,
    topology: row.topology,
    status: row.status ?? 'ran',
    sourceLabel: row.sourceLabel ?? null,
    directed: row.directed,
    weightMin: row.weightMin,
    weightMax: row.weightMax,
    generateMs: row.generateMs,
    payload: row as unknown as Record<string, unknown>,
    updatedAt: row.timestamp,
  })
}

function experimentToBench(row: Awaited<ReturnType<typeof getExperiments>>[number]): BenchResult | null {
  // I2: źródło prawdy = oryginalny payload BenchResult. Bez payloadu nie „wymyślamy” poprawnego pomiaru.
  if (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) {
    const payload = row.payload as Partial<BenchResult>
    if (typeof payload.algorithm === 'string' && typeof payload.vertices === 'number'
      && typeof payload.mean === 'number' && typeof payload.min === 'number' && typeof payload.max === 'number') {
      return {
        id: String(payload.id ?? row.clientId ?? `srv-${row.id}`),
        algorithm: payload.algorithm as BenchResult['algorithm'],
        vertices: Number(payload.vertices),
        edges: Number(payload.edges ?? 0),
        density: Number(payload.density ?? 0),
        repetitions: Number(payload.repetitions ?? 0),
        mean: Number(payload.mean),
        median: Number(payload.median ?? payload.mean),
        stdDev: Number(payload.stdDev ?? 0),
        min: Number(payload.min),
        max: Number(payload.max),
        operations: Number(payload.operations ?? 0),
        reached: Boolean(payload.reached),
        timestamp: String(payload.timestamp ?? row.updatedAt ?? row.createdAt),
        generateMs: Number(payload.generateMs ?? 0),
        seed: Number(payload.seed ?? 0),
        directed: Boolean(payload.directed),
        topology: (payload.topology ?? 'erdos') as BenchResult['topology'],
        weightMin: Number(payload.weightMin ?? 0),
        weightMax: Number(payload.weightMax ?? 0),
        status: (payload.status ?? 'ran') as BenchResult['status'],
        skipReason: typeof payload.skipReason === 'string' ? payload.skipReason : undefined,
        runId: typeof payload.runId === 'string' ? payload.runId : row.runId ?? undefined,
        sourceLabel: typeof payload.sourceLabel === 'string' ? payload.sourceLabel : row.sourceLabel ?? undefined,
        methodologyVersion: typeof (payload as { methodologyVersion?: string }).methodologyVersion === 'string'
          ? (payload as { methodologyVersion?: string }).methodologyVersion
          : undefined,
        timingMode: (payload as { timingMode?: BenchResult['timingMode'] }).timingMode,
        batchSize: typeof (payload as { batchSize?: number }).batchSize === 'number'
          ? (payload as { batchSize?: number }).batchSize
          : undefined,
      }
    }
  }
  if (!['bfs', 'dfs', 'dijkstra', 'bellman', 'prim', 'kruskal'].includes(row.algorithm)) return null
  // Jawna degradacja: kolumny API mogą być znormalizowane — wynik wykluczony z analizy.
  return {
    id: row.clientId || `srv-${row.id}`,
    algorithm: row.algorithm as BenchResult['algorithm'],
    vertices: row.vertexCount,
    edges: row.edgeCount,
    density: row.density,
    repetitions: row.repetitions,
    mean: row.meanMs,
    median: row.medianMs ?? row.meanMs,
    stdDev: row.stdMs ?? 0,
    min: row.minMs,
    max: row.maxMs,
    operations: row.operations ?? 0,
    reached: false,
    timestamp: row.updatedAt || row.createdAt,
    generateMs: row.generateMs ?? 0,
    seed: row.seed ?? 0,
    directed: Boolean(row.directed),
    topology: (row.topology || 'erdos') as BenchResult['topology'],
    weightMin: row.weightMin ?? 0,
    weightMax: row.weightMax ?? 0,
    status: 'error',
    skipReason: 'Brak oryginalnego payloadu pomiaru w SQLite — kolumny API mogą być znormalizowane; wynik wykluczony z analizy.',
    runId: row.runId ?? undefined,
    sourceLabel: row.sourceLabel ?? undefined,
  }
}

function mergeLibrary(local: LibraryGraph[], remote: LibraryGraph[]): { merged: LibraryGraph[]; conflicts: SyncConflict[] } {
  const map = new Map<string, LibraryGraph>()
  const conflicts: SyncConflict[] = []
  for (const item of local) map.set(item.id, item)
  for (const item of remote) {
    const current = map.get(item.id)
    if (!current) {
      map.set(item.id, item)
      continue
    }
    if (newer(item.updatedAt, current.updatedAt)) {
      map.set(item.id, item)
    } else if (!newer(current.updatedAt, item.updatedAt) && JSON.stringify(current.graph) !== JSON.stringify(item.graph)) {
      conflicts.push({
        entity: 'graph',
        id: item.id,
        message: `Konflikt grafu „${item.name}”: lokalny i serwerowy mają ten sam czas, różną treść — zachowano lokalny.`,
        serverUpdatedAt: item.updatedAt,
      })
    }
  }
  return {
    merged: [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    conflicts,
  }
}

function mergeBench(local: BenchResult[], remote: BenchResult[]): BenchResult[] {
  const map = new Map<string, BenchResult>()
  for (const row of local) map.set(row.id, row)
  for (const row of remote) {
    const current = map.get(row.id)
    if (!current || newer(row.timestamp, current.timestamp)) map.set(row.id, row)
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 500)
}

function mergeStudies(local: ResearchStudy[], remote: ResearchStudy[]): { merged: ResearchStudy[]; conflicts: SyncConflict[] } {
  const map = new Map<string, ResearchStudy>()
  const conflicts: SyncConflict[] = []
  for (const item of local) map.set(item.id, item)
  for (const item of remote) {
    const current = map.get(item.id)
    if (!current) {
      map.set(item.id, item)
      continue
    }
    const localUpdated = (current as ResearchStudy & { updatedAt?: string }).updatedAt || current.createdAt
    const remoteUpdated = item.createdAt // studies may not have updatedAt on type; use createdAt fallback
    const remoteStamp = (item as ResearchStudy & { updatedAt?: string }).updatedAt || remoteUpdated
    if (newer(remoteStamp, localUpdated)) map.set(item.id, item)
    else if (!newer(localUpdated, remoteStamp)) {
      conflicts.push({
        entity: 'research',
        id: item.id,
        message: `Konflikt serii „${item.name}” — zachowano lokalną wersję.`,
        serverUpdatedAt: remoteStamp,
      })
    }
  }
  return { merged: [...map.values()], conflicts }
}

function writeLibrary(entries: LibraryGraph[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries))
}

async function flushQueue(report: SyncReport) {
  const queue = readQueue()
  if (!queue.length) return
  const remaining: QueueItem[] = []
  for (const item of queue) {
    try {
      if (item.entity === 'graph' && item.op === 'upsert') {
        const payload = item.payload
        if (payload.sqliteId) {
          await updateGraph(payload.sqliteId, payload)
        } else if (payload.libraryId) {
          try {
            await saveGraph(payload)
          } catch (error) {
            const message = error instanceof Error ? error.message : ''
            if (message.includes('libraryId już istnieje') || message.includes('409')) {
              // Conflict handled by pull merge; keep visible.
              report.conflicts.push({
                entity: 'graph',
                id: item.id,
                message: message || 'Konflikt zapisu grafu',
              })
            } else {
              throw error
            }
          }
        } else {
          await saveGraph(payload)
        }
        report.pushed++
      } else if (item.entity === 'experiment' && item.op === 'upsert') {
        // Migracja bezstratna: normalizuj stare pozycje kolejki (density/reps/czasy) przed POST.
        const normalized = normalizeExperimentToSave(item.payload)
        await saveExperiment(normalized)
        report.pushed++
      } else if (item.entity === 'research') {
        if (item.op === 'delete') {
          await deleteResearchStudyApi(item.payload.id)
        } else {
          const study = item.payload as ResearchStudy
          try {
            await saveResearchStudyApi(study)
          } catch (error) {
            const message = error instanceof Error ? error.message : ''
            if (message.includes('już istnieje') || message.includes('409')) {
              await updateResearchStudyApi(study.id, study)
            } else {
              throw error
            }
          }
        }
        report.pushed++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd kolejki synchronizacji'
      if (item.entity === 'experiment' && isPermanentSyncRejection(error)) {
        // Kopia surowego + znormalizowanego payloadu; nie wraca do kolejki → brak pętli 400.
        quarantineItem(item, message, httpStatusOf(error) ?? 400, {
          normalizedPayload: normalizeExperimentToSave(item.payload),
        })
        report.errors.push(`Eksperyment ${item.id}: odrzucony (walidacja) — kopia w kwarantannie, bez ponawiania.`)
      } else {
        remaining.push(
          item.entity === 'experiment'
            ? { ...item, payload: normalizeExperimentToSave(item.payload) }
            : item,
        )
        report.errors.push(message)
      }
    }
  }
  writeQueue(remaining)
}

/** Zapis lokalny + kolejka sync dla grafu biblioteki. */
export function persistLibraryGraphLocal(entry: LibraryGraph) {
  const all = listLibraryGraphs()
  const index = all.findIndex(g => g.id === entry.id)
  const next = [...all]
  if (index >= 0) next[index] = entry
  else next.unshift(entry)
  writeLibrary(next)
  enqueue({
    id: entry.id,
    entity: 'graph',
    op: 'upsert',
    payload: { ...workspaceToApiGraph(entry), updatedAt: entry.updatedAt },
  })
}

/** Zapis lokalny wyników + kolejka sync. */
export function persistBenchResultsLocal(rows: BenchResult[]) {
  const merged = mergeBench(rows, loadResults())
  saveResults(merged)
  for (const row of rows) {
    enqueue({
      id: row.id,
      entity: 'experiment',
      op: 'upsert',
      payload: benchToExperiment(row),
    })
  }
}

/** Zapis lokalny serii + kolejka sync. */
export function persistResearchStudyLocal(study: ResearchStudy) {
  const withUpdated = {
    ...study,
    updatedAt: (study as ResearchStudy & { updatedAt?: string }).updatedAt || new Date().toISOString(),
  } as ResearchStudy & { updatedAt: string }
  saveResearchStudy(withUpdated)
  enqueue({
    id: study.id,
    entity: 'research',
    op: 'upsert',
    payload: withUpdated,
  })
}

export function persistWorkspaceLocal(graph: WorkspaceGraph) {
  saveWorkspace(graph)
}

/** Blokuje równoległe syncAll (interval + online + przycisk) — chroni localStorage przed wyścigiem. */
let syncInFlight: Promise<SyncReport> | null = null

export function syncAll(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight
  syncInFlight = runSyncAll().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function runSyncAll(): Promise<SyncReport> {
  const report: SyncReport = {
    status: 'syncing',
    message: 'Synchronizacja z SQLite…',
    pushed: 0,
    pulled: 0,
    conflicts: [],
    errors: [],
  }
  setStatus('syncing', report.message)

  const healthy = await checkApiHealth()
  if (!healthy) {
    report.status = 'offline'
    report.message = 'Offline — dane są w localStorage; synchronizacja po przywróceniu połączenia z :3001.'
    setStatus('offline', report.message)
    return report
  }

  try {
    await flushQueue(report)

    // --- Graphs / library (równoległe pobieranie pełnych rekordów) ---
    const remoteInfos = await getSavedGraphs()
    const remoteLibraries: LibraryGraph[] = []
    const graphFetches = await Promise.all(remoteInfos.map(async info => {
      try {
        const full = await getSavedGraph(info.id)
        return {
          ok: true as const,
          mapped: apiGraphToLibrary({
            ...full,
            libraryId: info.libraryId ?? full.libraryId ?? null,
          } as SavedGraph & { libraryId?: string | null }),
        }
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : 'Błąd pobierania grafu',
        }
      }
    }))
    for (const item of graphFetches) {
      if (!item.ok) {
        report.errors.push(item.message)
        continue
      }
      if (item.mapped) remoteLibraries.push(item.mapped)
    }
    const localLibrary = listLibraryGraphs()
    const { merged: mergedLibrary, conflicts: graphConflicts } = mergeLibrary(localLibrary, remoteLibraries)
    report.conflicts.push(...graphConflicts)
    writeLibrary(mergedLibrary)
    report.pulled += remoteLibraries.length

    // Push local-only library graphs (not yet on server)
    const remoteIds = new Set(remoteLibraries.map(g => g.id))
    for (const entry of mergedLibrary) {
      if (remoteIds.has(entry.id)) continue
      try {
        await saveGraph(workspaceToApiGraph(entry))
        report.pushed++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Błąd push grafu'
        if (message.includes('409') || message.toLowerCase().includes('istnieje')) {
          report.conflicts.push({ entity: 'graph', id: entry.id, message })
        } else {
          enqueue({
            id: entry.id,
            entity: 'graph',
            op: 'upsert',
            payload: workspaceToApiGraph(entry),
          })
          report.errors.push(message)
        }
      }
    }

    // --- Experiments ---
    const remoteExperiments = await getExperiments()
    const remoteBench = remoteExperiments
      .map(experimentToBench)
      .filter((row): row is BenchResult => row != null)
    const mergedBench = mergeBench(loadResults(), remoteBench)
    saveResults(mergedBench)
    report.pulled += remoteBench.length

    const remoteClientIds = new Set(remoteBench.map(r => r.id))
    for (const row of mergedBench) {
      if (remoteClientIds.has(row.id)) continue
      const payload = benchToExperiment(row)
      try {
        await saveExperiment(payload)
        report.pushed++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Błąd push eksperymentu'
        if (isPermanentSyncRejection(error)) {
          quarantineItem(
            { id: row.id, entity: 'experiment', op: 'upsert', payload },
            message,
            httpStatusOf(error) ?? 400,
          )
          report.errors.push(`Eksperyment ${row.id}: odrzucony (walidacja) — kopia w kwarantannie, bez ponawiania.`)
        } else {
          enqueue({ id: row.id, entity: 'experiment', op: 'upsert', payload })
          report.errors.push(message)
        }
      }
    }

    // --- Research studies ---
    const remoteStudies = await getResearchStudies()
    const localStudies = loadResearchStudies()
    const { merged: mergedStudies, conflicts: studyConflicts } = mergeStudies(localStudies, remoteStudies)
    report.conflicts.push(...studyConflicts)
    for (const study of mergedStudies) saveResearchStudy(study)
    report.pulled += remoteStudies.length

    const remoteStudyById = new Map(remoteStudies.map(s => [s.id, s]))
    for (const study of mergedStudies) {
      const remote = remoteStudyById.get(study.id)
      if (remote) {
        const localStamp = study.updatedAt || study.createdAt
        const remoteStamp = remote.updatedAt || remote.createdAt
        // Pomijaj PUT, gdy lokalna kopia nie jest nowsza — unika powtarzalnych requestów co 60 s.
        if (!(Date.parse(localStamp) > Date.parse(remoteStamp))) continue
        try {
          await updateResearchStudyApi(study.id, study)
          report.pushed++
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (message.includes('409') || message.toLowerCase().includes('konflikt')) {
            report.conflicts.push({ entity: 'research', id: study.id, message })
          }
        }
        continue
      }
      try {
        await saveResearchStudyApi(study)
        report.pushed++
      } catch (error) {
        enqueue({ id: study.id, entity: 'research', op: 'upsert', payload: study })
        report.errors.push(error instanceof Error ? error.message : 'Błąd push serii')
      }
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())

    if (report.conflicts.length || report.errors.length) {
      report.status = 'error'
      report.message = `Synchronizacja zakończona z ostrzeżeniami (push ${report.pushed}, pull ${report.pulled}, konflikty ${report.conflicts.length}).`
      setStatus('error', report.message)
    } else {
      report.status = 'online'
      report.message = `Połączono z SQLite — zsynchronizowano (push ${report.pushed}, pull ${report.pulled}).`
      setStatus('online', report.message)
    }
  } catch (error) {
    report.status = 'error'
    report.message = error instanceof Error ? error.message : 'Błąd synchronizacji'
    report.errors.push(report.message)
    setStatus('error', report.message)
  }
  return report
}

let started = false

export function startPersistenceLayer() {
  if (started || typeof window === 'undefined') return
  started = true
  setStatus('syncing', 'Łączenie z bazą SQLite…')
  void syncAll()
  window.addEventListener('online', () => { void syncAll() })
  window.setInterval(() => { void syncAll() }, 60000)
}
