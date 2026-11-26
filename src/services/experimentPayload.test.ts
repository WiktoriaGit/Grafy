import { describe, expect, it } from 'vitest'
import {
  isPermanentSyncRejection,
  normalizeExperimentToSave,
} from './experimentPayload'
import { ApiHttpError } from './graphApi'

describe('normalizeExperimentToSave — regresja POST /api/experiments 400', () => {
  it('naprawia density > 100 (Zod max(100))', () => {
    const out = normalizeExperimentToSave({
      algorithm: 'bfs',
      vertexCount: 10,
      edgeCount: 90,
      density: 180.5,
      repetitions: 5,
      meanMs: 1,
      minMs: 0.5,
      maxMs: 2,
    })
    expect(out.density).toBe(100)
    expect(out.density).toBeLessThanOrEqual(100)
  })

  it('podnosi repetitions: 0 (wyniki skipped) do min 1 dla Zod', () => {
    const out = normalizeExperimentToSave({
      algorithm: 'dijkstra',
      vertexCount: 4,
      edgeCount: 3,
      density: 50,
      repetitions: 0,
      meanMs: 0,
      minMs: 0,
      maxMs: 0,
      status: 'skipped',
    })
    expect(out.repetitions).toBe(1)
    expect(out.status).toBe('skipped')
  })

  it('przywraca porządek minMs ≤ meanMs ≤ maxMs przy float / legacy polach', () => {
    const out = normalizeExperimentToSave({
      algorithm: 'prim',
      vertices: 8,
      edges: 12,
      density: 42.5,
      repetitions: 10,
      // legacy BenchResult keys + niespójne czasy (przyczyna Zod refine)
      mean: 1.23456789,
      min: 1.234567891,
      max: 1.1,
    })
    expect(out.minMs).toBeLessThanOrEqual(out.meanMs)
    expect(out.meanMs).toBeLessThanOrEqual(out.maxMs)
    expect(out.vertexCount).toBe(8)
    expect(out.edgeCount).toBe(12)
  })

  it('mapuje BenchResult → ExperimentToSave bez utraty clientId/payload', () => {
    const payload = { id: 'local-1', algorithm: 'bfs', vertices: 3 }
    const out = normalizeExperimentToSave({
      clientId: 'local-1',
      algorithm: 'bfs',
      vertexCount: 3,
      edgeCount: 2,
      density: 66.67,
      repetitions: 3,
      meanMs: 0.02,
      minMs: 0.01,
      maxMs: 0.03,
      payload,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(out.clientId).toBe('local-1')
    expect(out.payload).toEqual(payload)
    expect(out.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('isPermanentSyncRejection', () => {
  it('traktuje HTTP 400 / ApiHttpError jako trwałe (bez nieskończonego retry)', () => {
    expect(isPermanentSyncRejection(new ApiHttpError(400, 'Niepoprawne dane eksperymentu', []))).toBe(true)
    expect(isPermanentSyncRejection(new Error('400: Niepoprawne dane eksperymentu'))).toBe(true)
    expect(isPermanentSyncRejection(new ApiHttpError(503, 'Serwer niedostępny'))).toBe(false)
    expect(isPermanentSyncRejection(new Error('Brak połączenia z backendem'))).toBe(false)
  })
})

describe('round-trip payload — integralność statystyk (I2)', () => {
  it('zachowuje oryginalne mean/min/max w payload mimo korekty kolumn API', () => {
    const original = {
      id: 'rt-1',
      algorithm: 'bfs',
      vertices: 10,
      edges: 45,
      density: 150,
      repetitions: 0,
      mean: 1.5,
      median: 1.4,
      stdDev: 0.2,
      min: 1.6,
      max: 1.2,
      operations: 99,
      reached: true,
      timestamp: '2026-11-26T12:00:00.000Z',
      generateMs: 1,
      seed: 7,
      directed: false,
      topology: 'erdos',
      weightMin: 1,
      weightMax: 5,
      status: 'skipped' as const,
      skipReason: 'test',
    }
    const saved = normalizeExperimentToSave({
      clientId: original.id,
      algorithm: original.algorithm,
      vertexCount: original.vertices,
      edgeCount: original.edges,
      density: original.density,
      repetitions: original.repetitions,
      meanMs: original.mean,
      minMs: original.min,
      maxMs: original.max,
      medianMs: original.median,
      stdMs: original.stdDev,
      status: original.status,
      payload: original,
      updatedAt: original.timestamp,
    })
    expect(saved.density).toBe(100)
    expect(saved.repetitions).toBe(1)
    expect(saved.payload).toBeTruthy()
    const payload = saved.payload as typeof original
    expect(payload.mean).toBe(1.5)
    expect(payload.min).toBe(1.6)
    expect(payload.max).toBe(1.2)
    expect(payload.repetitions).toBe(0)
    expect(payload.density).toBe(150)
    expect(payload.status).toBe('skipped')
  })
})
