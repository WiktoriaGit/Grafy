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

  it('H4 przy badaniu vertices → nierozstrzygające (niedopasowanie rodzaju)', () => {
    const study = sampleStudy()
    const out = suggestHypothesisVerdict(study)
    expect(out.verdict).toBe('inconclusive')
    expect(out.note).toMatch(/heurystyczn/i)
    expect(out.note).toMatch(/nie pasuje|oczekiwane badanie structure/i)
  })

  it('nie traktuje wyników error jako poprawnej pary (bez zerowania)', () => {
    const study = sampleStudy()
    study.config = { ...study.config, studyKind: 'structure', hypothesis: 'H4', group: 'search' }
    study.cases = study.cases.slice(0, 2).map((c, i) => ({
      ...c,
      plan: { ...c.plan, topology: i === 0 ? 'path' : 'tree', studyKind: 'structure' as const },
      actualEdges: 50 + i * 40,
      results: c.results.map(r =>
        r.algorithm === 'dfs'
          ? { ...r, status: 'error' as const, skipReason: 'test', mean: 99 }
          : r,
      ),
    }))
    const out = suggestHypothesisVerdict(study)
    expect(out.verdict).toBe('inconclusive')
    expect(out.note).toMatch(/kompletnych|par/i)
  })

  it('H2: wspiera wzrost luki Dijkstra–Bellman z V', () => {
    const study = sampleStudy()
    study.config = {
      ...study.config,
      studyKind: 'vertices',
      group: 'shortest',
      hypothesis: 'H2',
    }
    study.cases = [100, 400, 800].map((v, index) => ({
      plan: {
        id: `c-${index}`,
        index,
        label: `V=${v}`,
        studyKind: 'vertices' as const,
        topology: 'erdos' as const,
        vertices: v,
        densityPercent: 10,
        seed: index,
        algorithms: ['dijkstra', 'bellman'] as ['dijkstra', 'bellman'],
        generator: {
          topology: 'erdos',
          vertices: v,
          densityPercent: 10,
          seed: index,
          weightMin: 1,
          weightMax: 20,
          directed: false,
        },
      },
      generateMs: 1,
      actualVertices: v,
      actualEdges: v * 2,
      actualDensity: 10,
      connected: true,
      results: [
        {
          id: `d-${index}`,
          algorithm: 'dijkstra' as const,
          vertices: v,
          edges: v * 2,
          density: 10,
          repetitions: 5,
          mean: 2 + index,
          median: 2,
          stdDev: 0.1,
          min: 1.8,
          max: 2.2,
          operations: 10,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: index,
          directed: false,
          topology: 'erdos' as const,
          weightMin: 1,
          weightMax: 20,
          status: 'ran' as const,
        },
        {
          id: `b-${index}`,
          algorithm: 'bellman' as const,
          vertices: v,
          edges: v * 2,
          density: 10,
          repetitions: 5,
          mean: 5 + index * 8,
          median: 5,
          stdDev: 0.2,
          min: 4,
          max: 6,
          operations: 10,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: index,
          directed: false,
          topology: 'erdos' as const,
          weightMin: 1,
          weightMax: 20,
          status: 'ran' as const,
        },
      ],
    }))
    const out = suggestHypothesisVerdict(study)
    expect(out.verdict).toBe('supported')
    expect(out.note).toMatch(/heurystyczn/i)
  })

  it('H1: wspiera wzrost czasu wraz z E przy stałym V', () => {
    const study = sampleStudy()
    study.config = { ...study.config, studyKind: 'edges', group: 'search', hypothesis: 'H1' }
    study.cases = [200, 800, 2000].map((e, index) => ({
      plan: {
        id: `e-${index}`,
        index,
        label: `E=${e}`,
        studyKind: 'edges' as const,
        topology: 'erdos' as const,
        vertices: 100,
        densityPercent: 10,
        edgeCount: e,
        seed: index,
        algorithms: ['bfs', 'dfs'] as ['bfs', 'dfs'],
        generator: {
          topology: 'erdos',
          vertices: 100,
          densityPercent: 10,
          seed: index,
          weightMin: 1,
          weightMax: 20,
          directed: false,
          edgeCount: e,
        },
      },
      generateMs: 1,
      actualVertices: 100,
      actualEdges: e,
      actualDensity: 10,
      connected: true,
      results: [
        {
          id: `bfs-${index}`,
          algorithm: 'bfs' as const,
          vertices: 100,
          edges: e,
          density: 10,
          repetitions: 5,
          mean: 1 + index * 3,
          median: 1,
          stdDev: 0.05,
          min: 0.9,
          max: 1.1,
          operations: e,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: index,
          directed: false,
          topology: 'erdos' as const,
          weightMin: 1,
          weightMax: 20,
          status: 'ran' as const,
        },
        {
          id: `dfs-${index}`,
          algorithm: 'dfs' as const,
          vertices: 100,
          edges: e,
          density: 10,
          repetitions: 5,
          mean: 1.2 + index * 3,
          median: 1.2,
          stdDev: 0.05,
          min: 1,
          max: 1.4,
          operations: e,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: index,
          directed: false,
          topology: 'erdos' as const,
          weightMin: 1,
          weightMax: 20,
          status: 'ran' as const,
        },
      ],
    }))
    const out = suggestHypothesisVerdict(study)
    expect(out.verdict).toBe('supported')
  })

  it('H3: zaznacza confound topologii gdy E się zmienia', () => {
    const study = sampleStudy()
    study.config = { ...study.config, studyKind: 'structure', group: 'mst', hypothesis: 'H3' }
    const tops = ['path', 'tree', 'erdos'] as const
    study.cases = tops.map((topology, index) => ({
      plan: {
        id: `t-${index}`,
        index,
        label: topology,
        studyKind: 'structure' as const,
        topology,
        vertices: 200,
        densityPercent: 10,
        seed: index,
        algorithms: ['prim', 'kruskal'] as ['prim', 'kruskal'],
        generator: {
          topology,
          vertices: 200,
          densityPercent: 10,
          seed: index,
          weightMin: 1,
          weightMax: 20,
          directed: false,
        },
      },
      generateMs: 1,
      actualVertices: 200,
      actualEdges: 50 + index * 200,
      actualDensity: 5 + index * 10,
      connected: true,
      results: [
        {
          id: `p-${index}`,
          algorithm: 'prim' as const,
          vertices: 200,
          edges: 50 + index * 200,
          density: 5 + index * 10,
          repetitions: 5,
          mean: index === 0 ? 10 : 3,
          median: 3,
          stdDev: 0.1,
          min: 2,
          max: 11,
          operations: 10,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: index,
          directed: false,
          topology,
          weightMin: 1,
          weightMax: 20,
          status: 'ran' as const,
        },
        {
          id: `k-${index}`,
          algorithm: 'kruskal' as const,
          vertices: 200,
          edges: 50 + index * 200,
          density: 5 + index * 10,
          repetitions: 5,
          mean: index === 0 ? 3 : 10,
          median: 3,
          stdDev: 0.1,
          min: 2,
          max: 11,
          operations: 10,
          reached: true,
          timestamp: new Date().toISOString(),
          generateMs: 1,
          seed: index,
          directed: false,
          topology,
          weightMin: 1,
          weightMax: 20,
          status: 'ran' as const,
        },
      ],
    }))
    const out = suggestHypothesisVerdict(study)
    expect(out.verdict).toBe('supported')
    expect(out.note).toMatch(/nie należy przypisywać wyłącznie strukturze|E\/gęstość|krawędzi/i)
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
