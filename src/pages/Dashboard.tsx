import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  FlaskConical,
  GitBranch,
  GitCompare,
  Layers3,
  Network,
  Play,
  Waypoints,
} from 'lucide-react'
import { DEMO_SCENARIOS } from '../utils/demoScenarios'

/** React Flow tylko dla podglądu — nie blokuje pierwszego renderu treści Dashboard. */
const DemoGraph = lazy(() => import('../components/DemoGraph'))

const stats = [
  { label: 'Zaimplementowane algorytmy', value: '6', icon: GitBranch, color: 'purple', note: 'BFS · DFS · Dijkstra · BF · Prim · Kruskal' },
  { label: 'Moduły aplikacji', value: '7', icon: Layers3, color: 'blue', note: 'Edytor → wizualizacja → eksperymenty' },
  { label: 'Wierzchołki przykładu', value: '6', icon: Network, color: 'cyan', note: 'Graf demonstracyjny' },
  { label: 'Scenariusze demo', value: '6', icon: Waypoints, color: 'orange', note: 'Gotowe ścieżki prezentacji' },
]

const features = [
  {
    title: 'Edytor grafów',
    description: 'Twórz grafy, ustawiaj wagi i start/cel, potem przejdź do wizualizacji lub porównania.',
    icon: Network,
    to: '/editor',
    color: 'purple',
    tag: 'Start tutaj',
  },
  {
    title: 'Wizualizacja algorytmów',
    description: 'BFS, DFS, Dijkstra i Bellman–Ford krok po kroku z pseudokodem i historią.',
    icon: Play,
    to: '/algorithms',
    color: 'blue',
    tag: 'Nauka',
  },
  {
    title: 'Porównanie algorytmów',
    description: 'Dwa przebiegi na identycznym grafie — kolejność, metryki i ostrzeżenia edukacyjne.',
    icon: GitCompare,
    to: '/comparison',
    color: 'cyan',
    tag: 'Demo',
  },
  {
    title: 'Prim i Kruskal',
    description: 'Minimalne drzewo rozpinające z Union–Find, kandydatami i wspólnym odtwarzaczem.',
    icon: GitBranch,
    to: '/mst',
    color: 'orange',
    tag: 'MST',
  },
  {
    title: 'Eksperymenty',
    description: 'Duże grafy w Web Workerze — bez rysowania tysięcy wierzchołków w React Flow.',
    icon: FlaskConical,
    to: '/experiments',
    color: 'blue',
    tag: 'Wydajność',
  },
  {
    title: 'Analiza wyników',
    description: 'Średnie, mediany, wykresy i historia pomiarów z localStorage.',
    icon: BarChart3,
    to: '/results',
    color: 'purple',
    tag: 'Dane',
  },
]

function LabSchematic() {
  return (
    <div className="lab-schematic" aria-hidden="true">
      <svg viewBox="0 0 240 240" role="img">
        <line className="edge" x1="48" y1="48" x2="120" y2="72" />
        <line className="edge" x1="120" y1="72" x2="192" y2="56" />
        <line className="edge-accent" x1="120" y1="72" x2="88" y2="148" />
        <line className="edge-accent" x1="88" y1="148" x2="160" y2="176" />
        <line className="edge" x1="192" y1="56" x2="160" y2="176" />
        <line className="edge" x1="48" y1="48" x2="88" y2="148" />
        <circle className="node" cx="48" cy="48" r="14" />
        <circle className="node-accent" cx="120" cy="72" r="15" />
        <circle className="node" cx="192" cy="56" r="14" />
        <circle className="node-accent" cx="88" cy="148" r="14" />
        <circle className="node-accent" cx="160" cy="176" r="15" />
        <text x="48" y="48">A</text>
        <text x="120" y="72">B</text>
        <text x="192" y="56">C</text>
        <text x="88" y="148">D</text>
        <text x="160" y="176">E</text>
      </svg>
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow">GRAPHLAB · RESEARCH WORKSPACE</div>
          <h1>
            <span className="heading-accent">GraphLab</span> — laboratorium analizy
          </h1>
          <p>Środowisko do wizualizacji, porównań i pomiarów algorytmów grafowych.</p>
        </div>
        <div className="heading-actions">
          <span className="version-pill"><span className="status-dot" /> Gotowe do prezentacji</span>
          <Link to="/editor" className="btn btn-primary">
            Otwórz edytor <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>

      <div className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-label">PROTOKÓŁ STARTU</div>
          <h2>Trzy kroki do pierwszej animacji</h2>
          <p>
            1) Wybierz scenariusz demo poniżej albo otwórz edytor.
            2) Uruchom algorytm i przewijaj kroki.
            3) Porównaj dwa przebiegi albo zmierz wydajność na dużym grafie.
          </p>
          <div className="welcome-actions">
            <Link to="/comparison?scenario=bfs-dfs" className="btn btn-white">
              Demo BFS vs DFS <ArrowRight size={17} />
            </Link>
            <Link to="/algorithms?scenario=dijkstra" className="btn btn-glass">
              <BookOpen size={17} /> Demo Dijkstry
            </Link>
          </div>
        </div>
        <div className="welcome-decoration">
          <LabSchematic />
        </div>
      </div>

      <div className="stats-grid">
        {stats.map(stat => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span className={`stat-icon icon-${stat.color}`}><stat.icon size={18} /></span>
              <ArrowUpRight size={16} className="muted-icon" />
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-note"><CheckCircle2 size={13} /> {stat.note}</div>
          </div>
        ))}
      </div>

      <div className="section-heading">
        <div>
          <h2>Scenariusze demonstracyjne</h2>
          <p>Gotowe ścieżki pod prezentację — każdy z krótkim opisem tego, co warto zaobserwować.</p>
        </div>
        <span className="section-chip"><Clock3 size={14} /> A–F</span>
      </div>

      <div className="feature-grid demo-scenario-grid">
        {DEMO_SCENARIOS.map(scenario => (
          <Link to={scenario.to} className="feature-card" key={scenario.id}>
            <div className="feature-top">
              <span className="feature-icon icon-blue" style={{ fontWeight: 800 }}>{scenario.letter}</span>
              <span className="feature-tag">Demo</span>
            </div>
            <h3>{scenario.title}</h3>
            <p>{scenario.observation}</p>
            <span className="feature-link">{scenario.cta} <ArrowRight size={16} /></span>
          </Link>
        ))}
      </div>

      <div className="section-heading">
        <div>
          <h2>Podgląd wizualizacji</h2>
          <p>Przykładowy graf ważony z wyróżnioną ścieżką A → C → E → F (koszt 9).</p>
        </div>
        <span className="section-chip"><Clock3 size={14} /> Podgląd</span>
      </div>

      <div className="preview-card">
        <div className="preview-toolbar">
          <div className="preview-toolbar-left">
            <span className="preview-icon"><Network size={18} /></span>
            <div>
              <strong>Graf demonstracyjny</strong>
              <small>6 wierzchołków · 8 krawędzi · graf ważony</small>
            </div>
          </div>
          <span className="preview-status"><span className="status-dot" /> Podgląd</span>
        </div>
        <Suspense
          fallback={(
            <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', color: '#8b93a7' }}>
              Ładowanie podglądu grafu…
            </div>
          )}
        >
          <DemoGraph />
        </Suspense>
        <div className="preview-footer">
          <div><span className="preview-footer-label">Przykładowa trasa</span><strong>A → C → E → F</strong></div>
          <div><span className="preview-footer-label">Suma wag trasy</span><strong>9</strong></div>
          <Link to="/algorithms?scenario=dijkstra" className="btn btn-outline">
            Uruchom na tym typie grafu <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2>Moduły aplikacji</h2>
          <p>Wszystkie obszary GraphLab w jednym miejscu. Brak osobnych stron „Ustawienia” / „O aplikacji” — informacje o projekcie są tu i w stopce.</p>
        </div>
      </div>

      <div className="feature-grid">
        {features.map(feature => (
          <Link to={feature.to} className="feature-card" key={feature.title}>
            <div className="feature-top">
              <span className={`feature-icon icon-${feature.color}`}><feature.icon size={20} /></span>
              <span className="feature-tag">{feature.tag}</span>
            </div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            <span className="feature-link">Otwórz moduł <ArrowRight size={16} /></span>
          </Link>
        ))}
      </div>

      <section className="panel" style={{ marginTop: 20, padding: '18px 22px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>O GraphLab</h3>
        <p style={{ margin: 0, color: 'var(--gl-text-muted)', fontSize: 13, lineHeight: 1.7 }}>
          Projekt inżynierski: edukacyjna wizualizacja i analiza algorytmów grafowych (React, TypeScript, React Flow).
          Graf z edytora jest przechowywany lokalnie w przeglądarce (`graphlab-editor-v1`) i nie znika przy zmianie zakładki.
          Pomiary eksperymentów: `graphlab-benchmarks-v2`. Nie renderujemy tysięcy wierzchołków w React Flow podczas benchmarku.
        </p>
      </section>
    </div>
  )
}
