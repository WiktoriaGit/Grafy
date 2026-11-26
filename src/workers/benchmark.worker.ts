/// <reference lib="webworker" />
import {
  algorithmLabels,
  measureAlgorithmsFair,
  skippedResult,
  type AlgorithmId,
  type BenchmarkRequest,
  type BenchGraph,
  type BenchResult,
} from '../utils/benchmark'
import {
  evaluateAlgorithmEligibility,
  inspectBenchGraph,
} from '../utils/benchEligibility'
import {
  generateBenchmarkGraph,
  type GeneratorParams,
  validateGeneratorParams,
} from '../utils/largeGraphs'
import {
  invalidateBenchResult,
  verifyMstWeights,
  verifyNonNegativeShortestPaths,
  verifyReachableSets,
  type DistanceAgreement,
} from '../utils/pairCompare'

type Reply =
  | { type: 'progress'; message: string; percent: number }
  | {
    type: 'complete'
    results: BenchResult[]
    edges: number
    generateMs: number
    distanceAgreement?: DistanceAgreement
    runId?: string
  }
  | { type: 'error'; message: string }

const send = (message: Reply) => self.postMessage(message)

self.onmessage = (event: MessageEvent<BenchmarkRequest>) => {
  try {
    const data = event.data
    if (!Number.isInteger(data.repetitions) || data.repetitions < 1 || data.repetitions > 100) {
      throw new Error('Nieprawidłowa liczba powtórzeń (dozwolone 1–100).')
    }
    if (!Array.isArray(data.selected) || data.selected.length === 0) {
      throw new Error('Wybierz przynajmniej jeden algorytm.')
    }

    let graph: BenchGraph
    let generateMs = data.generateMs ?? 0
    let directed = Boolean(data.directed)
    let topology = data.topology ?? 'custom'
    let weightMin = data.weightMin ?? 0
    let weightMax = data.weightMax ?? 0
    let seed = data.seed ?? 0
    const sourceLabel = data.sourceLabel ?? (data.source === 'generator' ? 'generator' : 'własny graf')
    const runId = data.runId ?? `${Date.now()}`

    if (data.source === 'custom') {
      if (!data.graph) throw new Error('Brak grafu wejściowego dla źródła custom.')
      send({ type: 'progress', message: 'Przygotowanie przekazanego grafu (bez React Flow)...', percent: 5 })
      graph = data.graph
      const facts = inspectBenchGraph(graph, directed)
      weightMin = facts.weightMin
      weightMax = facts.weightMax
    } else {
      const params: GeneratorParams = {
        topology: data.topology === 'custom' ? 'erdos' : (data.topology ?? 'erdos'),
        vertices: data.vertices ?? 100,
        densityPercent: data.densityPercent ?? 10,
        edgeCount: data.edgeCount,
        seed: data.seed ?? 1,
        weightMin: data.weightMin ?? 1,
        weightMax: data.weightMax ?? 20,
        directed: Boolean(data.directed),
      }
      if (params.topology === 'custom') {
        throw new Error('Generator nie obsługuje topologii „custom”.')
      }
      const validation = validateGeneratorParams(params)
      if (!validation.ok) throw new Error(validation.message)
      send({ type: 'progress', message: 'Generowanie grafu w osobnym wątku (bez React Flow)...', percent: 5 })
      const began = performance.now()
      graph = generateBenchmarkGraph(params)
      generateMs = performance.now() - began
      directed = params.directed
      topology = params.topology
      weightMin = params.weightMin
      weightMax = params.weightMax
      seed = params.seed
    }

    const facts = inspectBenchGraph(graph, directed)
    send({
      type: 'progress',
      message: `Graf gotowy: ${facts.vertices} V, ${facts.edges} E. Rozgrzewka i pomiary...`,
      percent: 15,
    })

    const metaBase = {
      generateMs,
      seed,
      directed,
      topology,
      weightMin,
      weightMax,
      runId,
      sourceLabel,
    }

    const results: BenchResult[] = []
    const eligible: AlgorithmId[] = []
    for (let index = 0; index < data.selected.length; index++) {
      const id = data.selected[index]
      const percent = 15 + Math.round(((index + 1) / data.selected.length) * 40)
      const eligibility = evaluateAlgorithmEligibility(id, facts)
      if (!eligibility.ok) {
        send({
          type: 'progress',
          message: `Pominięto ${algorithmLabels[id]}: ${eligibility.reason}`,
          percent,
        })
        results.push(skippedResult(graph, id, eligibility.reason, metaBase, 'skipped'))
        continue
      }
      eligible.push(id)
    }

    if (eligible.length) {
      send({
        type: 'progress',
        message: `Fair measurement (${eligible.map(id => algorithmLabels[id]).join(' · ')}), ${data.repetitions} powtórzeń`,
        percent: 55,
      })
      const measured = measureAlgorithmsFair(graph, eligible, data.repetitions, metaBase)
      const byId = new Map(measured.map(r => [r.algorithm, r]))
      // Zachowaj kolejność UI: skipped już w `results`, eligible wstaw wg selected.
      const merged: BenchResult[] = []
      for (const id of data.selected) {
        const fromSkipped = results.find(r => r.algorithm === id)
        if (fromSkipped) merged.push(fromSkipped)
        else {
          const m = byId.get(id)
          if (m) merged.push(m)
        }
      }
      results.length = 0
      results.push(...merged)
    }

    let distanceAgreement: DistanceAgreement | undefined
    const ranIds = new Set(results.filter(r => (r.status ?? 'ran') === 'ran').map(r => r.algorithm))

    if (ranIds.has('dijkstra') && ranIds.has('bellman') && facts.weightMin >= 0) {
      send({ type: 'progress', message: 'Weryfikacja zgodności odległości Dijkstra vs Bellman–Ford...', percent: 96 })
      distanceAgreement = verifyNonNegativeShortestPaths(graph, 0)
      if (!distanceAgreement.ok) {
        for (let i = 0; i < results.length; i++) {
          if (results[i].algorithm === 'dijkstra' || results[i].algorithm === 'bellman') {
            results[i] = invalidateBenchResult(results[i], distanceAgreement.message)
          }
        }
      }
    }

    if (ranIds.has('bfs') && ranIds.has('dfs')) {
      send({ type: 'progress', message: 'Weryfikacja zbiorów osiągalnych BFS vs DFS...', percent: 97 })
      const reachable = verifyReachableSets(graph, 0)
      if (!reachable.ok) {
        for (let i = 0; i < results.length; i++) {
          if (results[i].algorithm === 'bfs' || results[i].algorithm === 'dfs') {
            results[i] = invalidateBenchResult(results[i], reachable.message)
          }
        }
      }
    }

    if (ranIds.has('prim') && ranIds.has('kruskal')) {
      send({ type: 'progress', message: 'Weryfikacja wagi MST Prim vs Kruskal...', percent: 98 })
      const mst = verifyMstWeights(graph, 0)
      if (!mst.ok) {
        for (let i = 0; i < results.length; i++) {
          if (results[i].algorithm === 'prim' || results[i].algorithm === 'kruskal') {
            results[i] = invalidateBenchResult(results[i], mst.message)
          }
        }
      }
    }

    send({ type: 'progress', message: 'Zakończono pomiary.', percent: 100 })
    send({ type: 'complete', results, edges: graph.edges.length, generateMs, distanceAgreement, runId })
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Błąd obliczeń' })
  }
}
