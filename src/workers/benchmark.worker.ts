/// <reference lib="webworker" />
import {
  algorithmLabels,
  measure,
  type BenchmarkRequest,
  type BenchResult,
} from '../utils/benchmark'
import {
  algorithmLimit,
  generateBenchmarkGraph,
  type GeneratorParams,
  validateGeneratorParams,
} from '../utils/largeGraphs'

type Reply =
  | { type: 'progress'; message: string; percent: number }
  | { type: 'complete'; results: BenchResult[]; edges: number; generateMs: number }
  | { type: 'error'; message: string }

const send = (message: Reply) => self.postMessage(message)

self.onmessage = (event: MessageEvent<BenchmarkRequest>) => {
  try {
    const data = event.data
    const params: GeneratorParams = {
      topology: data.topology,
      vertices: data.vertices,
      densityPercent: data.densityPercent,
      edgeCount: data.edgeCount,
      seed: data.seed,
      weightMin: data.weightMin,
      weightMax: data.weightMax,
      directed: data.directed,
    }
    const validation = validateGeneratorParams(params)
    if (!validation.ok) throw new Error(validation.message)
    if (!Number.isInteger(data.repetitions) || data.repetitions < 1 || data.repetitions > 100) {
      throw new Error('Nieprawidłowa liczba powtórzeń (dozwolone 1–100).')
    }
    if (!Array.isArray(data.selected) || data.selected.length === 0) {
      throw new Error('Wybierz przynajmniej jeden algorytm.')
    }

    send({ type: 'progress', message: 'Generowanie grafu w osobnym wątku (bez React Flow)...', percent: 5 })
    const began = performance.now()
    const graph = generateBenchmarkGraph(params)
    const generateMs = performance.now() - began
    send({
      type: 'progress',
      message: `Graf gotowy: ${graph.adjacency.length} V, ${graph.edges.length} E (generowanie ${generateMs.toFixed(1)} ms). Rozgrzewka i pomiary...`,
      percent: 15,
    })

    const results: BenchResult[] = []
    for (let index = 0; index < data.selected.length; index++) {
      const id = data.selected[index]
      const limit = algorithmLimit(id, params.vertices, graph.edges.length)
      if (limit) throw new Error(limit)
      const percent = 15 + Math.round(((index + 1) / data.selected.length) * 80)
      send({
        type: 'progress',
        message: `Pomiar: ${algorithmLabels[id]} (${index + 1}/${data.selected.length}), ${data.repetitions} powtórzeń`,
        percent,
      })
      results.push(measure(graph, id, data.repetitions, {
        generateMs,
        seed: params.seed,
        directed: params.directed,
        topology: params.topology,
        weightMin: params.weightMin,
        weightMax: params.weightMax,
      }))
    }

    send({ type: 'progress', message: 'Zakończono pomiary.', percent: 100 })
    send({ type: 'complete', results, edges: graph.edges.length, generateMs })
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Błąd obliczeń' })
  }
}
