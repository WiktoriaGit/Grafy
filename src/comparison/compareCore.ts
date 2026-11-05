import {
  distanceFromMap,
  formatDistance,
  pathFromParents,
  runAlgorithm,
  type Algorithm,
  type Graph,
  type Run,
  type Step,
} from '../algorithms/graphAlgorithms'
import { calculateMST, type MSTAlgorithm, type MSTResult, type MSTStep } from '../algorithms/mstAlgorithms'
import { validateGraphForAlgorithm, type ValidationResult } from '../workspace/validateAlgorithm'

export type ComparisonAlgoId = Algorithm | MSTAlgorithm

export type AlgoCategory = 'search' | 'shortest' | 'mst'

export type ComparisonWarning = {
  level: 'info' | 'caution'
  title: string
  message: string
}

export type ComparisonMetrics = {
  vertices: number
  edges: number
  visitedVertices: number
  examinedEdges: number
  animationSteps: number
  operations: number
  durationMs: number
  resultKind: string
  resultText: string
}

export type PathSideResult = {
  kind: 'path'
  algorithm: Algorithm
  run: Run
  metrics: ComparisonMetrics
}

export type MstSideResult = {
  kind: 'mst'
  algorithm: MSTAlgorithm
  result: MSTResult
  metrics: ComparisonMetrics
}

export type SideResult = PathSideResult | MstSideResult

export type ComparisonRun = {
  left: SideResult
  right: SideResult
  graphFingerprint: string
  warnings: ComparisonWarning[]
  observations: string[]
}

export const COMPARISON_ALGO_NAMES: Record<ComparisonAlgoId, string> = {
  bfs: 'BFS',
  dfs: 'DFS',
  dijkstra: 'Dijkstra',
  bellman: 'Bellman–Ford',
  prim: 'Prim',
  kruskal: 'Kruskal',
}

export function isMstAlgorithm(algorithm: ComparisonAlgoId): algorithm is MSTAlgorithm {
  return algorithm === 'prim' || algorithm === 'kruskal'
}

export function isPathAlgorithm(algorithm: ComparisonAlgoId): algorithm is Algorithm {
  return !isMstAlgorithm(algorithm)
}

export function categoryOf(algorithm: ComparisonAlgoId): AlgoCategory {
  if (algorithm === 'bfs' || algorithm === 'dfs') return 'search'
  if (algorithm === 'prim' || algorithm === 'kruskal') return 'mst'
  return 'shortest'
}

export function fingerprintGraph(graph: Graph): string {
  const nodes = [...graph.vertices].sort().join(',')
  const edges = graph.links
    .map(link => `${link.source}>${link.target}:${link.weight}`)
    .sort()
    .join('|')
  return `${graph.directed ? 'D' : 'U'}|${nodes}|${edges}`
}

export function cloneGraph(graph: Graph): Graph {
  return {
    directed: graph.directed,
    vertices: [...graph.vertices],
    links: graph.links.map(link => ({ ...link })),
  }
}

export function validateComparisonAlgorithm(
  graph: Graph,
  algorithm: ComparisonAlgoId,
  start: string,
  end?: string,
): ValidationResult {
  if (isMstAlgorithm(algorithm)) {
    const messages: string[] = []
    if (graph.vertices.length === 0) {
      return {
        ok: false,
        title: 'Graf jest pusty',
        messages: ['Dodaj przynajmniej jeden wierzchołek, zanim porównasz algorytmy MST.'],
      }
    }
    if (graph.directed) {
      return {
        ok: false,
        title: 'MST wymaga grafu nieskierowanego',
        messages: [
          'Prim i Kruskal budują minimalne drzewo rozpinające wyłącznie na grafach nieskierowanych.',
          'Zmień typ grafu w edytorze na nieskierowany albo wybierz inną parę algorytmów.',
        ],
      }
    }
    if (start && !graph.vertices.includes(start)) {
      return {
        ok: false,
        title: 'Nieprawidłowy wierzchołek startowy',
        messages: ['Dla Prima wybierz wierzchołek początkowy należący do grafu.'],
      }
    }
    messages.push('Prim i Kruskal porównujemy po strukturze MST (wybrane krawędzie i łączna waga), nie po kolejności przeszukiwania ścieżki.')
    if (graph.links.length === 0) {
      messages.push('Graf nie ma krawędzi — wynik MST będzie pustym lasem.')
    }
    return { ok: true, title: 'Graf jest gotowy do porównania MST', messages }
  }

  return validateGraphForAlgorithm(graph, algorithm, start, end)
}

export function buildPairWarnings(left: ComparisonAlgoId, right: ComparisonAlgoId): ComparisonWarning[] {
  const warnings: ComparisonWarning[] = []
  const leftCat = categoryOf(left)
  const rightCat = categoryOf(right)

  if (left === right) {
    warnings.push({
      level: 'info',
      title: 'Ta sama metoda po obu stronach',
      message: 'Porównujesz dwa przebiegi tego samego algorytmu. Różnice w czasie mogą wynikać wyłącznie ze zmienności pomiaru, a nie z innej strategii.',
    })
  }

  if (leftCat !== rightCat) {
    warnings.push({
      level: 'caution',
      title: 'Algorytmy mają różne cele',
      message:
        `${COMPARISON_ALGO_NAMES[left]} (${labelCategory(leftCat)}) oraz ${COMPARISON_ALGO_NAMES[right]} (${labelCategory(rightCat)}) rozwiązują inne problemy. ` +
        'Możesz porównywać przebieg operacji i metryki eksploracji, ale nie należy bezpośrednio zestawiać ich wyników końcowych jako „lepszy / gorszy”.',
    })
  }

  const involvesSearch = leftCat === 'search' || rightCat === 'search'
  const involvesShortest = leftCat === 'shortest' || rightCat === 'shortest'
  if (involvesSearch && involvesShortest) {
    warnings.push({
      level: 'caution',
      title: 'BFS/DFS ≠ najkrótsza ścieżka ważona',
      message:
        'BFS i DFS nie są równoważne Dijkstrze ani Bellmanowi–Fordowi na grafach ważonych. ' +
        'BFS minimalizuje liczbę krawędzi (przy jednakowych kosztach), a DFS nie gwarantuje najkrótszej ścieżki. ' +
        'Dijkstra i Bellman–Ford minimalizują sumę wag.',
    })
  }

  if ((leftCat === 'mst' || rightCat === 'mst') && (involvesSearch || involvesShortest)) {
    warnings.push({
      level: 'caution',
      title: 'MST vs przeszukiwanie / ścieżki',
      message:
        'Minimalne drzewo rozpinające łączy wszystkie wierzchołki przy minimalnej sumie wag krawędzi. ' +
        'To inny problem niż kolejność odwiedzin (BFS/DFS) czy najkrótsza ścieżka między parą wierzchołków.',
    })
  }

  if (leftCat === 'search' && rightCat === 'search' && left !== right) {
    warnings.push({
      level: 'info',
      title: 'Porównanie kolejności przeszukiwania',
      message: 'BFS eksploruje warstwami (kolejka FIFO), DFS wchodzi w głąb (stos LIFO). Obserwuj różnice w kolejności odwiedzin na tym samym grafie.',
    })
  }

  if (leftCat === 'shortest' && rightCat === 'shortest' && left !== right) {
    warnings.push({
      level: 'info',
      title: 'Porównanie najkrótszych ścieżek',
      message:
        'Przy wagach nieujemnych Dijkstra i Bellman–Ford powinny dać ten sam koszt ścieżki. ' +
        'Różnią się strategią relaksacji i zachowaniem przy wagach ujemnych (Dijkstra ich nie dopuszcza).',
    })
  }

  if (leftCat === 'mst' && rightCat === 'mst' && left !== right) {
    warnings.push({
      level: 'info',
      title: 'Porównanie MST',
      message:
        'Prim rozrasta drzewo z wybranego wierzchołka, Kruskal łączy komponenty według rosnących wag. ' +
        'Przy spójnym grafie łączna waga MST powinna być identyczna; kolejność wyboru krawędzi może się różnić.',
    })
  }

  return warnings
}

function labelCategory(category: AlgoCategory): string {
  if (category === 'search') return 'przeszukiwanie grafu'
  if (category === 'mst') return 'minimalne drzewo rozpinające'
  return 'najkrótsze ścieżki'
}

export function buildObservations(left: SideResult, right: SideResult): string[] {
  const notes: string[] = []
  const leftName = COMPARISON_ALGO_NAMES[left.algorithm]
  const rightName = COMPARISON_ALGO_NAMES[right.algorithm]

  notes.push(
    `${leftName} wykonał ${left.metrics.animationSteps} kroków animacji i ${left.metrics.operations} operacji wewnętrznych; ` +
      `${rightName}: ${right.metrics.animationSteps} kroków i ${right.metrics.operations} operacji.`,
  )

  if (left.kind === 'path' && right.kind === 'path') {
    notes.push(
      `Kolejność odwiedzin — ${leftName}: ${left.run.order.join(' → ') || '—'}; ${rightName}: ${right.run.order.join(' → ') || '—'}.`,
    )
    if (categoryOf(left.algorithm) === 'shortest' && categoryOf(right.algorithm) === 'shortest') {
      const leftDist = left.metrics.resultText
      const rightDist = right.metrics.resultText
      if (leftDist === rightDist) {
        notes.push(`Oba algorytmy wyznaczyły ten sam wynik ścieżki/kosztu: ${leftDist}.`)
      } else {
        notes.push(`Wyniki ścieżek różnią się (${leftName}: ${leftDist}; ${rightName}: ${rightDist}) — sprawdź wagi, skierowanie i osiągalność.`)
      }
    }
    if (categoryOf(left.algorithm) === 'search' && categoryOf(right.algorithm) === 'search') {
      const sameOrder = left.run.order.join('|') === right.run.order.join('|')
      notes.push(
        sameOrder
          ? 'Na tym grafie kolejność odwiedzin BFS i DFS zbiegła się (to wyjątek zależny od topologii).'
          : 'Kolejności odwiedzin różnią się — to oczekiwane przy FIFO vs LIFO.',
      )
    }
  }

  if (left.kind === 'mst' && right.kind === 'mst') {
    if (left.result.totalWeight === right.result.totalWeight) {
      notes.push(`Oba algorytmy wyznaczyły tę samą łączną wagę MST/lasu: ${left.result.totalWeight}.`)
    } else {
      notes.push(
        `Łączne wagi różnią się (${leftName}: ${left.result.totalWeight}, ${rightName}: ${right.result.totalWeight}) — przy niespójnym grafie możliwy jest inny las.`,
      )
    }
  }

  notes.push(
    'Czas obliczeń pochodzi z `performance.now()` wokół samego algorytmu i nie obejmuje pauz animacji. ' +
      'Przy bardzo krótkich pomiarach nie ogłaszamy zwycięzcy na podstawie jednego uruchomienia — wynik może się wahać.',
  )

  return notes
}

function metricsFromPath(graph: Graph, algorithm: Algorithm, run: Run, end: string): ComparisonMetrics {
  const path = algorithm === 'bellman' ? run.path : pathFromParents(run.start, end, run.parents)
  const distance = algorithm === 'dijkstra' || algorithm === 'bellman'
    ? distanceFromMap(end, run.distances)
    : path.length ? path.length - 1 : null

  let resultKind = 'Ścieżka / koszt'
  let resultText = '—'
  if (algorithm === 'bfs' || algorithm === 'dfs') {
    resultKind = 'Kolejność odwiedzin'
    resultText = run.order.length ? run.order.join(' → ') : '—'
  } else if (path.length) {
    resultText = `${path.join(' → ')} (koszt ${formatDistance(distance)})`
  } else if (run.error) {
    resultText = run.error
  }

  return {
    vertices: graph.vertices.length,
    edges: graph.links.length,
    visitedVertices: run.reachable.length,
    examinedEdges: run.examinedEdges,
    animationSteps: run.steps.length,
    operations: run.operations,
    durationMs: run.durationMs,
    resultKind,
    resultText,
  }
}

function metricsFromMst(graph: Graph, result: MSTResult): ComparisonMetrics {
  const edgeList = result.selected.map(e => `${e.source}–${e.target}(${e.weight})`).join(', ')
  return {
    vertices: graph.vertices.length,
    edges: graph.links.length,
    visitedVertices: new Set(result.steps.at(-1)?.visited ?? []).size,
    examinedEdges: result.operations,
    animationSteps: result.steps.length,
    operations: result.operations,
    durationMs: result.durationMs,
    resultKind: result.connected ? 'MST (waga)' : 'Las rozpinający (waga)',
    resultText: `${result.totalWeight}${edgeList ? ` · ${edgeList}` : ''}`,
  }
}

export function runSide(
  graph: Graph,
  algorithm: ComparisonAlgoId,
  start: string,
  end: string,
): SideResult {
  const input = cloneGraph(graph)
  if (isMstAlgorithm(algorithm)) {
    const result = calculateMST(input, algorithm, start)
    return {
      kind: 'mst',
      algorithm,
      result,
      metrics: metricsFromMst(input, result),
    }
  }
  const run = runAlgorithm(input, algorithm, start, end)
  return {
    kind: 'path',
    algorithm,
    run,
    metrics: metricsFromPath(input, algorithm, run, end),
  }
}

export function runComparison(
  graph: Graph,
  leftAlgo: ComparisonAlgoId,
  rightAlgo: ComparisonAlgoId,
  start: string,
  end: string,
): ComparisonRun {
  const leftValidation = validateComparisonAlgorithm(graph, leftAlgo, start, end)
  if (!leftValidation.ok) {
    throw new Error(`${COMPARISON_ALGO_NAMES[leftAlgo]}: ${leftValidation.title}. ${leftValidation.messages[0] ?? ''}`)
  }
  const rightValidation = validateComparisonAlgorithm(graph, rightAlgo, start, end)
  if (!rightValidation.ok) {
    throw new Error(`${COMPARISON_ALGO_NAMES[rightAlgo]}: ${rightValidation.title}. ${rightValidation.messages[0] ?? ''}`)
  }

  const fingerprint = fingerprintGraph(graph)
  const left = runSide(graph, leftAlgo, start, end)
  const right = runSide(graph, rightAlgo, start, end)

  if (fingerprintGraph(graph) !== fingerprint) {
    throw new Error('Porównanie nie może modyfikować grafu wejściowego.')
  }

  return {
    left,
    right,
    graphFingerprint: fingerprint,
    warnings: buildPairWarnings(leftAlgo, rightAlgo),
    observations: buildObservations(left, right),
  }
}

export function pathStepAt(side: SideResult | null, index: number): Step | null {
  if (!side || side.kind !== 'path') return null
  return side.run.steps[index] ?? null
}

export function mstStepAt(side: SideResult | null, index: number): MSTStep | null {
  if (!side || side.kind !== 'mst') return null
  return side.result.steps[index] ?? null
}

export function sideStepCount(side: SideResult | null): number {
  if (!side) return 0
  return side.kind === 'path' ? side.run.steps.length : side.result.steps.length
}

export function sideStepMessage(side: SideResult | null, index: number): { title: string; message: string } {
  if (!side) return { title: 'Brak przebiegu', message: 'Uruchom porównanie, aby zobaczyć operacje.' }
  if (side.kind === 'path') {
    const step = side.run.steps[index]
    return {
      title: step?.title ?? COMPARISON_ALGO_NAMES[side.algorithm],
      message: step?.message ?? 'Brak opisu kroku.',
    }
  }
  const step = side.result.steps[index]
  return {
    title: COMPARISON_ALGO_NAMES[side.algorithm],
    message: step?.message ?? 'Brak opisu kroku.',
  }
}

export const METRIC_EXPLANATIONS: Array<{ key: keyof ComparisonMetrics | 'timingNote'; label: string; explanation: string }> = [
  { key: 'vertices', label: 'Liczba wierzchołków', explanation: 'Rozmiar wejścia — identyczny dla obu stron porównania.' },
  { key: 'edges', label: 'Liczba krawędzi', explanation: 'Liczba połączeń w grafie wejściowym (ta sama dla obu przebiegów).' },
  { key: 'visitedVertices', label: 'Odwiedzone wierzchołki', explanation: 'Ile wierzchołków algorytm oznaczył jako osiągnięte / włączone do wyniku.' },
  { key: 'examinedEdges', label: 'Analizowane krawędzie', explanation: 'Ile razy algorytm przeglądał krawędzie (dla MST przybliżone przez licznik operacji).' },
  { key: 'animationSteps', label: 'Kroki animacji', explanation: 'Liczba stanów zapisanych do prezentacji — nie jest miarą złożoności asymptotycznej.' },
  { key: 'operations', label: 'Operacje algorytmu', explanation: 'Licznik wewnętrznych operacji zaimplementowany w silniku (np. ekstrakcje, unie).' },
  { key: 'durationMs', label: 'Czas obliczeń (ms)', explanation: 'Czas czystego wykonania algorytmu. Animacja go nie wydłuża.' },
  { key: 'timingNote', label: 'Uwaga o czasie', explanation: 'Przy bardzo krótkich pomiarach nie ogłaszamy zwycięzcy na podstawie jednego uruchomienia — występuje zmienność.' },
]
