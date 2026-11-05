import type { Algorithm } from '../algorithms/graphAlgorithms'
import type { MSTAlgorithm } from '../algorithms/mstAlgorithms'

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
  { id: 1, text: 'd(start)←0; pozostałe d(·)←∞; π(·)←nil' },
  { id: 2, text: 'dla i ← 1 … |V|−1:' },
  { id: 3, text: '    dla każdej krawędzi u → v: jeśli d(u)+w < d(v): zrelaksuj' },
  { id: 4, text: '    w przeciwnym razie: pozostaw d(v) bez zmian' },
  { id: 5, text: 'sprawdź, czy istnieje jeszcze relaksacja (ujemny cykl)' },
  { id: 6, text: 'zakończ — odległości / ostrzeżenie o cyklu' },
]

export const MST_PSEUDO: Record<MSTAlgorithm, PseudoLine[]> = {
  prim: [
    { id: 1, text: 'T ← {start}; waga ← 0' },
    { id: 2, text: 'dopóki T ≠ V i istnieje krawędź przecinająca przekrój:' },
    { id: 3, text: '    kandydaci ← krawędzie z dokładnie jednym końcem w T' },
    { id: 4, text: '    e ← najlżejsza krawędź kandydacka' },
    { id: 5, text: '    dodaj e do MST; dołącz nowy wierzchołek do T; waga += w(e)' },
    { id: 6, text: 'jeśli T ≠ V: graf niespójny → las rozpinający' },
    { id: 7, text: 'zakończ — MST / las i łączna waga' },
  ],
  kruskal: [
    { id: 1, text: 'posortuj krawędzie rosnąco po wadze; UF: każdy v osobno' },
    { id: 2, text: 'dla każdej krawędzi e = (u,v) w kolejności:' },
    { id: 3, text: '    jeśli find(u) ≠ find(v): dodaj e; union(u,v)' },
    { id: 4, text: '    w przeciwnym razie: odrzuć e (cykl)' },
    { id: 5, text: 'jeśli |E_MST| < |V|−1: graf niespójny → las' },
    { id: 6, text: 'zakończ — MST / las i łączna waga' },
  ],
}

export function getPseudocode(algorithm: Algorithm): PseudoLine[] {
  if (algorithm === 'bellman') return BELLMAN_PSEUDO
  return PSEUDOCODE[algorithm]
}

export function getMstPseudocode(algorithm: MSTAlgorithm): PseudoLine[] {
  return MST_PSEUDO[algorithm]
}
