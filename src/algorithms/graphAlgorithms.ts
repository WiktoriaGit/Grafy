export type Vertex = string
export type Link = { source: string; target: string; weight: number }
export type Graph = { vertices: Vertex[]; links: Link[]; directed: boolean }
export type StructureKind = 'queue' | 'stack' | 'priority' | 'none'
export type DistanceMap = Record<string, number | null>
export type ParentMap = Record<string, string | null>

export type StepEvent =
  | 'init'
  | 'extract'
  | 'visit'
  | 'examine'
  | 'discover'
  | 'select'
  | 'relax'
  | 'skip'
  | 'done'

export type Step = {
  current: string | null
  visited: string[]
  frontier: string[]
  structureKind: StructureKind
  title: string
  message: string
  detail: string
  reason?: string
  activeEdge?: string
  event: StepEvent
  pseudoLine: number
  examinedEdges: number
  distances?: DistanceMap
  distanceUpdates?: Array<{ vertex: string; previous: number | null; next: number | null }>
  parents?: ParentMap
}

export type Run = {
  steps: Step[]
  order: string[]
  path: string[]
  reachable: string[]
  distance: number | null
  operations: number
  examinedEdges: number
  durationMs: number
  structureKind: StructureKind
  start: string
  parents: ParentMap
  distances: DistanceMap
  error?: string
}

export type Algorithm = 'bfs' | 'dfs' | 'dijkstra' | 'bellman'

export function formatDistance(value: number | null | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '∞'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function snapshotDistances(dist: Map<string, number>, vertices: string[]): DistanceMap {
  const out: DistanceMap = {}
  for (const v of vertices) {
    const value = dist.get(v)
    out[v] = value !== undefined && Number.isFinite(value) ? value : null
  }
  return out
}

export function snapshotParents(parent: Map<string, string>, vertices: string[]): ParentMap {
  const out: ParentMap = {}
  for (const v of vertices) out[v] = parent.get(v) ?? null
  return out
}

export function reconstructPath(start: string, end: string, parent: Map<string, string> | ParentMap): string[] {
  if (start === end) return [start]
  const lookup = (v: string): string | undefined => {
    if (parent instanceof Map) return parent.get(v)
    const value = parent[v]
    return value == null ? undefined : value
  }
  if (lookup(end) === undefined) return []

  const path: string[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = end
  while (cursor !== undefined && !seen.has(cursor)) {
    path.unshift(cursor)
    seen.add(cursor)
    if (cursor === start) break
    cursor = lookup(cursor)
  }
  return path[0] === start ? path : []
}

export function pathFromParents(start: string, end: string, parents: ParentMap): string[] {
  return reconstructPath(start, end, parents)
}

export function distanceFromMap(end: string, distances: DistanceMap): number | null {
  const value = distances[end]
  return value === undefined || value === null || !Number.isFinite(value) ? null : value
}

export function fromEditor(raw: unknown): Graph {
  if (!raw || typeof raw !== 'object') throw new Error('Nieprawidłowe dane grafu')
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges) || typeof obj.directed !== 'boolean') {
    throw new Error('Nieprawidłowy format grafu')
  }
  if (obj.nodes.length > 300 || obj.edges.length > 3000) throw new Error('Graf jest zbyt duży dla wizualizacji')
  const vertices = obj.nodes.map((n: unknown) => {
    if (!n || typeof n !== 'object' || typeof (n as { id?: unknown }).id !== 'string') throw new Error('Błędny wierzchołek')
    return (n as { id: string }).id
  })
  if (new Set(vertices).size !== vertices.length) throw new Error('Powtarzające się identyfikatory wierzchołków')
  const ids = new Set(vertices)
  const links = obj.edges.map((e: unknown) => {
    if (!e || typeof e !== 'object') throw new Error('Błędna krawędź')
    const item = e as Record<string, unknown>
    const source = String(item.source ?? '')
    const target = String(item.target ?? '')
    const weight = Number(item.weight ?? item.label ?? 1)
    if (!ids.has(source) || !ids.has(target) || !Number.isFinite(weight)) {
      throw new Error('Nieprawidłowe końce lub waga krawędzi')
    }
    return { source, target, weight }
  })
  return { vertices, links, directed: obj.directed }
}

function buildAdjacency(graph: Graph) {
  const adjacency = new Map<string, { to: string; weight: number }[]>(graph.vertices.map(v => [v, []]))
  for (const e of graph.links) {
    adjacency.get(e.source)?.push({ to: e.target, weight: e.weight })
    if (!graph.directed) adjacency.get(e.target)?.push({ to: e.source, weight: e.weight })
  }
  return adjacency
}

function emptyDistances(vertices: string[]): DistanceMap {
  const out: DistanceMap = {}
  for (const v of vertices) out[v] = null
  return out
}

function runSearch(
  graph: Graph,
  algorithm: 'bfs' | 'dfs',
  start: string,
  end: string,
): Omit<Run, 'durationMs'> {
  const adjacency = buildAdjacency(graph)
  const steps: Step[] = []
  const order: string[] = []
  const visited = new Set<string>()
  const parent = new Map<string, string>()
  const discovered = new Set<string>([start])
  const frontier = [start]
  const structureKind: StructureKind = algorithm === 'bfs' ? 'queue' : 'stack'
  let operations = 0
  let examinedEdges = 0

  const capture = ( partial: Omit<Step, 'visited' | 'frontier' | 'structureKind' | 'examinedEdges' | 'parents'> & {
    examinedEdges?: number
  }) => {
    steps.push({
      visited: [...visited],
      frontier: [...frontier],
      structureKind,
      examinedEdges,
      parents: snapshotParents(parent, graph.vertices),
      ...partial,
    })
  }

  const label = algorithm === 'bfs' ? 'BFS' : 'DFS'
  const structureGenitive = algorithm === 'bfs' ? 'kolejki' : 'stosu'
  const extractLine = 3
  const visitLine = 4
  const edgeLine = 5
  const updateLine = 6

  capture({
    current: start,
    event: 'init',
    pseudoLine: 1,
    title: `Inicjalizacja ${label}`,
    message: `Wierzchołek startowy ${start} trafia do ${structureGenitive}.`,
    detail:
      algorithm === 'bfs'
        ? `BFS przeszukuje graf warstwami. ${start} jest jedynym odkrytym wierzchołkiem i stoi na początku kolejki FIFO. Algorytm będzie kontynuowany, aż kolejka się opróżni — dzięki temu odwiedzimy wszystkie osiągalne wierzchołki, nie tylko cel.`
        : `DFS wchodzi jak najgłębiej w graf. ${start} trafia na stos LIFO. Algorytm działa do wyczerpania stosu, więc eksploruje cały zbiór osiągalny ze startu.`,
    reason: `${start} jest źródłem przeszukiwania.`,
  })

  while (frontier.length) {
    const v = algorithm === 'bfs' ? frontier.shift()! : frontier.pop()!
    capture({
      current: v,
      event: 'extract',
      pseudoLine: extractLine,
      title: algorithm === 'bfs' ? `Pobranie z kolejki: ${v}` : `Pobranie ze stosu: ${v}`,
      message:
        algorithm === 'bfs'
          ? `Z początku kolejki (FIFO) pobrano wierzchołek ${v}.`
          : `Ze szczytu stosu (LIFO) pobrano wierzchołek ${v}.`,
      detail:
        algorithm === 'bfs'
          ? `FIFO gwarantuje, że najpierw obsługujemy wierzchołki odkryte wcześniej — stąd BFS znajduje ścieżkę o najmniejszej liczbie krawędzi.`
          : `LIFO sprawia, że kontynuujemy gałąź ostatnio odkrytą — typowe zachowanie przeszukiwania w głąb.`,
    })

    if (visited.has(v)) {
      capture({
        current: v,
        event: 'skip',
        pseudoLine: visitLine,
        title: `Pominięcie ${v}`,
        message: `Wierzchołek ${v} był już odwiedzony.`,
        detail: `Ten wpis w ${structureGenitive} jest zbędny, więc nie przetwarzamy sąsiadów ponownie.`,
        reason: 'Wierzchołek należy już do zbioru odwiedzonych.',
      })
      continue
    }

    visited.add(v)
    order.push(v)
    capture({
      current: v,
      event: 'visit',
      pseudoLine: visitLine,
      title: `Odwiedzenie ${v}`,
      message: `Oznaczono ${v} jako odwiedzony.`,
      detail: `Wierzchołek ${v} zostaje trwale oznaczony. Kolejność odwiedzin: ${order.join(' → ')}. Następnie sprawdzimy wszystkie wychodzące krawędzie.`,
    })

    const neighbors = adjacency.get(v) ?? []
    const sequence = algorithm === 'dfs' ? [...neighbors].reverse() : neighbors

    for (const { to } of sequence) {
      operations++
      examinedEdges++
      const edgeKey = `${v}|${to}`

      if (discovered.has(to)) {
        capture({
          current: v,
          event: 'skip',
          pseudoLine: edgeLine,
          activeEdge: edgeKey,
          title: `Krawędź ${v} → ${to}: bez zmian`,
          message: `Analiza ${v} → ${to}: wierzchołek ${to} jest już odkryty.`,
          detail: `Algorytm ogląda krawędź ${v} → ${to}, ale nie modyfikuje ${structureGenitive}, bo ${to} został już wcześniej odkryty (bezpośrednio lub pośrednio ze startu).`,
          reason: `${to} należy już do zbioru odkrytych — ponowne wstawienie utworzyłoby zbędną pracę i mogłoby zniekształcić drzewo przeszukiwania.`,
        })
        continue
      }

      discovered.add(to)
      parent.set(to, v)
      frontier.push(to)
      capture({
        current: v,
        event: 'discover',
        pseudoLine: updateLine,
        activeEdge: edgeKey,
        title: `Odkrycie ${to} przez ${v}`,
        message:
          algorithm === 'bfs'
            ? `Krawędź ${v} → ${to}: dodano ${to} na koniec kolejki.`
            : `Krawędź ${v} → ${to}: dodano ${to} na szczyt stosu.`,
        detail:
          algorithm === 'bfs'
            ? `${to} nie był jeszcze odkryty, więc zapamiętujemy poprzednika π(${to}) = ${v} i wstawiamy ${to} na koniec kolejki. Dzięki temu zostanie obsłużony dopiero po wcześniejszych warstwach.`
            : `${to} nie był jeszcze odkryty, więc ustawiamy π(${to}) = ${v} i wstawiamy ${to} na szczyt stosu, aby kontynuować eksplorację w głąb tej gałęzi.`,
        reason: `${to} nie należał do zbioru odkrytych — to pierwsza ścieżka, którą algorytm go osiągnął.`,
      })
    }
  }

  const path = reconstructPath(start, end, parent)
  const reachable = [...order]
  const distance = path.length ? path.length - 1 : null
  const parents = snapshotParents(parent, graph.vertices)

  capture({
    current: null,
    event: 'done',
    pseudoLine: 7,
    title: `Zakończenie ${label}`,
    message: path.length
      ? `Osiągnięto wszystkie wierzchołki osiągalne. Ścieżka do ${end}: ${path.join(' → ')}.`
      : `Osiągnięto wszystkie wierzchołki osiągalne. Brak ścieżki do ${end}.`,
    detail: path.length
      ? `Struktura ${structureGenitive} jest pusta, więc eksploracja jest kompletna. Zbiór osiągalny: ${reachable.join(', ')}. Do celu ${end} prowadzi ścieżka o ${distance} krawędziach, odtworzona z tablicy poprzedników.`
      : `Struktura ${structureGenitive} jest pusta. Zbiór osiągalny ze startu ${start}: ${reachable.join(', ') || 'pusty'}. Wierzchołek ${end} nie należy do tego zbioru.`,
  })

  return {
    steps,
    order,
    path,
    reachable,
    distance,
    operations,
    examinedEdges,
    structureKind,
    start,
    parents,
    distances: emptyDistances(graph.vertices),
  }
}

function runDijkstra(graph: Graph, start: string, end: string): Omit<Run, 'durationMs'> {
  if (graph.links.some(e => e.weight < 0)) throw new Error('Dijkstra nie obsługuje ujemnych wag')
  const adjacency = buildAdjacency(graph)
  const steps: Step[] = []
  const order: string[] = []
  const visited = new Set<string>()
  const parent = new Map<string, string>()
  const dist = new Map(graph.vertices.map(v => [v, Infinity]))
  dist.set(start, 0)
  let operations = 0
  let examinedEdges = 0
  const structureKind: StructureKind = 'priority'

  const unsettledFrontier = () =>
    graph.vertices
      .filter(v => !visited.has(v) && Number.isFinite(dist.get(v)!))
      .sort((a, b) => dist.get(a)! - dist.get(b)! || a.localeCompare(b))

  const capture = (
    partial: Omit<Step, 'visited' | 'frontier' | 'structureKind' | 'examinedEdges' | 'parents' | 'distances'> & {
      distanceUpdates?: Step['distanceUpdates']
    },
  ) => {
    steps.push({
      visited: [...visited],
      frontier: unsettledFrontier(),
      structureKind,
      examinedEdges,
      distances: snapshotDistances(dist, graph.vertices),
      parents: snapshotParents(parent, graph.vertices),
      ...partial,
    })
  }

  capture({
    current: start,
    event: 'init',
    pseudoLine: 1,
    title: 'Inicjalizacja Dijkstry',
    message: `Ustawiono d(${start}) = 0, pozostałe odległości = ∞.`,
    detail: `Dijkstra wyznacza najkrótsze ścieżki wagowe od ${start} do wszystkich osiągalnych wierzchołków. Na początku tylko start ma skończoną odległość. Algorytm nie kończy się po znalezieniu jednego celu — domyka pełną eksplorację.`,
    reason: `Zaczynamy od źródła ${start}: odległość do siebie wynosi 0.`,
  })

  while (true) {
    let chosen: string | undefined
    let best = Infinity
    for (const candidate of graph.vertices) {
      operations++
      if (!visited.has(candidate) && dist.get(candidate)! < best) {
        best = dist.get(candidate)!
        chosen = candidate
      }
    }
    if (!chosen || !Number.isFinite(best)) break

    visited.add(chosen)
    order.push(chosen)
    capture({
      current: chosen,
      event: 'select',
      pseudoLine: 3,
      title: `Ustalenie odległości ${chosen}`,
      message: `Wybrano ${chosen} z najmniejszą nieustaloną odległością (${formatDistance(best)}).`,
      detail: `Spośród wierzchołków jeszcze nieustalonych ${chosen} ma najmniejsze d(·). W algorytmie Dijkstry ta wartość staje się ostateczna — żadna późniejsza ścieżka z nieujemnymi wagami nie może jej poprawić.`,
      reason: 'Własność optymalnego podstruktury dla nieujemnych wag.',
    })

    for (const { to, weight } of adjacency.get(chosen) ?? []) {
      operations++
      examinedEdges++
      const edgeKey = `${chosen}|${to}`
      const via = best + weight
      const previous = Number.isFinite(dist.get(to)!) ? dist.get(to)! : null

      if (visited.has(to)) {
        capture({
          current: chosen,
          event: 'skip',
          pseudoLine: 4,
          activeEdge: edgeKey,
          title: `Krawędź ${chosen} → ${to}: pominięta`,
          message: `Cel ${to} ma już ustaloną odległość.`,
          detail: `Analizujemy krawędź ${chosen} → ${to} o wadze ${weight}. Kandydat przez ${chosen} wynosi ${formatDistance(via)}, ale ${to} został już sfinalizowany wcześniej.`,
          reason: `Ponieważ d(${to}) jest ostateczne, relaksacja nie może już zmienić wyniku.`,
        })
        continue
      }

      if (via < (dist.get(to) ?? Infinity)) {
        dist.set(to, via)
        parent.set(to, chosen)
        capture({
          current: chosen,
          event: 'relax',
          pseudoLine: 5,
          activeEdge: edgeKey,
          title: `Relaksacja ${chosen} → ${to}`,
          message: `d(${to}): ${formatDistance(previous)} → ${formatDistance(via)}. π(${to}) = ${chosen}.`,
          detail: `Ścieżka ${chosen} → ${to} poprawia dotychczasowy oszacowanie. Nowa odległość to d(${chosen}) + w(${chosen},${to}) = ${formatDistance(best)} + ${weight} = ${formatDistance(via)}. Poprzednik zostaje zaktualizowany, aby później odtworzyć najkrótszą ścieżkę.`,
          reason: `${formatDistance(via)} < ${formatDistance(previous)}, więc aktualizacja jest konieczna.`,
          distanceUpdates: [{ vertex: to, previous, next: via }],
        })
      } else {
        capture({
          current: chosen,
          event: 'skip',
          pseudoLine: 6,
          activeEdge: edgeKey,
          title: `Krawędź ${chosen} → ${to}: bez poprawy`,
          message: `Kandydat ${formatDistance(via)} nie poprawia d(${to}) = ${formatDistance(previous)}.`,
          detail: `Algorytm sprawdza krawędź ${chosen} → ${to} (waga ${weight}). Wyliczony koszt ${formatDistance(via)} nie jest lepszy od bieżącego oszacowania ${formatDistance(previous)}, więc tablica odległości i poprzedników pozostaje bez zmian.`,
          reason: `${formatDistance(via)} ≥ ${formatDistance(previous)} — brak relaksacji.`,
        })
      }
    }
  }

  const path = reconstructPath(start, end, parent)
  const reachable = [...order]
  const distance = Number.isFinite(dist.get(end)!) ? dist.get(end)! : null
  const parents = snapshotParents(parent, graph.vertices)
  const distances = snapshotDistances(dist, graph.vertices)

  capture({
    current: null,
    event: 'done',
    pseudoLine: 7,
    title: 'Zakończenie Dijkstry',
    message: path.length
      ? `Pełna eksploracja zakończona. Najkrótsza ścieżka do ${end}: ${path.join(' → ')} (koszt ${formatDistance(distance)}).`
      : `Pełna eksploracja zakończona. Brak ścieżki do ${end}.`,
    detail: `Nie pozostały nieustalone wierzchołki o skończonej odległości. Zbiór osiągalny: ${reachable.join(', ') || 'pusty'}. Możesz teraz wybrać inny osiągalny cel i odczytać najkrótszą ścieżkę z tablicy poprzedników — bez ponownego uruchamiania algorytmu.`,
  })

  return {
    steps,
    order,
    path,
    reachable,
    distance,
    operations,
    examinedEdges,
    structureKind,
    start,
    parents,
    distances,
  }
}

function runBellmanFord(graph: Graph, start: string, end: string): Omit<Run, 'durationMs'> {
  const adjacency = buildAdjacency(graph)
  const steps: Step[] = []
  const order: string[] = []
  const visited = new Set<string>([start])
  const parent = new Map<string, string>()
  const dist = new Map(graph.vertices.map(v => [v, Infinity]))
  dist.set(start, 0)
  let operations = 0
  let examinedEdges = 0
  let error: string | undefined
  const structureKind: StructureKind = 'none'
  const maxPasses = Math.max(graph.vertices.length - 1, 0)

  const reachableNow = () =>
    graph.vertices.filter(v => Number.isFinite(dist.get(v)!))

  const capture = (partial: Omit<Step, 'visited' | 'frontier' | 'structureKind' | 'examinedEdges' | 'distances' | 'parents'> & {
    frontier?: string[]
    examinedEdges?: number
    distances?: DistanceMap
    parents?: ParentMap
  }) => {
    steps.push({
      visited: [...visited],
      structureKind,
      examinedEdges,
      distances: snapshotDistances(dist, graph.vertices),
      parents: snapshotParents(parent, graph.vertices),
      frontier: partial.frontier ?? reachableNow(),
      ...partial,
    })
  }

  capture({
    current: start,
    event: 'init',
    pseudoLine: 1,
    title: 'Inicjalizacja Bellmana–Forda',
    message: `d(${start}) ← 0, pozostałe odległości ← ∞, poprzedniki ← nil.`,
    detail:
      `Bellman–Ford wykonuje do |V|−1 = ${maxPasses} pełnych przejść po wszystkich krawędziach. ` +
      'Każde przejście może poprawić oszacowania odległości poprzez relaksację. Algorytm dopuszcza wagi ujemne, a po głównej pętli sprawdza, czy istnieje osiągalny cykl ujemny.',
    reason: 'Start ma odległość 0, bo ścieżka od siebie do siebie nic nie kosztuje.',
    frontier: [start],
  })

  const arcs = [
    ...graph.links,
    ...(!graph.directed ? graph.links.map(e => ({ source: e.target, target: e.source, weight: e.weight })) : []),
  ]

  for (let pass = 1; pass <= maxPasses; pass++) {
    let changed = false
    capture({
      current: null,
      event: 'visit',
      pseudoLine: 2,
      title: `Iteracja ${pass} z ${maxPasses}`,
      message: `Rozpoczęcie ${pass}. przejścia po wszystkich ${arcs.length} łukach grafu.`,
      detail:
        `W i-tym przebiegu odległości mogą zostać poprawione ścieżkami zawierającymi co najwyżej i krawędzi. ` +
        'Jeśli w całym przejściu nic się nie zmieni, wcześniejsze zakończenie jest bezpieczne.',
      reason: `Dopuszczalna liczba przebiegów wynosi |V|−1 = ${maxPasses}.`,
      frontier: reachableNow(),
    })

    for (const { source, target, weight } of arcs) {
      operations++
      examinedEdges++
      const edgeKey = `${source}|${target}`
      const from = dist.get(source)!
      const previous = dist.get(target)!
      const previousFinite = Number.isFinite(previous) ? previous : null
      const fromFinite = Number.isFinite(from)

      if (!fromFinite) {
        capture({
          current: source,
          event: 'skip',
          pseudoLine: 4,
          activeEdge: edgeKey,
          title: `Krawędź ${source} → ${target}: źródło nieosiągalne`,
          message: `Pominięto relaksację — d(${source}) = ∞, więc nie da się poprawić d(${target}).`,
          detail:
            `Analizujemy krawędź ${source} → ${target} o wadze ${weight}. Dopóki ${source} nie ma skończonej odległości od startu, ` +
            'żadna ścieżka przez tę krawędź nie jest jeszcze znana.',
          reason: `d(${source}) = ∞ — brak sensownego kandydata.`,
          frontier: reachableNow(),
        })
        continue
      }

      const via = from + weight
      if (via < previous) {
        dist.set(target, via)
        parent.set(target, source)
        changed = true
        if (!visited.has(target)) {
          visited.add(target)
          order.push(target)
        }
        if (!visited.has(source) && source !== start) {
          visited.add(source)
          if (!order.includes(source)) order.push(source)
        }
        capture({
          current: target,
          event: 'relax',
          pseudoLine: 3,
          activeEdge: edgeKey,
          title: `Relaksacja ${source} → ${target}`,
          message: `Iteracja ${pass}: d(${target}): ${formatDistance(previousFinite)} → ${formatDistance(via)}. π(${target}) = ${source}.`,
          detail:
            `Ścieżka przez ${source} poprawia oszacowanie: d(${source}) + w(${source},${target}) = ${formatDistance(from)} + ${weight} = ${formatDistance(via)}. ` +
            `Poprzednia wartość d(${target}) wynosiła ${formatDistance(previousFinite)}, więc aktualizujemy tablicę odległości i poprzedników.`,
          reason: `${formatDistance(via)} < ${formatDistance(previousFinite)} — relaksacja jest konieczna.`,
          distanceUpdates: [{ vertex: target, previous: previousFinite, next: via }],
          frontier: reachableNow(),
        })
      } else {
        capture({
          current: source,
          event: 'skip',
          pseudoLine: 4,
          activeEdge: edgeKey,
          title: `Krawędź ${source} → ${target}: bez poprawy`,
          message: `Iteracja ${pass}: kandydat ${formatDistance(via)} nie poprawia d(${target}) = ${formatDistance(previousFinite)}.`,
          detail:
            `Sprawdzamy krawędź ${source} → ${target} (waga ${weight}). Wyliczony koszt ${formatDistance(via)} nie jest lepszy od bieżącego oszacowania ${formatDistance(previousFinite)}, ` +
            'dlatego odległość i poprzednik pozostają bez zmian.',
          reason: `${formatDistance(via)} ≥ ${formatDistance(previousFinite)} — brak relaksacji.`,
          frontier: reachableNow(),
        })
      }
    }

    if (!changed) {
      capture({
        current: null,
        event: 'select',
        pseudoLine: 2,
        title: `Iteracja ${pass}: brak zmian`,
        message: 'Żadna krawędź nie poprawiła odległości — wcześniejsze zakończenie pętli głównej.',
        detail:
          'Gdy pełne przejście nie wykonuje żadnej relaksacji, kolejne iteracje też nic by nie zmieniły (przy braku ujemnych cykli w kolejnym teście).',
        reason: 'Optymalizacja: early-stop po stabilizacji odległości.',
        frontier: reachableNow(),
      })
      break
    }
  }

  const seedNegative = new Set<string>()
  capture({
    current: null,
    event: 'examine',
    pseudoLine: 5,
    title: 'Test ujemnego cyklu',
    message: 'Dodatkowe przejście: czy któraś krawędź nadal poprawia odległość?',
    detail:
      'Jeśli po |V|−1 przebiegach da się jeszcze zrelaksować krawędź, istnieje cykl o ujemnej sumie wag osiągalny ze startu. ' +
      'Wierzchołki, do których taki cykl „dociera”, nie mają dobrze określonych najkrótszych ścieżek.',
    reason: 'To obowiązkowy krok diagnostyczny Bellmana–Forda.',
    frontier: reachableNow(),
  })

  for (const { source, target, weight } of arcs) {
    operations++
    examinedEdges++
    const from = dist.get(source)!
    const previous = dist.get(target)!
    const edgeKey = `${source}|${target}`
    if (Number.isFinite(from) && from + weight < previous) {
      seedNegative.add(target)
      capture({
        current: target,
        event: 'relax',
        pseudoLine: 5,
        activeEdge: edgeKey,
        title: `Ujemny cykl: wciąż da się poprawić ${target}`,
        message: `d(${source}) + ${weight} = ${formatDistance(from + weight)} < d(${target}) = ${formatDistance(Number.isFinite(previous) ? previous : null)}.`,
        detail:
          `Krawędź ${source} → ${target} nadal obniża odległość po |V|−1 iteracjach. To dowód na osiągalny cykl ujemny wpływający na ${target}.`,
        reason: 'Dalsze zmniejszanie odległości byłoby możliwe w nieskończoność.',
        distanceUpdates: [{
          vertex: target,
          previous: Number.isFinite(previous) ? previous : null,
          next: from + weight,
        }],
        frontier: reachableNow(),
      })
    }
  }

  const affected = new Set<string>(seedNegative)
  if (affected.size) {
    const queue = [...affected]
    for (let i = 0; i < queue.length; i++) {
      for (const { to } of adjacency.get(queue[i]) ?? []) {
        if (!affected.has(to)) {
          affected.add(to)
          queue.push(to)
        }
      }
    }
    capture({
      current: null,
      event: 'examine',
      pseudoLine: 5,
      title: 'Propagacja wpływu ujemnego cyklu',
      message: `Wierzchołki dotknięte ujemnym cyklem: ${[...affected].join(', ')}.`,
      detail:
        'Z wierzchołków, których odległość dało się jeszcze poprawić, propagujemy wpływ po krawędziach wychodzących. ' +
        'Jeśli cel należy do tego zbioru, najkrótsza ścieżka do celu nie jest dobrze określona.',
      reason: affected.has(end)
        ? `Cel ${end} jest osiągalny z obszaru ujemnego cyklu — wynik dla ścieżki do ${end} jest nieważny.`
        : `Cel ${end} nie należy do zbioru dotkniętego; lokalny cykl może nie psuć konkretnej ścieżki do ${end}, ale algorytm i tak sygnalizuje problem w grafie.`,
      frontier: [...affected],
    })
    if (affected.has(end)) {
      error = 'Ujemny cykl osiągalny ze startu wpływa na wynik dla celu'
    }
  } else {
    capture({
      current: null,
      event: 'select',
      pseudoLine: 5,
      title: 'Brak ujemnego cyklu',
      message: 'Żadna krawędź nie poprawia już odległości — cykl ujemny nie wpływa na wynik.',
      detail: 'Możemy zaufać tablicy d(·) i π(·) dla wszystkich wierzchołków o skończonej odległości.',
      reason: 'Test V-tego przebiegu nie znalazł dodatkowej relaksacji.',
      frontier: reachableNow(),
    })
  }

  const distances = snapshotDistances(dist, graph.vertices)
  const parents = snapshotParents(parent, graph.vertices)
  const reachable = graph.vertices.filter(v => distances[v] !== null)
  for (const v of reachable) {
    if (!visited.has(v)) visited.add(v)
    if (v !== start && !order.includes(v)) order.push(v)
  }

  const distance = !error && distances[end] !== null ? distances[end] : null
  const path = !error ? reconstructPath(start, end, parent) : []
  const distanceSummary = reachable
    .map(v => `${v}: ${formatDistance(distances[v])}`)
    .join(', ')

  capture({
    current: null,
    event: 'done',
    pseudoLine: 6,
    title: 'Zakończenie Bellmana–Forda',
    message: error
      ? error
      : path.length
        ? `Najkrótsza ścieżka do ${end}: ${path.join(' → ')} (koszt ${formatDistance(distance)}).`
        : `Brak ścieżki do ${end}. Odległości osiągalnych: ${distanceSummary || '—'}.`,
    detail:
      `Odległości końcowe do osiągalnych wierzchołków: ${distanceSummary || 'brak'}. ` +
      (error
        ? 'Z powodu ujemnego cyklu nie prezentujemy wiarygodnej ścieżki do celu.'
        : 'Możesz odczytać ścieżkę z tablicy poprzedników π(·) dla dowolnego osiągalnego wierzchołka.'),
    reason: error
      ? 'Ujemny cykl unieważnia klasyczne pojęcie najkrótszej ścieżki dla dotkniętych wierzchołków.'
      : 'Po stabilizacji odległości wynik jest kompletny.',
    frontier: reachable,
  })

  return {
    steps,
    order: order.length ? order : reachable.filter(v => v !== start),
    path,
    reachable,
    distance,
    operations,
    examinedEdges,
    structureKind,
    start,
    parents,
    distances,
    error,
  }
}

export function runAlgorithm(graph: Graph, algorithm: Algorithm, start: string, end: string): Run {
  const began = performance.now()
  if (!graph.vertices.includes(start) || !graph.vertices.includes(end)) {
    throw new Error('Wybierz poprawne wierzchołki')
  }

  const partial =
    algorithm === 'bfs' || algorithm === 'dfs'
      ? runSearch(graph, algorithm, start, end)
      : algorithm === 'dijkstra'
        ? runDijkstra(graph, start, end)
        : runBellmanFord(graph, start, end)

  return {
    ...partial,
    durationMs: performance.now() - began,
  }
}
