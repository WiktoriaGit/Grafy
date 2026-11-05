import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteLibraryGraph,
  duplicateLibraryGraph,
  exportLibraryGraphs,
  getLibraryGraph,
  importLibraryJson,
  LIBRARY_KEY,
  LIBRARY_MIGRATION_KEY,
  listLibraryGraphs,
  renameLibraryGraph,
  saveLibraryGraph,
} from './graphLibrary'
import type { WorkspaceGraph } from '../workspace/graphWorkspace'

const memory = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, String(value)) },
  removeItem: (key: string) => { memory.delete(key) },
  clear: () => { memory.clear() },
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })

const sample = (directed = false): WorkspaceGraph => ({
  version: 1,
  directed,
  nodes: [
    { id: 'A', position: { x: 0, y: 0 } },
    { id: 'B', position: { x: 40, y: 0 } },
    { id: 'C', position: { x: 20, y: 40 } },
  ],
  edges: [
    { source: 'A', target: 'B', weight: 2, sourceHandle: 'right', targetHandle: 'left' },
    { source: 'B', target: 'C', weight: 3 },
  ],
  start: 'A',
  end: 'C',
})

beforeEach(() => {
  localStorage.clear()
})

describe('Biblioteka grafów', () => {
  it('zapisuje i odczytuje wiele grafów z trwałym ID oraz datami', () => {
    const a = saveLibraryGraph('Pierwszy', sample(true))
    const b = saveLibraryGraph('Drugi', sample(false))
    expect(a.id).not.toBe(b.id)
    expect(a.createdAt).toBeTruthy()
    expect(a.updatedAt).toBeTruthy()
    const listed = listLibraryGraphs()
    expect(listed).toHaveLength(2)
    expect(getLibraryGraph(a.id)?.graph.edges[0].sourceHandle).toBe('right')
    expect(localStorage.getItem(LIBRARY_KEY)).toBeTruthy()
  })

  it('nadpisuje, kopiuje, zmienia nazwę i usuwa po operacjach CRUD', () => {
    const created = saveLibraryGraph('Bazowy', sample())
    const overwritten = saveLibraryGraph('Bazowy v2', {
      ...sample(),
      edges: [{ source: 'A', target: 'B', weight: 9 }],
    }, created.id)
    expect(overwritten.id).toBe(created.id)
    expect(overwritten.graph.edges[0].weight).toBe(9)

    const copy = duplicateLibraryGraph(created.id)
    expect(copy.id).not.toBe(created.id)
    expect(copy.name).toMatch(/kopia/i)

    const renamed = renameLibraryGraph(copy.id, 'Kopia nazwana')
    expect(renamed.name).toBe('Kopia nazwana')

    deleteLibraryGraph(created.id)
    expect(getLibraryGraph(created.id)).toBeNull()
    expect(listLibraryGraphs().some(g => g.id === copy.id)).toBe(true)
  })

  it('eksportuje i importuje JSON z walidacją', () => {
    saveLibraryGraph('Do eksportu', sample(true))
    const json = exportLibraryGraphs()
    localStorage.removeItem(LIBRARY_KEY)
    localStorage.setItem(LIBRARY_MIGRATION_KEY, '1')
    expect(listLibraryGraphs()).toHaveLength(0)
    const imported = importLibraryJson(json)
    expect(imported).toHaveLength(1)
    expect(imported[0].graph.directed).toBe(true)
    expect(imported[0].graph.nodes).toHaveLength(3)
  })

  it('odrzuca niepoprawny import', () => {
    expect(() => importLibraryJson('{')).toThrow(/JSON/i)
    expect(() => importLibraryJson('{"foo":1}')).toThrow(/formatu/i)
  })
})
