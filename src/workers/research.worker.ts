/// <reference lib="webworker" />
/**
 * Seria badań porównawczych: każdy przypadek generuje JEDEN graf,
 * na którym mierzone są oba algorytmy z pary.
 */
import {
  algorithmLabels,
  graphDensityPercent,
  measureAlgorithmsFair,
  skippedResult,
  type AlgorithmId,
  type BenchResult,
} from '../utils/benchmark'
import { evaluateAlgorithmEligibility, inspectBenchGraph } from '../utils/benchEligibility'
import {
  generateBenchmarkGraph,
  isConnectedUndirectedView,
  validateGeneratorParams,
} from '../utils/largeGraphs'
import {
  invalidateBenchResult,
  verifyMstWeights,
  verifyNonNegativeShortestPaths,
  verifyReachableSets,
} from '../utils/pairCompare'
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
      const eligible: AlgorithmId[] = []
      for (const id of item.algorithms) {
        const eligibility = evaluateAlgorithmEligibility(id, facts)
        if (!eligibility.ok) {
          send({
            type: 'progress',
            message: `Pominięto ${algorithmLabels[id]}: ${eligibility.reason}`,
            percent: percentBase + 5,
            caseIndex: index + 1,
            caseTotal: total,
          })
          results.push(skippedResult(graph, id, eligibility.reason, metaBase, 'skipped'))
        } else {
          eligible.push(id)
        }
      }

      if (eligible.length) {
        send({
          type: 'progress',
          message: `Fair measurement (${eligible.map(id => algorithmLabels[id]).join(' · ')}) na „${item.label}” (${config.repetitions} powtórzeń)...`,
          percent: percentBase + 40,
          caseIndex: index + 1,
          caseTotal: total,
        })
        const measured = measureAlgorithmsFair(graph, eligible, config.repetitions, metaBase)
        const byId = new Map(measured.map(r => [r.algorithm, r]))
        const merged: BenchResult[] = []
        for (const id of item.algorithms) {
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

      // Weryfikacje poprawności — poza pętlą measure (nie wchodzą w czasy).
      const ranIds = new Set(results.filter(r => (r.status ?? 'ran') === 'ran').map(r => r.algorithm))
      if (ranIds.has('dijkstra') && ranIds.has('bellman') && facts.weightMin >= 0) {
        const agreement = verifyNonNegativeShortestPaths(graph, 0)
        if (!agreement.ok) {
          for (let i = 0; i < results.length; i++) {
            if (results[i].algorithm === 'dijkstra' || results[i].algorithm === 'bellman') {
              results[i] = invalidateBenchResult(
                results[i],
                `Niezgodność wyników najkrótszych ścieżek: ${agreement.message}`,
              )
            }
          }
        }
      }

      if (ranIds.has('bfs') && ranIds.has('dfs')) {
        const agreement = verifyReachableSets(graph, 0)
        if (!agreement.ok) {
          for (let i = 0; i < results.length; i++) {
            if (results[i].algorithm === 'bfs' || results[i].algorithm === 'dfs') {
              results[i] = invalidateBenchResult(results[i], agreement.message)
            }
          }
        }
      }

      if (ranIds.has('prim') && ranIds.has('kruskal')) {
        const agreement = verifyMstWeights(graph, 0)
        if (!agreement.ok) {
          for (let i = 0; i < results.length; i++) {
            if (results[i].algorithm === 'prim' || results[i].algorithm === 'kruskal') {
              results[i] = invalidateBenchResult(results[i], agreement.message)
            }
          }
        }
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
