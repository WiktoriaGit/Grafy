/**
 * Theoretical complexities verified against GraphLab source implementations.
 * Do not copy textbook asymptotics that do not match this codebase.
 */

export type ComplexityEntry = {
  id: string
  name: string
  context: 'educational' | 'benchmark'
  time: string
  memory: string
  structures: string
  notes: string
  source: string
}

export const COMPLEXITY_SYMBOLS = {
  V: 'V — liczba wierzchołków grafu',
  E: 'E — liczba krawędzi (łuków) w reprezentacji wejściowej',
  alpha: 'α(V) — odwrotna funkcja Ackermanna (praktycznie stała) w Union–Find',
} as const

/** Catalog derived from actual code paths in graphAlgorithms, mstAlgorithms and benchmark. */
export const COMPLEXITY_CATALOG: ComplexityEntry[] = [
  {
    id: 'bfs-edu',
    name: 'BFS',
    context: 'educational',
    time: 'O(V + E)',
    memory: 'O(V + E)',
    structures: 'Kolejka FIFO (tablica), zbiory visited/discovered, mapa poprzedników, lista kroków animacji',
    notes: 'Pełna eksploracja osiągalnej części; każdy krok zapisuje stan do wizualizacji.',
    source: 'graphAlgorithms.ts → runSearch(..., "bfs")',
  },
  {
    id: 'dfs-edu',
    name: 'DFS',
    context: 'educational',
    time: 'O(V + E)',
    memory: 'O(V + E)',
    structures: 'Stos LIFO (tablica), zbiory visited/discovered, mapa poprzedników, lista kroków',
    notes: 'Pełna eksploracja osiągalnej części; instrumentacja krokowa jak w BFS.',
    source: 'graphAlgorithms.ts → runSearch(..., "dfs")',
  },
  {
    id: 'dijkstra-edu',
    name: 'Dijkstra (bez kopca)',
    context: 'educational',
    time: 'O(V² + E)',
    memory: 'O(V + E)',
    structures: 'Tablica/mapa odległości; w każdej iteracji liniowe skanowanie wszystkich wierzchołków',
    notes: 'Wizualizacja NIE używa kopca — wybór minimum to pełne skanowanie V. To nie jest O((V+E) log V).',
    source: 'graphAlgorithms.ts → runDijkstra',
  },
  {
    id: 'bellman-edu',
    name: 'Bellman–Ford',
    context: 'educational',
    time: 'O(V · E)',
    memory: 'O(V + E)',
    structures: 'Listy sąsiedztwa / krawędzie, tablice d(·) i π(·), kroki relaksacji',
    notes: 'Dopuszcza wagi ujemne; po |V|−1 przebiegach test ujemnego cyklu.',
    source: 'graphAlgorithms.ts → runBellmanFord',
  },
  {
    id: 'prim-edu',
    name: 'Prim',
    context: 'educational',
    time: 'O(V · E)',
    memory: 'O(V + E)',
    structures: 'Zbiór T, skanowanie wszystkich krawędzi w poszukiwaniu przekroju (wersja naiwna)',
    notes: 'Brak kolejki priorytetowej — w każdej iteracji przegląd E krawędzi.',
    source: 'mstAlgorithms.ts → calculateMST(..., "prim")',
  },
  {
    id: 'kruskal-edu',
    name: 'Kruskal',
    context: 'educational',
    time: 'O(E log E + E · α(V))',
    memory: 'O(V + E)',
    structures: 'Sortowanie krawędzi, Union–Find (rank + kompresja ścieżek)',
    notes: 'Dominuje koszt sortowania; Find/Union jest prawie stały dzięki α(V).',
    source: 'mstAlgorithms.ts → calculateMST(..., "kruskal")',
  },
  {
    id: 'bfs-bench',
    name: 'BFS',
    context: 'benchmark',
    time: 'O(V + E)',
    memory: 'O(V + E)',
    structures: 'Kolejka FIFO, tablica seen — bez listy kroków animacji',
    notes: 'Pełne przeszukiwanie osiągalnej części od źródła (bez early-exit). Inny problem niż najkrótsze ścieżki ważone.',
    source: 'benchmark.ts → runBenchmarkAlgorithm(..., "bfs")',
  },
  {
    id: 'dfs-bench',
    name: 'DFS',
    context: 'benchmark',
    time: 'O(V + E)',
    memory: 'O(V + E)',
    structures: 'Stos LIFO, tablica seen — bez listy kroków animacji',
    notes: 'Pełne przeszukiwanie osiągalnej części od źródła (bez early-exit).',
    source: 'benchmark.ts → runBenchmarkAlgorithm(..., "dfs")',
  },
  {
    id: 'dijkstra-bench',
    name: 'Dijkstra (z kopcem)',
    context: 'benchmark',
    time: 'O((V + E) log V)',
    memory: 'O(V + E)',
    structures: 'Listy sąsiedztwa + binarny MinHeap (wpisy mogą się duplikować, stare są pomijane)',
    notes: 'To jest implementacja pomiarowa. Różni się od Dijkstry w wizualizacji (tam skanowanie V).',
    source: 'benchmark.ts → dijkstraHeap',
  },
  {
    id: 'bellman-bench',
    name: 'Bellman–Ford',
    context: 'benchmark',
    time: 'O(V · E)',
    memory: 'O(V + E)',
    structures: 'Float64Array odległości; relaksacja wyłącznie po adjacency[u]',
    notes: 'Dla grafu skierowanego nie tworzy łuków wstecz. Nieskierowany generator już umieszcza oba kierunki w adjacency.',
    source: 'benchmark.ts → runBenchmarkAlgorithm(..., "bellman")',
  },
  {
    id: 'prim-bench',
    name: 'Prim (z kopcem)',
    context: 'benchmark',
    time: 'O((V + E) log V)',
    memory: 'O(V + E)',
    structures: 'MinHeap + tablica najlepszej krawędzi do drzewa; budowa lasu dla niespójnych grafów',
    notes: 'Tylko graf nieskierowany. Inny problem niż najkrótsza ścieżka od źródła.',
    source: 'benchmark.ts → primHeap',
  },
  {
    id: 'kruskal-bench',
    name: 'Kruskal (Union–Find)',
    context: 'benchmark',
    time: 'O(E log E + E · α(V))',
    memory: 'O(V + E)',
    structures: 'Sortowanie krawędzi + Union–Find z kompresją ścieżek',
    notes: 'Tylko graf nieskierowany. Porównywalny z Primem w kategorii MST, nie z BFS/Dijkstrą.',
    source: 'benchmark.ts → kruskalUnionFind',
  },
]

export const COMPLEXITY_COMPARISON_NOTE =
  'Wyniki z małych grafów edukacyjnych (z budową kroków animacji) nie są bezpośrednio porównywalne z czasami z Eksperymentów (implementacje bez animacji, często inne struktury danych).'
