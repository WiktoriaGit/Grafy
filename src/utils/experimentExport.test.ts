import { describe, expect, it } from 'vitest'
import {
  buildBenchReportSections,
  buildResearchReportSections,
} from './experimentExport'
import type { BenchResult } from './benchmark'
import type { ResearchStudy } from './researchStudy'

const sampleRow = (partial: Partial<BenchResult> & Pick<BenchResult, 'algorithm'>): BenchResult => ({
  id: partial.id ?? `id-${partial.algorithm}`,
  algorithm: partial.algorithm,
  vertices: partial.vertices ?? 100,
  edges: partial.edges ?? 200,
  density: partial.density ?? 10,
  repetitions: partial.repetitions ?? 5,
  mean: partial.mean ?? 12.5,
  median: partial.median ?? 12,
  stdDev: partial.stdDev ?? 1.1,
  min: partial.min ?? 10,
  max: partial.max ?? 15,
  operations: partial.operations ?? 1000,
  reached: partial.reached ?? true,
  timestamp: partial.timestamp ?? '2026-11-19T12:00:00.000Z',
  generateMs: partial.generateMs ?? 3,
  seed: partial.seed ?? 42,
  directed: partial.directed ?? false,
  topology: partial.topology ?? 'erdos',
  weightMin: partial.weightMin ?? 1,
  weightMax: partial.weightMax ?? 20,
  status: partial.status ?? 'ran',
  skipReason: partial.skipReason,
  runId: partial.runId,
  sourceLabel: partial.sourceLabel,
})

describe('experimentExport — sekcje raportu z realnych danych', () => {
  it('buduje raport benchmarku tylko z przekazanych wierszy', () => {
    const rows = [
      sampleRow({ algorithm: 'bfs', mean: 8 }),
      sampleRow({ algorithm: 'dfs', mean: 11, id: 'dfs-1' }),
    ]
    const sections = buildBenchReportSections(rows, {
      title: 'Test eksperymentu ąłżć',
      generatedAt: '2026-11-19T12:00:00.000Z',
    })
    expect(sections.title).toBe('Test eksperymentu ąłżć')
    expect(sections.algorithms).toEqual(['BFS', 'DFS'])
    expect(sections.tableRows).toHaveLength(2)
    expect(sections.tableRows[0][0]).toBe('BFS')
    expect(sections.analysis.some(line => line.includes('BFS') || line.includes('DFS') || line.includes('pomiar'))).toBe(true)
    expect(sections.params.repetitions).toBe(5)
  })

  it('nie wymyśla wniosków przy braku wykonanych pomiarów', () => {
    const rows = [
      sampleRow({
        algorithm: 'prim',
        status: 'skipped',
        skipReason: 'Wymaga grafu nieskierowanego',
        mean: 0,
      }),
    ]
    const sections = buildBenchReportSections(rows, { title: 'Puste' })
    expect(sections.analysis.some(l => /Brak ukończonych pomiarów/i.test(l))).toBe(true)
  })

  it('eksportuje error z zachowanym czasem i przyczyną (I1/I3)', () => {
    const rows = [
      sampleRow({
        algorithm: 'bfs',
        status: 'error',
        skipReason: 'Niezgodność zbiorów osiągalnych',
        mean: 2.25,
        median: 2.2,
        stdDev: 0.1,
      }),
    ]
    const sections = buildBenchReportSections(rows, { title: 'Błąd walidacji' })
    expect(sections.tableRows[0][1]).toMatch(/błąd: Niezgodność zbiorów osiągalnych/)
    expect(sections.tableRows[0][4]).toMatch(/2[,.]250\*/)
    expect(sections.analysis.some(l => /\*/.test(l) && /wykluczono/i.test(l))).toBe(true)
  })

  it('buduje raport badania porównawczego z interpretacją ze study', () => {
    const study: ResearchStudy = {
      id: 's1',
      name: 'Badanie A — wierzchołki',
      createdAt: '2026-11-19T10:00:00.000Z',
      config: {
        name: 'Badanie A — wierzchołki',
        studyKind: 'vertices',
        group: 'search',
        topology: 'erdos',
        vertices: 500,
        vertexSizes: [100, 500],
        densityPercent: 10,
        densitySweep: [],
        edgeSweep: [],
        repetitions: 5,
        seed: 7,
        weightMin: 1,
        weightMax: 10,
        directed: false,
        hypothesis: 'H4',
      },
      plan: [],
      cases: [
        {
          plan: {
            id: 'c1',
            index: 0,
            label: 'V=100',
            studyKind: 'vertices',
            topology: 'erdos',
            vertices: 100,
            densityPercent: 10,
            seed: 7,
            algorithms: ['bfs', 'dfs'],
            generator: {
              topology: 'erdos',
              vertices: 100,
              densityPercent: 10,
              seed: 7,
              directed: false,
              weightMin: 1,
              weightMax: 10,
            },
          },
          generateMs: 2,
          actualVertices: 100,
          actualEdges: 50,
          actualDensity: 10,
          connected: true,
          results: [
            sampleRow({ algorithm: 'bfs', mean: 4, vertices: 100, edges: 50 }),
            sampleRow({ algorithm: 'dfs', mean: 5, id: 'dfs', vertices: 100, edges: 50 }),
          ],
        },
      ],
      interpretation: ['Wniosek z pomiarów: BFS był szybszy w tym przypadku.'],
      hypothesisVerdict: 'inconclusive',
      hypothesisNote: 'Za mało punktów do rozstrzygnięcia.',
    }

    const sections = buildResearchReportSections(study)
    expect(sections.title).toBe('Badanie A — wierzchołki')
    expect(sections.algorithms).toEqual(['BFS', 'DFS'])
    expect(sections.tableRows).toHaveLength(2)
    expect(sections.interpretation[0]).toContain('BFS')
    expect(sections.params.repetitions).toBe(5)
  })
})
