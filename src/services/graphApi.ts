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
