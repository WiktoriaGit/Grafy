/// <reference lib="webworker" />
import { algorithmLabels, measure, type AlgorithmId, type BenchResult } from '../utils/benchmark'
import { algorithmLimit, generateLargeGraph } from '../utils/largeGraphs'

type Request = { vertices: number; density: number; seed: number; repetitions: number; selected: AlgorithmId[] }
type Reply = { type: 'progress'; message: string } | { type: 'complete'; results: BenchResult[]; edges: number } | { type: 'error'; message: string }
const send = (message: Reply) => self.postMessage(message)
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { vertices, density, seed, repetitions, selected } = event.data
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('Nieprawidłowa liczba powtórzeń.')
    send({ type: 'progress', message: 'Generowanie grafu w osobnym wątku...' })
    const graph = generateLargeGraph(vertices, density, seed)
    const results: BenchResult[] = []
    for (const id of selected) {
      const limit = algorithmLimit(id, vertices, graph.edges.length)
      if (limit) throw new Error(limit)
      send({ type: 'progress', message: `Pomiar: ${algorithmLabels[id]} (${results.length + 1}/${selected.length})` })
      results.push(measure(graph, id, repetitions))
    }
    send({ type: 'complete', results, edges: graph.edges.length })
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Błąd obliczeń' })
  }
}
