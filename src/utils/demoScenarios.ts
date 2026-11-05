export type DemoScenario = {
  id: string
  letter: string
  title: string
  observation: string
  to: string
  cta: string
}

/** Scenariusze demonstracyjne pod prezentację — bez fikcyjnych wyników benchmarków. */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'bfs-dfs',
    letter: 'A',
    title: 'BFS vs DFS — kolejność odwiedzin',
    observation:
      'Na grafie rozgałęzionym BFS idzie warstwami (kolejka), a DFS wchodzi w głąb (stos). Porównaj kolejność odwiedzin na tym samym starcie.',
    to: '/comparison?scenario=bfs-dfs',
    cta: 'Otwórz porównanie',
  },
  {
    id: 'dijkstra',
    letter: 'B',
    title: 'Dijkstra — najkrótsza ścieżka ważona',
    observation:
      'Na grafie ważonym bez ujemnych wag obserwuj relaksacje i wybór wierzchołka o najmniejszym d(·). Końcowa ścieżka A→C→E→F ma koszt 9.',
    to: '/algorithms?scenario=dijkstra',
    cta: 'Uruchom Dijkstrę',
  },
  {
    id: 'bellman',
    letter: 'C',
    title: 'Bellman–Ford — ujemna waga bez ujemnego cyklu',
    observation:
      'Krawędź B→C ma wagę −3. Algorytm poprawia d(C) przez relaksację i kończy z poprawną ścieżką A→B→C (koszt 1), bez błędu cyklu.',
    to: '/algorithms?scenario=bellman',
    cta: 'Uruchom Bellmana–Forda',
  },
  {
    id: 'mst',
    letter: 'D',
    title: 'Prim i Kruskal — to samo MST',
    observation:
      'Na nieskierowanym grafie oba algorytmy powinny dać tę samą łączną wagę drzewa, choć kolejność wyboru krawędzi bywa inna.',
    to: '/comparison?scenario=mst',
    cta: 'Porównaj Prim vs Kruskal',
  },
  {
    id: 'editor',
    letter: 'E',
    title: 'Edytor — własny graf i wizualizacja',
    observation:
      'Dodaj wierzchołki kliknięciem, połącz je uchwytami, ustaw wagi, a potem użyj „Wizualizuj ten graf”. Graf zostaje w workspace przeglądarki.',
    to: '/editor',
    cta: 'Otwórz edytor',
  },
  {
    id: 'experiments',
    letter: 'F',
    title: 'Eksperymenty — 100 / 1000 / 10 000 wierzchołków',
    observation:
      'Uruchom własne pomiary w Web Workerze (np. ścieżka lub ER). Wyniki zapiszą się lokalnie — nie pokazujemy tu gotowych, fikcyjnych czasów.',
    to: '/experiments?scenario=sizes',
    cta: 'Otwórz eksperymenty',
  },
]

export const ALGORITHM_GUIDES = {
  bfs: {
    use: 'Przeszukiwanie wszerz — najkrótsza ścieżka w sensie liczby krawędzi (bez wag).',
    limits: 'Nie uwzględnia wag. Na grafie ważonym nie zastępuje Dijkstry.',
  },
  dfs: {
    use: 'Przeszukiwanie w głąb — buduje drzewo eksploracji i wykrywa strukturę osiągalności.',
    limits: 'Nie gwarantuje najkrótszej ścieżki (ani ważonej, ani po liczbie krawędzi).',
  },
  dijkstra: {
    use: 'Najkrótsze ścieżki od startu przy wagach nieujemnych (w tym zero).',
    limits: 'Ujemne wagi są niedozwolone — wtedy wybierz Bellmana–Forda.',
  },
  bellman: {
    use: 'Najkrótsze ścieżki także przy wagach ujemnych; wykrywa ujemne cykle wpływające na wynik.',
    limits: 'Wolniejszy na dużych grafach; ujemny cykl może unieważnić odległości.',
  },
  prim: {
    use: 'Minimalne drzewo (lub las) rozpinające — rozrost od wybranego wierzchołka.',
    limits: 'Wymaga grafu nieskierowanego.',
  },
  kruskal: {
    use: 'Minimalne drzewo/las — sortuje krawędzie i łączy komponenty (Union–Find).',
    limits: 'Wymaga grafu nieskierowanego.',
  },
} as const
