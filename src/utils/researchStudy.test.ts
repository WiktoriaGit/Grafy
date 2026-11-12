import { describe, expect, it } from 'vitest'
import {
  generateBenchmarkGraph,
  isBipartitePartitioned,
  isConnectedUndirectedView,
  topologyLabels,
} from './largeGraphs'
import {
  ALGORITHM_PAIR_BY_GROUP,
  buildInterpretation,
  buildResearchPlan,
  defaultResearchConfig,
  executablePlans,
  exportResearchCSV,
  exportResearchJSON,
  suggestHypothesisVerdict,
  type ResearchCaseResult,
  type ResearchStudy,
} from './researchStudy'

describe('Badania porównawcze — plan i generatory', () => {
  it('buduje plan badania A (wierzchołki) z deterministycznymi seedami', () => {
    const config = {
      ...defaultResearchConfig(),
      studyKind: 'vertices' as const,
      group: 'search' as const,
      topology: 'erdos' as const,
      vertexSizes: [100, 200, 400],
      seed: 42,
    }
    const plan = buildResearchPlan(config)
    expect(plan.length).toBe(3)
    expect(plan[0].algorithms).toEqual(ALGORITHM_PAIR_BY_GROUP.search)
    expect(plan[0].seed).not.toBe(plan[1].seed)
    expect(executablePlans(plan).length).toBe(3)
  })

  it('w badaniu B utrzymuje stałe V i zmienia E', () => {
    const plan = buildResearchPlan({
      ...defaultResearchConfig(),
      studyKind: 'edges',
      group: 'mst',
      vertices: 200,
      edgeSweep: [300, 800, 1500],
    })
    expect(plan.every(p => p.vertices === 200)).toBe(true)
    expect(plan.map(p => p.edgeCount)).toEqual([300, 800, 1500])
  })

  it('oznacza ostrzeżeniem zbyt kosztowne przypadki Bellmana–Forda', () => {
    const plan = buildResearchPlan({
      ...defaultResearchConfig(),
      studyKind: 'vertices',
      group: 'shortest',
      topology: 'dense',
      vertexSizes: [1000],
      densityPercent: 45,
    })
    expect(plan.some(p => Boolean(p.warning))).toBe(true)
    expect(executablePlans(plan).length).toBe(0)
  })

  it('generuje spójny graf dwudzielny i pełny dwudzielny', () => {
    const bipartite = generateBenchmarkGraph({
      topology: 'bipartite',
      vertices: 40,
      densityPercent: 20,
      seed: 7,
      weightMin: 1,
      weightMax: 5,
      directed: false,
    })
    expect(isBipartitePartitioned(bipartite)).toBe(true)
    expect(isConnectedUndirectedView(bipartite)).toBe(true)

    const completeBi = generateBenchmarkGraph({
      topology: 'completeBipartite',
      vertices: 30,
      densityPercent: 100,
      seed: 9,
      weightMin: 1,
      weightMax: 3,
      directed: false,
    })
    expect(completeBi.edges.length).toBe(15 * 15)
    expect(isBipartitePartitioned(completeBi)).toBe(true)
  })

  it('rzadki i gęsty mają powtarzalny seed oraz różną gęstość', () => {
    const sparseA = generateBenchmarkGraph({
      topology: 'sparse', vertices: 80, densityPercent: 50, seed: 11, weightMin: 1, weightMax: 4, directed: false,
    })
    const sparseB = generateBenchmarkGraph({
      topology: 'sparse', vertices: 80, densityPercent: 50, seed: 11, weightMin: 1, weightMax: 4, directed: false,
    })
    const dense = generateBenchmarkGraph({
      topology: 'dense', vertices: 80, densityPercent: 1, seed: 11, weightMin: 1, weightMax: 4, directed: false,
    })
    expect(sparseA).toEqual(sparseB)
    expect(dense.edges.length).toBeGreaterThan(sparseA.edges.length)
    expect(isConnectedUndirectedView(sparseA)).toBe(true)
    expect(topologyLabels.sparse).toMatch(/rzadki/i)
  })

  it('oba algorytmy w planie dostają te same parametry przypadku', () => {
    const plan = buildResearchPlan({
      ...defaultResearchConfig(),
      studyKind: 'structure',
      group: 'shortest',
      vertices: 100,
      topologies: ['path', 'tree'],
    })
    for (const item of plan) {
      expect(item.algorithms[0]).toBe('dijkstra')
      expect(item.algorithms[1]).toBe('bellman')
      expect(item.generator.seed).toBe(item.seed)
    }
  })
})

describe('Interpretacja i eksport badań', () => {
  const sampleStudy = (): ResearchStudy => {
    const config = defaultResearchConfig()
    const plan = buildResearchPlan({
      ...config,
      studyKind: 'vertices',
      group: 'search',
      vertexSizes: [50, 80],
    })
    const cases: ResearchCaseResult[] = plan.map((p, index) => ({
      plan: p,
      generateMs: 1,
      actualVertices: p.vertices,
      actualEdges: p.vertices,
      actualDensity: 2,
      connected: true,
      results: [
        {
          id: `a-${index}`,
          algorithm: 'bfs',
          vertices: p.vertices,
          edges: p.vertices,
          density: 2,
          repetitions: 5,
          mean: 4 + index,
          median: 4,
          stdDev: 0.2,
          min: 3.5,
          max: 5,
          operations: 100,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: p.seed,
          directed: false,
          topology: p.topology,
          weightMin: 1,
          weightMax: 20,
          status: 'ran',
        },
        {
          id: `b-${index}`,
          algorithm: 'dfs',
          vertices: p.vertices,
          edges: p.vertices,
          density: 2,
          repetitions: 5,
          mean: 7 + index,
          median: 7,
          stdDev: 0.3,
          min: 6,
          max: 8,
          operations: 100,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: p.seed,
          directed: false,
          topology: p.topology,
          weightMin: 1,
          weightMax: 20,
          status: 'ran',
        },
      ],
    }))
    return {
      id: 't1',
      name: 'Test',
      createdAt: new Date().toISOString(),
      config: { ...config, studyKind: 'vertices', group: 'search', hypothesis: 'H4' },
      plan,
      cases,
      interpretation: [],
      hypothesisVerdict: 'unset',
      hypothesisNote: '',
    }
  }

  it('nie generuje fikcyjnych wniosków bez danych', () => {
    const empty = sampleStudy()
    empty.cases = []
    expect(buildInterpretation(empty)[0]).toMatch(/Brak ukończonych pomiarów/i)
  })

  it('buduje interpretację na podstawie rzeczywistych średnich', () => {
    const study = sampleStudy()
    const lines = buildInterpretation(study)
    expect(lines.some(l => /BFS/i.test(l))).toBe(true)
    expect(lines.some(l => /DFS/i.test(l))).toBe(true)
    expect(lines.join(' ')).toMatch(/ms/)
  })

  it('sugeruje verdict hipotezy bez uznawania pojedynczego pomiaru za dowód', () => {
    const one = sampleStudy()
    one.cases = one.cases.slice(0, 1)
    expect(suggestHypothesisVerdict(one).verdict).toBe('inconclusive')
  })

  it('eksportuje CSV i JSON z metadanymi badania', () => {
    const study = sampleStudy()
    const json = exportResearchJSON(study)
    const csv = exportResearchCSV(study)
    expect(json).toContain('"name": "Test"')
    expect(csv.split('\n')[0]).toContain('badanie')
    expect(csv).toContain('BFS')
  })
})
