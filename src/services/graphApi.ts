import type { Edge, Node } from '@xyflow/react'

const API_URL = 'http://localhost:3001/api'

export interface SavedGraphInfo {
  id: number
  name: string
  directed: boolean
  created_at: string
  updated_at: string
}

export interface SavedGraph {
  id: number
  name: string
  directed: boolean
  nodes: Node[]
  edges: Edge[]
  createdAt: string
  updatedAt: string
}

export interface GraphToSave {
  name: string
  directed: boolean
  nodes: Node[]
  edges: Edge[]
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
    const data: { error?: string } | null = await response.json().catch(() => null)
    throw new Error(data?.error ?? `Błąd serwera HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const getSavedGraphs = () => apiRequest<SavedGraphInfo[]>('/graphs')
export const getSavedGraph = (id: number) => apiRequest<SavedGraph>(`/graphs/${id}`)
export const saveGraph = (graph: GraphToSave) => apiRequest<{ id: number; name: string }>('/graphs', { method: 'POST', body: JSON.stringify(graph) })
export const deleteSavedGraph = (id: number) => apiRequest<void>(`/graphs/${id}`, { method: 'DELETE' })

export type ExperimentToSave = {
  algorithm: string
  vertexCount: number
  edgeCount: number
  density: number
  repetitions: number
  seed?: number | null
  meanMs: number
  minMs: number
  maxMs: number
  operations?: number | null
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
  apiRequest<{ id: number }>('/experiments', { method: 'POST', body: JSON.stringify(experiment) })

export async function saveExperimentsBestEffort(experiments: ExperimentToSave[]): Promise<{ ok: boolean; saved: number; message: string }> {
  const healthy = await checkApiHealth()
  if (!healthy) {
    return {
      ok: false,
      saved: 0,
      message: 'Backend SQLite niedostępny — wyniki zapisano tylko lokalnie w przeglądarce (localStorage: graphlab-benchmarks-v2).',
    }
  }
  let saved = 0
  try {
    for (const item of experiments) {
      await saveExperiment(item)
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
