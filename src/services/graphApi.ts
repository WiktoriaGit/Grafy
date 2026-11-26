import type { Edge, Node } from '@xyflow/react'
import type { ResearchStudy } from '../utils/researchStudy'
import { normalizeExperimentToSave } from './experimentPayload'

const API_URL = 'http://localhost:3001/api'

export interface SavedGraphInfo {
  id: number
  name: string
  directed: boolean
  created_at: string
  updated_at: string
  libraryId?: string | null
  origin?: string | null
}

export interface SavedGraph {
  id: number
  name: string
  directed: boolean
  nodes: Node[]
  edges: Edge[]
  createdAt: string
  updatedAt: string
  libraryId?: string | null
  origin?: string | null
}

export interface GraphToSave {
  name: string
  directed: boolean
  nodes: Node[]
  edges: Edge[]
  libraryId?: string | null
  origin?: string
  updatedAt?: string
}

export class ApiHttpError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(`${status}: ${message}`)
    this.name = 'ApiHttpError'
    this.status = status
    this.details = details
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
  } catch {
    throw new Error('Brak połączenia z backendem. Uruchom serwer na porcie 3001.')
  }
  if (!response.ok) {
    const data: { error?: string; details?: unknown; id?: number; updatedAt?: string } | null =
      await response.json().catch(() => null)
    const suffix = data?.error ?? `Błąd serwera HTTP ${response.status}`
    throw new ApiHttpError(response.status, suffix, data?.details)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const getSavedGraphs = () => apiRequest<SavedGraphInfo[]>('/graphs')
export const getSavedGraph = (id: number) => apiRequest<SavedGraph>(`/graphs/${id}`)
export const saveGraph = (graph: GraphToSave) =>
  apiRequest<{ id: number; name: string; libraryId?: string | null; updatedAt?: string }>('/graphs', {
    method: 'POST',
    body: JSON.stringify(graph),
  })
export const updateGraph = (id: number, graph: GraphToSave) =>
  apiRequest<{ id: number; name: string; updatedAt: string; libraryId?: string | null }>(`/graphs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(graph),
  })
export const deleteSavedGraph = (id: number) => apiRequest<void>(`/graphs/${id}`, { method: 'DELETE' })

export type ExperimentToSave = {
  graphId?: number | null
  clientId?: string
  runId?: string | null
  algorithm: string
  vertexCount: number
  edgeCount: number
  density: number
  repetitions: number
  seed?: number | null
  meanMs: number
  minMs: number
  maxMs: number
  medianMs?: number | null
  stdMs?: number | null
  operations?: number | null
  topology?: string | null
  status?: 'ran' | 'skipped' | 'error'
  sourceLabel?: string | null
  directed?: boolean
  weightMin?: number | null
  weightMax?: number | null
  generateMs?: number | null
  payload?: Record<string, unknown> | null
  updatedAt?: string
}

export type ExperimentFromApi = {
  id: number
  clientId: string | null
  graphId: number | null
  runId: string | null
  algorithm: string
  vertexCount: number
  edgeCount: number
  density: number
  repetitions: number
  seed: number | null
  meanMs: number
  minMs: number
  maxMs: number
  medianMs: number | null
  stdMs: number | null
  operations: number | null
  topology: string | null
  status: string
  sourceLabel: string | null
  directed: boolean
  weightMin: number | null
  weightMax: number | null
  generateMs: number | null
  createdAt: string
  updatedAt: string
  payload: Record<string, unknown> | null
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`)
    return response.ok
  } catch {
    return false
  }
}

export const saveExperiment = (experiment: ExperimentToSave) =>
  apiRequest<{ id: number; clientId?: string | null; updated?: boolean; updatedAt?: string }>('/experiments', {
    method: 'POST',
    body: JSON.stringify(experiment),
  })

export const getExperiments = (runId?: string) =>
  apiRequest<ExperimentFromApi[]>(runId ? `/experiments?runId=${encodeURIComponent(runId)}` : '/experiments')

export async function saveExperimentsBestEffort(experiments: ExperimentToSave[]): Promise<{ ok: boolean; saved: number; message: string }> {
  const healthy = await checkApiHealth()
  if (!healthy) {
    return {
      ok: false,
      saved: 0,
      message: 'Backend SQLite niedostępny — wyniki zapisano lokalnie; synchronizacja po połączeniu.',
    }
  }
  let saved = 0
  try {
    for (const item of experiments) {
      await saveExperiment(normalizeExperimentToSave(item))
      saved++
    }
    return {
      ok: true,
      saved,
      message: `Zapisano lokalnie oraz ${saved} pomiar(ów) w SQLite (API :3001).`,
    }
  } catch (error) {
    return {
      ok: false,
      saved,
      message: error instanceof Error
        ? `Zapisano lokalnie. SQLite: częściowy błąd (${saved} OK) — ${error.message}`
        : 'Zapisano lokalnie. Nie udało się dokończyć zapisu SQLite.',
    }
  }
}

export const getResearchStudies = () => apiRequest<ResearchStudy[]>('/research-studies')
export const getResearchStudy = (id: string) => apiRequest<ResearchStudy>(`/research-studies/${id}`)
export const saveResearchStudyApi = (study: ResearchStudy) =>
  apiRequest<{ id: string; updatedAt: string }>('/research-studies', {
    method: 'POST',
    body: JSON.stringify({
      ...study,
      updatedAt: (study as ResearchStudy & { updatedAt?: string }).updatedAt || new Date().toISOString(),
    }),
  })
export const updateResearchStudyApi = (id: string, study: ResearchStudy) =>
  apiRequest<{ id: string; updatedAt: string }>(`/research-studies/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...study,
      id,
      updatedAt: (study as ResearchStudy & { updatedAt?: string }).updatedAt || new Date().toISOString(),
    }),
  })
export const deleteResearchStudyApi = (id: string) =>
  apiRequest<void>(`/research-studies/${id}`, { method: 'DELETE' })
