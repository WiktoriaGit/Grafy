import type { Graph } from './graphAlgorithms'

export type MSTAlgorithm = 'prim' | 'kruskal'
export type MSTEdge = { source: string; target: string; weight: number; id: number }
export type MSTStepEvent =
  | 'init'
  | 'sort'
  | 'consider'
  | 'candidate'
  | 'accept'
  | 'reject'
  | 'union'
  | 'done'

export type MSTStep = {
  selected: number[]
  considered: number | null
  visited: string[]
  message: string
  title: string
  detail: string
  reason?: string
  event: MSTStepEvent
  pseudoLine: number
  treeWeight: number
  candidates?: number[]
  sortedOrder?: number[]
  components?: Record<string, string>
  activeEdge?: string
}

export type MSTResult = {
  steps: MSTStep[]
  selected: MSTEdge[]
  totalWeight: number
  durationMs: number
  connected: boolean
  operations: number
}

function edgeLabel(edge: MSTEdge) {
  return `${edge.source}–${edge.target}`
}

function activeKey(edge: MSTEdge) {
  return `${edge.source}|${edge.target}`
}

function componentSnapshot(parent: Map<string, string>, vertices: string[]): Record<string, string> {
  const findRoot = (v: string): string => {
    const p = parent.get(v)!
    if (p !== v) {
      const root = findRoot(p)
      parent.set(v, root)
      return root
    }
    return v
  }
  const out: Record<string, string> = {}
  for (const v of vertices) out[v] = findRoot(v)
  return out
}

export function calculateMST(graph: Graph, algorithm: MSTAlgorithm, start?: string): MSTResult {
  if (graph.directed) {
    throw new Error('Minimalne drzewo rozpinające wymaga grafu nieskierowanego. Zmień typ grafu w edytorze i zapisz go ponownie.')
  }
  if (new Set(graph.vertices).size !== graph.vertices.length) throw new Error('Powtórzone identyfikatory wierzchołków.')
  if (!graph.vertices.length) throw new Error('Graf nie zawiera wierzchołków.')

  const vertices = new Set(graph.vertices)
  const edges: MSTEdge[] = graph.links.map((e, id) => ({ ...e, id }))
  for (const e of edges) {
    if (!vertices.has(e.source) || !vertices.has(e.target) || !Number.isFinite(e.weight)) {
      throw new Error('Niepoprawna krawędź.')
    }
  }

  const begun = performance.now()
  const steps: MSTStep[] = []
  const selected: MSTEdge[] = []
  const visited = new Set<string>()
  let operations = 0
  let treeWeight = 0

  const push = (partial: Omit<MSTStep, 'selected' | 'visited' | 'treeWeight' | 'message' | 'considered'> & {
    message?: string
    considered?: number | null
  }) => {
    const message = partial.message ?? partial.title
    steps.push({
      selected: selected.map(e => e.id),
      visited: [...visited],
      treeWeight,
      considered: partial.considered ?? null,
      message,
      title: partial.title,
      detail: partial.detail,
      reason: partial.reason,
      event: partial.event,
      pseudoLine: partial.pseudoLine,
      candidates: partial.candidates,
      sortedOrder: partial.sortedOrder,
      components: partial.components,
      activeEdge: partial.activeEdge,
    })
  }

  if (algorithm === 'prim') {
    const preferred = start && vertices.has(start) ? start : graph.vertices[0]
    push({
      event: 'init',
      pseudoLine: 1,
      title: `Start Prima (preferowany korzeń ${preferred})`,
      message: `Budujemy las rozpinający: najpierw drzewo od ${preferred}, potem kolejne składowe.`,
      detail:
        'Algorytm Prima rozrasta drzewo przez najlżejsze krawędzie przekroju. ' +
        'Polityka dla grafu niespójnego: gdy bieżące drzewo nie ma kandydatów, rozpoczynamy nowe drzewo w pierwszym nieodwiedzonych wierzchołku — wynik to minimalny las rozpinający.',
      reason: 'Każda składowa spójności dostaje własne drzewo rozpinające.',
      candidates: [],
    })

    const seedRoot = (root: string, first: boolean) => {
      visited.add(root)
      push({
        event: 'init',
        pseudoLine: first ? 1 : 6,
        title: first ? `Pierwsze drzewo w ${root}` : `Nowe drzewo lasu w ${root}`,
        message: `T zawiera teraz {${[...visited].join(', ')}}.`,
        detail: first
          ? `Rozpoczynamy rozrost od preferowanego korzenia ${root}.`
          : `Składowa została wyczerpana. Polityka lasu: otwieramy nowe drzewo w ${root}.`,
        reason: first ? 'Korzeń nie wymaga krawędzi.' : 'W niespójnym grafie MST całego V nie istnieje — budujemy las.',
        candidates: [],
      })
    }

    seedRoot(preferred, true)

    while (visited.size < graph.vertices.length) {
      const candidates: MSTEdge[] = []
      let best: MSTEdge | undefined
      for (const e of edges) {
        operations++
        const crosses = visited.has(e.source) !== visited.has(e.target)
        if (!crosses) continue
        candidates.push(e)
        if (!best || e.weight < best.weight || (e.weight === best.weight && e.id < best.id)) best = e
      }

      push({
        event: 'candidate',
        pseudoLine: 3,
        title: `Kandydaci przekroju (|T|=${visited.size})`,
        message: candidates.length
          ? `Krawędzie przecinające przekrój: ${candidates.map(edgeLabel).join(', ')}.`
          : 'Brak krawędzi przecinających przekrój dla bieżącego zbioru T.',
        detail: candidates.length
          ? `Zbiór drzewa/lasu: {${[...visited].join(', ')}}. Każda krawędź kandydacka ma dokładnie jeden koniec w T.`
          : 'Jeśli zostały nieodwiedzone wierzchołki, otworzymy nowe drzewo w kolejnej składowej.',
        reason: candidates.length
          ? 'Prim wybiera wyłącznie spośród krawędzi przekroju, aby nie tworzyć cyklu w T.'
          : 'Polityka lasu rozpinającego dla grafu niespójnego.',
        candidates: candidates.map(e => e.id),
      })

      if (!best) {
        const orphan = graph.vertices.find(v => !visited.has(v))
        if (!orphan) break
        seedRoot(orphan, false)
        continue
      }

      push({
        event: 'consider',
        pseudoLine: 4,
        considered: best.id,
        activeEdge: activeKey(best),
        title: `Wybór krawędzi ${edgeLabel(best)}`,
        message: `Najlżejsza krawędź kandydacka: ${edgeLabel(best)} (waga ${best.weight}).`,
        detail:
          `Porównano ${candidates.length} kandydatów. Krawędź ${edgeLabel(best)} ma najmniejszą wagę` +
          (candidates.length > 1
            ? ` spośród {${candidates.map(e => `${edgeLabel(e)}:${e.weight}`).join(', ')}}.`
            : '.'),
        reason: `w(${edgeLabel(best)}) = ${best.weight} jest minimalne na przekroju.`,
        candidates: candidates.map(e => e.id),
      })

      selected.push(best)
      treeWeight += best.weight
      visited.add(best.source)
      visited.add(best.target)

      push({
        event: 'accept',
        pseudoLine: 5,
        considered: best.id,
        activeEdge: activeKey(best),
        title: `Dodano ${edgeLabel(best)} do drzewa`,
        message: `T ← {${[...visited].join(', ')}}. Łączna waga ← ${treeWeight}.`,
        detail: `Nowy wierzchołek dołączył przez krawędź ${edgeLabel(best)}. Suma wag wzrosła o ${best.weight}.`,
        reason: 'Najlżejsza krawędź przekroju zachowuje optymalność (własność przekroju).',
        candidates: [],
      })
    }
  } else {
    const parent = new Map(graph.vertices.map(v => [v, v]))
    const rank = new Map(graph.vertices.map(v => [v, 0]))
    const find = (v: string): string => {
      operations++
      const p = parent.get(v)!
      if (p !== v) {
        const root = find(p)
        parent.set(v, root)
        return root
      }
      return v
    }
    const union = (a: string, b: string): boolean => {
      let x = find(a)
      let y = find(b)
      if (x === y) return false
      if (rank.get(x)! < rank.get(y)!) [x, y] = [y, x]
      parent.set(y, x)
      if (rank.get(x) === rank.get(y)) rank.set(x, rank.get(x)! + 1)
      return true
    }

    const sorted = [...edges].sort((a, b) => a.weight - b.weight || a.id - b.id)
    const sortedOrder = sorted.map(e => e.id)

    push({
      event: 'init',
      pseudoLine: 1,
      title: 'Inicjalizacja Kruskala (Union–Find)',
      message: 'Każdy wierzchołek zaczyna jako osobny zbiór. Lista krawędzi zostanie przejrzana rosnąco po wadze.',
      detail: 'Struktura Find/Union śledzi spójne komponenty budowanego lasu. Dwie krawędzie łączymy tylko wtedy, gdy ich końce należą do różnych zbiorów — inaczej powstałby cykl.',
      reason: 'Na starcie las ma |V| drzew trywialnych i wagę 0.',
      sortedOrder,
      components: componentSnapshot(parent, graph.vertices),
    })

    push({
      event: 'sort',
      pseudoLine: 1,
      title: 'Sortowanie krawędzi',
      message: `Kolejność: ${sorted.map(e => `${edgeLabel(e)}(${e.weight})`).join(', ') || 'brak'}.`,
      detail: 'Kruskal rozpatruje krawędzie od najlżejszej do najcięższej. Dzięki temu pierwsza krawędź, która nie tworzy cyklu, jest bezpieczna dla MST.',
      reason: 'Sortowanie gwarantuje własność zachłanną algorytmu.',
      sortedOrder,
      components: componentSnapshot(parent, graph.vertices),
    })

    for (const e of sorted) {
      const rootU = find(e.source)
      const rootV = find(e.target)
      push({
        event: 'consider',
        pseudoLine: 2,
        considered: e.id,
        activeEdge: activeKey(e),
        title: `Rozpatrywanie ${edgeLabel(e)}`,
        message: `Waga ${e.weight}. Representanci: ${e.source}→${rootU}, ${e.target}→${rootV}.`,
        detail: `Sprawdzamy, czy końce krawędzi leżą w różnych komponentach Union–Find. Jeśli tak, krawędź jest bezpieczna; jeśli nie — domknęłaby cykl.`,
        reason: rootU === rootV
          ? `find(${e.source}) = find(${e.target}) = ${rootU} — oba końce są już połączone.`
          : `find(${e.source}) = ${rootU} ≠ ${rootV} = find(${e.target}) — można bezpiecznie scalić zbiory.`,
        sortedOrder,
        components: componentSnapshot(parent, graph.vertices),
      })

      if (union(e.source, e.target)) {
        selected.push(e)
        treeWeight += e.weight
        visited.add(e.source)
        visited.add(e.target)
        const comps = componentSnapshot(parent, graph.vertices)
        push({
          event: 'accept',
          pseudoLine: 3,
          considered: e.id,
          activeEdge: activeKey(e),
          title: `Dodano ${edgeLabel(e)}`,
          message: `Union(${e.source},${e.target}). Łączna waga ← ${treeWeight}.`,
          detail: `Krawędź nie tworzy cyklu, więc wchodzi do lasu. Zbiory zostały scalone; nowy reprezentant komponentu: ${comps[e.source]}.`,
          reason: 'Brak wspólnego reprezentanta ⇒ brak cyklu ⇒ akceptacja.',
          sortedOrder,
          components: comps,
        })
        push({
          event: 'union',
          pseudoLine: 3,
          considered: e.id,
          activeEdge: activeKey(e),
          title: 'Stan Union–Find po scaleniu',
          message: `Reprezentanci: ${graph.vertices.map(v => `${v}→${comps[v]}`).join(', ')}.`,
          detail: 'Tablica reprezentantów pokazuje, które wierzchołki należą już do tej samej składowej budowanego MST/lasu.',
          reason: 'Find z kompresją ścieżek utrzymuje aktualnych reprezentantów.',
          sortedOrder,
          components: comps,
        })
      } else {
        push({
          event: 'reject',
          pseudoLine: 4,
          considered: e.id,
          activeEdge: activeKey(e),
          title: `Odrzucono ${edgeLabel(e)} (cykl)`,
          message: `Krawędź ${edgeLabel(e)} połączyłaby wierzchołki z tego samego zbioru.`,
          detail:
            `Oba końce mają reprezentanta ${rootU}. Dodanie krawędzi utworzyłoby cykl w bieżącym lesie, więc Kruskal ją pomija — mimo że mogła mieć atrakcyjną wagę.`,
          reason: 'Wykrycie cyklu przez równość find(u) i find(v).',
          sortedOrder,
          components: componentSnapshot(parent, graph.vertices),
        })
      }

      if (selected.length === graph.vertices.length - 1) break
    }
  }

  const connected = selected.length === graph.vertices.length - 1
  const totalWeight = selected.reduce((sum, e) => sum + e.weight, 0)
  treeWeight = totalWeight

  push({
    event: 'done',
    pseudoLine: algorithm === 'prim' ? 7 : 6,
    title: connected ? 'MST gotowe' : 'Las rozpinający (graf niespójny)',
    message: connected
      ? `Minimalne drzewo rozpinające ma wagę ${totalWeight} i ${selected.length} krawędzi.`
      : `Graf jest niespójny. Wyznaczono las rozpinający o wadze ${totalWeight} (${selected.length} krawędzi).`,
    detail: connected
      ? `Wybrane krawędzie: ${selected.map(e => `${edgeLabel(e)}(${e.weight})`).join(', ') || 'brak'}.`
      : algorithm === 'prim'
        ? `Prim zbudował minimalny las: po wyczerpaniu kandydatów w jednej składowej otwierał kolejne drzewa w pozostałych wierzchołkach. Wybrane krawędzie: ${selected.map(e => `${edgeLabel(e)}(${e.weight})`).join(', ') || 'brak'}.`
        : `Kruskal dodał wszystkie krawędzie, które nie tworzyły cyklu. Ponieważ |E_MST| < |V|−1, graf ma więcej niż jedną składową — wynik jest lasem rozpinającym. Wybrane krawędzie: ${selected.map(e => `${edgeLabel(e)}(${e.weight})`).join(', ') || 'brak'}.`,
    reason: connected
      ? 'Spójny graf nieskierowany ma MST o |V|−1 krawędziach.'
      : 'Niespójność ⇒ nie istnieje pojedyncze drzewo rozpinające całego V.',
    candidates: [],
    sortedOrder: algorithm === 'kruskal'
      ? [...edges].sort((a, b) => a.weight - b.weight || a.id - b.id).map(e => e.id)
      : undefined,
  })

  return {
    steps,
    selected,
    totalWeight,
    durationMs: performance.now() - begun,
    connected,
    operations,
  }
}
