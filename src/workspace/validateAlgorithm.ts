import type { Algorithm, Graph } from '../algorithms/graphAlgorithms'

export type ValidationResult = {
  ok: boolean
  title: string
  messages: string[]
}

export function validateGraphForAlgorithm(graph: Graph, algorithm: Algorithm, start: string, end?: string): ValidationResult {
  const messages: string[] = []

  if (graph.vertices.length === 0) {
    return {
      ok: false,
      title: 'Graf jest pusty',
      messages: ['Dodaj przynajmniej jeden wierzchołek w edytorze, zanim uruchomisz algorytm.'],
    }
  }

  if (!graph.vertices.includes(start)) {
    return {
      ok: false,
      title: 'Nieprawidłowy wierzchołek startowy',
      messages: ['Wybierz wierzchołek początkowy spośród wierzchołków aktualnego grafu.'],
    }
  }

  if (end && !graph.vertices.includes(end)) {
    return {
      ok: false,
      title: 'Nieprawidłowy wierzchołek docelowy',
      messages: ['Cel ścieżki musi należeć do aktualnego grafu albo możesz wybrać inny wierzchołek.'],
    }
  }

  if (algorithm === 'dijkstra') {
    const negative = graph.links.filter(link => link.weight < 0)
    if (negative.length) {
      return {
        ok: false,
        title: 'Dijkstra nie działa przy ujemnych wagach',
        messages: [
          `Znaleziono ${negative.length} krawędzi z wagą ujemną (np. ${negative[0].source} → ${negative[0].target}: ${negative[0].weight}).`,
          'Dijkstra zakłada, że dojście do wierzchołka o najmniejszej odległości jest ostateczne. Ujemna waga może to zepsuć.',
          'Usuń ujemne wagi albo wybierz Bellmana–Forda, który je obsługuje.',
        ],
      }
    }
    messages.push('Dijkstra działa na grafach skierowanych i nieskierowanych, o ile wagi nie są ujemne (zero jest dozwolone).')
  }

  if (algorithm === 'bfs' || algorithm === 'dfs') {
    messages.push(
      algorithm === 'bfs'
        ? 'BFS działa na grafach skierowanych i nieskierowanych. Wag nie uwzględnia — liczy liczbę krawędzi.'
        : 'DFS działa na grafach skierowanych i nieskierowanych. Wag nie uwzględnia — buduje drzewo przeszukiwania w głąb.',
    )
  }

  if (algorithm === 'bellman') {
    messages.push('Bellman–Ford dopuszcza wagi ujemne i wykrywa cykle ujemne wpływające na wynik.')
  }

  if (graph.links.length === 0) {
    messages.push('Graf nie ma krawędzi. Algorytm odwiedzi tylko wierzchołek startowy (jeśli istnieje).')
  }

  messages.push('Pętle własne i krawędzie równoległe są w edytorze zablokowane — każda para wierzchołków ma co najwyżej jedną krawędź w danym kierunku.')

  return {
    ok: true,
    title: 'Graf jest gotowy do uruchomienia',
    messages,
  }
}

export function describeUnreachable(graph: Graph, reachable: string[], start: string): string | null {
  const missing = graph.vertices.filter(v => !reachable.includes(v))
  if (!missing.length) return null
  return `Ze startu ${start} nieosiągalne są: ${missing.join(', ')}. Algorytm poprawnie eksplorował tylko część grafu.`
}
