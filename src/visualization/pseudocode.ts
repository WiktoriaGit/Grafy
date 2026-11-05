import type { Algorithm } from '../algorithms/graphAlgorithms'

export type PseudoLine = { id: number; text: string }

export const PSEUDOCODE: Record<Exclude<Algorithm, 'bellman'>, PseudoLine[]> = {
  bfs: [
    { id: 1, text: 'kolejka ← [start]; odkryte ← {start}' },
    { id: 2, text: 'dopóki kolejka nie jest pusta:' },
    { id: 3, text: '    v ← pobierz z początku kolejki' },
    { id: 4, text: '    oznacz v jako odwiedzony' },
    { id: 5, text: '    dla każdej krawędzi v → u:' },
    { id: 6, text: '        jeśli u nieodkryty: π(u)←v; dodaj u do kolejki' },
    { id: 7, text: 'zakończ — zbiór osiągalny i ścieżki z π' },
  ],
  dfs: [
    { id: 1, text: 'stos ← [start]; odkryte ← {start}' },
    { id: 2, text: 'dopóki stos nie jest pusty:' },
    { id: 3, text: '    v ← pobierz ze szczytu stosu' },
    { id: 4, text: '    oznacz v jako odwiedzony' },
    { id: 5, text: '    dla każdej krawędzi v → u:' },
    { id: 6, text: '        jeśli u nieodkryty: π(u)←v; dodaj u na stos' },
    { id: 7, text: 'zakończ — zbiór osiągalny i ścieżki z π' },
  ],
  dijkstra: [
    { id: 1, text: 'd(start)←0; pozostałe d(·)←∞; π(·)←nil' },
    { id: 2, text: 'dopóki istnieje nieustalony wierzchołek o d < ∞:' },
    { id: 3, text: '    u ← argmin d(·) wśród nieustalonych; ustal u' },
    { id: 4, text: '    dla każdej krawędzi u → v:' },
    { id: 5, text: '        jeśli d(u)+w(u,v) < d(v): zrelaksuj v, π(v)←u' },
    { id: 6, text: '        w przeciwnym razie: pomiń krawędź' },
    { id: 7, text: 'zakończ — najkrótsze ścieżki ze startu' },
  ],
}

export const BELLMAN_PSEUDO: PseudoLine[] = [
  { id: 1, text: 'd(start)←0; pozostałe d(·)←∞' },
  { id: 2, text: 'powtórz |V|-1 razy relaksację wszystkich krawędzi' },
  { id: 3, text: 'sprawdź ujemny cykl wpływający na cel' },
]

export function getPseudocode(algorithm: Algorithm): PseudoLine[] {
  if (algorithm === 'bellman') return BELLMAN_PSEUDO
  return PSEUDOCODE[algorithm]
}
