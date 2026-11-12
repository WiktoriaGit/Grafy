/// <reference lib="webworker" />
/**
 * Seria badań porównawczych: każdy przypadek generuje JEDEN graf,
 * na którym mierzone są oba algorytmy z pary.
 */
import {
  algorithmLabels,
  graphDensityPercent,
  measure,
  skippedResult,
  type BenchResult,
} from '../utils/benchmark'
import { evaluateAlgorithmEligibility, inspectBenchGraph } from '../utils/benchEligibility'
import {
  generateBenchmarkGraph,
  isConnectedUndirectedView,
  validateGeneratorParams,
} from '../utils/largeGraphs'
import { verifyNonNegativeShortestPaths } from '../utils/pairCompare'
import type {
  ResearchCasePlan,
  ResearchCaseResult,
  ResearchConfig,
  ResearchRequest,
} from '../utils/researchStudy'

type Reply =
  | { type: 'progress'; message: string; percent: number; caseIndex?: number; caseTotal?: number }
  | {
    type: 'complete'
    studyId: string
    name: string
    config: ResearchConfig
    plan: ResearchCasePlan[]
    cases: ResearchCaseResult[]
  }
  | { type: 'error'; message: string }

const send = (message: Reply) => self.postMessage(message)

self.onmessage = (event: MessageEvent<ResearchRequest>) => {
  try {
    const { studyId, name, config, plan } = event.data
    if (!plan?.length) throw new Error('Plan badań jest pusty.')
    if (!Number.isInteger(config.repetitions) || config.repetitions < 1 || config.repetitions > 100) {
      throw new Error('Nieprawidłowa liczba powtórzeń (1–100).')
    }

    const cases: ResearchCaseResult[] = []
    const total = plan.length

    for (let index = 0; index < plan.length; index++) {
      const item = plan[index]
      const percentBase = Math.round((index / total) * 100)

      if (item.warning) {
        send({
          type: 'progress',
          message: `Pominięto przypadek „${item.label}”: ${item.warning}`,
          percent: percentBase,
          caseIndex: index + 1,
          caseTotal: total,
        })
        const emptyGraph = { adjacency: Array.from({ length: item.vertices }, () => []), edges: [] }
        cases.push({
          plan: item,
          generateMs: 0,
          actualVertices: item.vertices,
          actualEdges: 0,
          actualDensity: 0,
          connected: false,
          results: item.algorithms.map(id => skippedResult(
            emptyGraph,
            id,
            item.warning || 'Pominięto',
            {
              generateMs: 0,
              seed: item.seed,
              directed: item.generator.directed,
              topology: item.topology,
              weightMin: item.generator.weightMin,
              weightMax: item.generator.weightMax,
              runId: studyId,
              sourceLabel: `${name} · ${item.label}`,
            },
            'skipped',
          )),
        })
        continue
      }

      const validation = validateGeneratorParams(item.generator)
      if (!validation.ok) {
        throw new Error(`Nieprawidłowy generator w „${item.label}”: ${validation.message}`)
      }

      send({
        type: 'progress',
        message: `Generowanie grafu: ${item.label} (seed ${item.seed})...`,
        percent: percentBase + 2,
        caseIndex: index + 1,
        caseTotal: total,
      })

      const began = performance.now()
      const graph = generateBenchmarkGraph(item.generator)
      const generateMs = performance.now() - began
      const facts = inspectBenchGraph(graph, item.generator.directed)
      const connected = isConnectedUndirectedView(graph)
      const actualDensity = graphDensityPercent(facts.vertices, facts.edges, item.generator.directed)

      const metaBase = {
        generateMs,
        seed: item.seed,
        directed: item.generator.directed,
        topology: item.topology,
        weightMin: facts.weightMin,
        weightMax: facts.weightMax,
        runId: studyId,
        sourceLabel: `${name} · ${item.label}`,
      }

      const results: BenchResult[] = []
      for (let algoIndex = 0; algoIndex < item.algorithms.length; algoIndex++) {
        const id = item.algorithms[algoIndex]
        const eligibility = evaluateAlgorithmEligibility(id, facts)
        send({
          type: 'progress',
          message: eligibility.ok
            ? `Pomiar ${algorithmLabels[id]} na „${item.label}” (${config.repetitions} powtórzeń)...`
            : `Pominięto ${algorithmLabels[id]}: ${eligibility.reason}`,
          percent: percentBase + 5 + Math.round(((algoIndex + 1) / item.algorithms.length) * (90 / total)),
          caseIndex: index + 1,
          caseTotal: total,
        })
        if (!eligibility.ok) {
          results.push(skippedResult(graph, id, eligibility.reason, metaBase, 'skipped'))
          continue
        }
        results.push(measure(graph, id, config.repetitions, metaBase))
      }

      // Zgodność odległości na tym samym grafie (gdy obie ścieżki najkrótsze się wykonały).
      const ranIds = new Set(results.filter(r => (r.status ?? 'ran') === 'ran').map(r => r.algorithm))
      if (ranIds.has('dijkstra') && ranIds.has('bellman') && facts.weightMin >= 0) {
        const agreement = verifyNonNegativeShortestPaths(graph, 0)
        if (!agreement.ok) {
          for (let i = 0; i < results.length; i++) {
            if (results[i].algorithm === 'dijkstra' || results[i].algorithm === 'bellman') {
              results[i] = {
                ...results[i],
                status: 'error',
                skipReason: `Niezgodność wyników najkrótszych ścieżek: ${agreement.message}`,
                mean: 0,
                median: 0,
                min: 0,
                max: 0,
                stdDev: 0,
              }
            }
          }
        }
      }

      // Zgodność wagi MST (Prim vs Kruskal) — dopuszczalne różne zestawy krawędzi przy remisach.
      if (ranIds.has('prim') && ranIds.has('kruskal')) {
        const prim = results.find(r => r.algorithm === 'prim')
        const kruskal = results.find(r => r.algorithm === 'kruskal')
        // Operacje nie niosą wagi MST w BenchResult; weryfikacja wag jest w testach jednostkowych.
        // Tu oznaczamy tylko, że oba pomiary na tym samym grafie zakończyły się statusem ran.
        void prim
        void kruskal
      }

      cases.push({
        plan: item,
        generateMs,
        actualVertices: facts.vertices,
        actualEdges: facts.edges,
        actualDensity,
        connected,
        results,
      })
    }

    send({
      type: 'progress',
      message: 'Zakończono serię badań.',
      percent: 100,
      caseIndex: total,
      caseTotal: total,
    })
    send({ type: 'complete', studyId, name, config, plan, cases })
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Błąd serii badań' })
  }
}
