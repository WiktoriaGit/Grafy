import {
  algorithmLabels,
  dijkstraHeap,
  runBenchmarkAlgorithm,
  type AlgorithmId,
  type BenchGraph,
  type BenchResult,
} from './benchmark'
import { COMPLEXITY_CATALOG, type ComplexityEntry } from './complexityCatalog'

export type DistanceAgreement = {
  ok: boolean
  checked: number
  mismatches: number
  message: string
}

export type PairComparison = {
  left: BenchResult
  right: BenchResult
  fasterId: AlgorithmId | 'tie'
  slowerId: AlgorithmId | null
  diffMs: number
  /** How many percent faster the quicker mean is vs the slower mean; null if undefined. */
  diffPercent: number | null
  unstable: boolean
  sameInput: boolean
  warnings: string[]
  conclusions: string[]
  complexityLeft: ComplexityEntry | null
  complexityRight: ComplexityEntry | null
  distanceAgreement?: DistanceAgreement
}

export function percentFaster(fasterMean: number, slowerMean: number): number | null {
  if (!Number.isFinite(fasterMean) || !Number.isFinite(slowerMean) || slowerMean <= 0) return null
  return ((slowerMean - fasterMean) / slowerMean) * 100
}

export function benchComplexity(id: AlgorithmId): ComplexityEntry | null {
  return COMPLEXITY_CATALOG.find(item => item.context === 'benchmark' && item.id === `${id}-bench`) ?? null
}

/** Methodology notes for a pair — independent of measured times. */
export function methodologyWarnings(left: AlgorithmId, right: AlgorithmId): string[] {
  const notes: string[] = []
  const set = new Set([left, right])

  if (set.has('bfs') && set.has('dfs')) {
    notes.push(
      'BFS i DFS porównujemy jako metody przeszukiwania (kolejka vs stos), nie jako algorytmy najkrótszej drogi ważonej. '
      + 'BFS daje najkrótszą ścieżkę tylko w sensie liczby krawędzi; DFS tego nie gwarantuje.',
    )
  }

  if (set.has('bfs') && (set.has('dijkstra') || set.has('bellman'))) {
    notes.push(
      'BFS rozwiązuje inne zadanie niż Dijkstra/Bellman–Ford na grafach ważonych — nie interpretuj samego czasu jako „lepszej metody najkrótszej ścieżki”.',
    )
  }

  if (set.has('dfs') && (set.has('dijkstra') || set.has('bellman'))) {
    notes.push(
      'DFS nie jest algorytmem najkrótszej drogi. Porównanie z Dijkstrą/Bellmanem–Fordem dotyczy kosztu eksploracji, nie jakości ścieżki.',
    )
  }

  if (set.has('dijkstra') && set.has('bellman')) {
    notes.push(
      'Przy wagach nieujemnych obie metody powinny dać te same odległości od źródła. '
      + 'Dijkstra (kopiec w benchmarku) jest zwykle szybsza; Bellman–Ford obsługuje także wagi ujemne i wykrywa ujemne cykle. '
      + 'Przy ujemnych wagach Dijkstry nie uruchamiamy jako poprawnej metody.',
    )
  }

  if (set.has('prim') && set.has('kruskal')) {
    notes.push(
      'Prim i Kruskal porównujemy w kategorii MST / minimalnego lasu rozpinającego — nie jako algorytmy najkrótszej ścieżki.',
    )
  }

  if ((set.has('prim') || set.has('kruskal')) && (set.has('bfs') || set.has('dfs') || set.has('dijkstra') || set.has('bellman'))) {
    notes.push(
      'MST (Prim/Kruskal) rozwiązuje inny problem niż przeszukiwanie lub najkrótsze ścieżki — porównuj czasy tylko w ramach tej samej kategorii.',
    )
  }

  if (left === right) {
    notes.push('Wybrano dwa razy ten sam algorytm — różnice czasu wynikają wyłącznie ze zmienności pomiaru.')
  }

  return notes
}

export function verifyNonNegativeShortestPaths(graph: BenchGraph, source = 0): DistanceAgreement {
  const n = graph.adjacency.length
  if (!Number.isInteger(source) || source < 0 || source >= n) {
    return { ok: false, checked: 0, mismatches: 0, message: 'Nieprawidłowe źródło weryfikacji odległości.' }
  }
  const dijkstra = dijkstraHeap(graph, source).distances
  const bellman = runBenchmarkAlgorithm(graph, 'bellman', { source }).distances
  if (!bellman) {
    return { ok: false, checked: n, mismatches: n, message: 'Bellman–Ford nie zwrócił tablicy odległości.' }
  }
  let mismatches = 0
  for (let i = 0; i < n; i++) {
    const a = dijkstra[i]
    const b = bellman[i]
    const aFin = Number.isFinite(a)
    const bFin = Number.isFinite(b)
    if (aFin !== bFin || (aFin && a !== b)) mismatches++
  }
  return {
    ok: mismatches === 0,
    checked: n,
    mismatches,
    message: mismatches === 0
      ? `Zgodność odległości Dijkstra/Bellman–Ford: wszystkie ${n} wierzchołków (źródło ${source}).`
      : `Niezgodność odległości: ${mismatches} z ${n} wierzchołków różni się między Dijkstrą a Bellmanem–Fordem.`,
  }
}

export function sameBenchmarkInput(a: BenchResult, b: BenchResult): boolean {
  return a.vertices === b.vertices
    && a.edges === b.edges
    && a.seed === b.seed
    && a.topology === b.topology
    && a.directed === b.directed
    && a.weightMin === b.weightMin
    && a.weightMax === b.weightMax
    && a.repetitions === b.repetitions
}

export function buildPairComparison(
  left: BenchResult,
  right: BenchResult,
  options?: { distanceAgreement?: DistanceAgreement },
): PairComparison {
  const sameInput = sameBenchmarkInput(left, right)
  const warnings = [
    ...methodologyWarnings(left.algorithm, right.algorithm),
    ...(sameInput
      ? []
      : ['Uwaga: metryki pochodzą z pomiarów o różnych parametrach wejścia — porównanie czasów może być mylące.']),
  ]

  let fasterId: AlgorithmId | 'tie' = 'tie'
  let slowerId: AlgorithmId | null = null
  let diffMs = Math.abs(left.mean - right.mean)
  let diffPercent: number | null = null

  if (left.mean < right.mean) {
    fasterId = left.algorithm
    slowerId = right.algorithm
    diffPercent = percentFaster(left.mean, right.mean)
  } else if (right.mean < left.mean) {
    fasterId = right.algorithm
    slowerId = left.algorithm
    diffPercent = percentFaster(right.mean, left.mean)
  }

  const unstable = left.mean < 1 && right.mean < 1
    || (diffPercent !== null && diffPercent < 5 && diffMs < 2)

  if (unstable) {
    warnings.push(
      'Różnica czasów jest mała lub oba pomiary są bardzo krótkie (< 1 ms). '
      + 'Nie ogłaszaj trwałej przewagi — zwiększ V/E lub liczbę powtórzeń.',
    )
  }

  const conclusions: string[] = []
  if (fasterId === 'tie') {
    conclusions.push(
      `W tym pomiarze średnie czasy ${algorithmLabels[left.algorithm]} i ${algorithmLabels[right.algorithm]} są równe (${left.mean.toFixed(3)} ms).`,
    )
  } else {
    const fastLabel = algorithmLabels[fasterId]
    const slowLabel = algorithmLabels[slowerId!]
    conclusions.push(
      `W tym konkretnym eksperymencie szybszy był ${fastLabel} `
      + `(średnia ${fasterId === left.algorithm ? left.mean.toFixed(3) : right.mean.toFixed(3)} ms) `
      + `względem ${slowLabel} `
      + `(${slowerId === left.algorithm ? left.mean.toFixed(3) : right.mean.toFixed(3)} ms).`,
    )
    conclusions.push(
      `Różnica średnich: ${diffMs.toFixed(3)} ms`
      + (diffPercent !== null ? ` (ok. ${diffPercent.toFixed(1)}% względem wolniejszego).` : '.'),
    )
    conclusions.push(
      '„Szybszy w tym pomiarze” ≠ „lepszy uniwersalnie” — uwzględnij poprawność wyniku, ograniczenia wag i rodzaj problemu.',
    )
  }

  if (options?.distanceAgreement) {
    conclusions.push(options.distanceAgreement.message)
  }

  // When to choose which (short, grounded tips)
  if (left.algorithm === 'dijkstra' || right.algorithm === 'dijkstra') {
    conclusions.push('Dijkstra (wersja z kopcem w benchmarku) jest typowym wyborem przy wagach nieujemnych.')
  }
  if (left.algorithm === 'bellman' || right.algorithm === 'bellman') {
    conclusions.push('Bellman–Ford wybieraj, gdy dopuszczasz wagi ujemne lub potrzebujesz wykrycia ujemnego cyklu.')
  }
  if (left.algorithm === 'bfs' || right.algorithm === 'bfs') {
    conclusions.push('BFS: najkrótsza droga w sensie liczby krawędzi (graf nieważony / jednostkowe wagi).')
  }
  if (left.algorithm === 'dfs' || right.algorithm === 'dfs') {
    conclusions.push('DFS: eksploracja struktury osiągalności — nie używaj go jako zamiennika najkrótszej ścieżki.')
  }

  return {
    left,
    right,
    fasterId,
    slowerId,
    diffMs,
    diffPercent,
    unstable,
    sameInput,
    warnings,
    conclusions,
    complexityLeft: benchComplexity(left.algorithm),
    complexityRight: benchComplexity(right.algorithm),
    distanceAgreement: options?.distanceAgreement,
  }
}
