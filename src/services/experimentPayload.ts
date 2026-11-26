import type { ExperimentToSave } from './graphApi'

/** Lossless-enough clamp for API Zod schema (density 0–100, time order, ints). */
function finiteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function nonNeg(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback))
}

function asInt(value: unknown, fallback: number, min?: number): number {
  const n = Math.trunc(finiteNumber(value, fallback))
  if (min != null) return Math.max(min, n)
  return n
}

/**
 * Normalizuje payload eksperymentu pod schema POST /api/experiments.
 * Zachowuje oryginalne wartości w `payload` (jeśli już są) — nie usuwa danych.
 * Naprawia m.in.: density > 100, repetitions < 1, minMs > meanMs / meanMs > maxMs,
 * legacy klucze mean/min/max, nieskończoności.
 */
export function normalizeExperimentToSave(
  raw: ExperimentToSave | Record<string, unknown>,
): ExperimentToSave {
  const r = raw as Record<string, unknown>

  const meanMs = nonNeg(r.meanMs ?? r.mean, 0)
  let minMs = nonNeg(r.minMs ?? r.min, meanMs)
  let maxMs = nonNeg(r.maxMs ?? r.max, meanMs)
  minMs = Math.min(minMs, meanMs)
  maxMs = Math.max(maxMs, meanMs)

  let medianMs: number | null | undefined
  if (r.medianMs !== undefined || r.median !== undefined) {
    const m = r.medianMs ?? r.median
    medianMs = m == null ? null : nonNeg(m, meanMs)
  }

  let stdMs: number | null | undefined
  if (r.stdMs !== undefined || r.stdDev !== undefined) {
    const s = r.stdMs ?? r.stdDev
    stdMs = s == null ? null : nonNeg(s, 0)
  }

  const density = Math.min(100, Math.max(0, finiteNumber(r.density, 0)))
  const repetitions = asInt(r.repetitions, 1, 1)
  const vertexCount = asInt(r.vertexCount ?? r.vertices, 1, 1)
  const edgeCount = asInt(r.edgeCount ?? r.edges, 0, 0)

  let operations: number | null | undefined
  if (r.operations !== undefined) {
    operations = r.operations == null ? null : asInt(r.operations, 0, 0)
  }

  let seed: number | null | undefined
  if (r.seed !== undefined) {
    seed = r.seed == null ? null : asInt(r.seed, 0)
  }

  const algorithm = String(r.algorithm ?? '')
  const status = r.status === 'skipped' || r.status === 'error' || r.status === 'ran'
    ? r.status
    : 'ran'

  // I2: payload = oryginalny BenchResult (lub kopia raw bez pól API). Nigdy nie nadpisujemy
  // mean/min/max wewnątrz payload wartościami „naprawionymi” pod Zod.
  const existingPayload =
    r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
      ? { ...(r.payload as Record<string, unknown>) }
      : null

  return {
    graphId: r.graphId == null ? r.graphId as null | undefined : asInt(r.graphId, 0, 1),
    clientId: typeof r.clientId === 'string' && r.clientId.trim()
      ? r.clientId.trim()
      : typeof r.id === 'string'
        ? r.id
        : undefined,
    runId: r.runId == null ? null : String(r.runId),
    algorithm: algorithm as ExperimentToSave['algorithm'],
    vertexCount,
    edgeCount,
    density,
    repetitions,
    seed,
    meanMs,
    minMs,
    maxMs,
    medianMs,
    stdMs,
    operations,
    topology: r.topology == null ? null : String(r.topology).slice(0, 40),
    status,
    sourceLabel: r.sourceLabel == null ? null : String(r.sourceLabel).slice(0, 240),
    directed: typeof r.directed === 'boolean' ? r.directed : Boolean(r.directed),
    weightMin: r.weightMin == null ? null : finiteNumber(r.weightMin, 0),
    weightMax: r.weightMax == null ? null : finiteNumber(r.weightMax, 0),
    generateMs: r.generateMs == null ? null : nonNeg(r.generateMs, 0),
    payload: existingPayload,
    updatedAt: typeof r.updatedAt === 'string'
      ? r.updatedAt
      : typeof r.timestamp === 'string'
        ? r.timestamp
        : undefined,
  }
}

/** Czy błąd HTTP to trwała odrzucenie walidacji (nie ponawiać w nieskończoność). */
export function isPermanentSyncRejection(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    return status === 400
  }
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    message.startsWith('400:')
    || message.includes('Niepoprawne dane eksperymentu')
    || message.includes('Nie znaleziono powiązanego grafu')
  )
}
