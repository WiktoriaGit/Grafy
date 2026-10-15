
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
  Layers3,
  Network,
  Play,
  Waypoints,
} from 'lucide-react'
import DemoGraph from '../components/DemoGraph'

const stats = [
  { label: 'Zaimplementowane algorytmy', value: '6', icon: GitBranch, color: 'purple', note: '3 grupy algorytmów' },
  { label: 'Moduły aplikacji', value: '6', icon: Layers3, color: 'blue', note: 'Struktura projektu' },
  { label: 'Wierzchołki przykładu', value: '6', icon: Network, color: 'cyan', note: 'Graf demonstracyjny' },
  { label: 'Krawędzie przykładu', value: '8', icon: Waypoints, color: 'orange', note: 'Graf ważony' },
]

const features = [
  {
    title: 'Edytor grafów',
    description: 'Twórz i modyfikuj własne grafy, wierzchołki oraz krawędzie.',
    icon: Network,
    to: '/editor',
    color: 'purple',
    tag: 'Moduł',
  },
  {
    title: 'Wizualizacja algorytmów',
    description: 'Obserwuj działanie algorytmów krok po kroku.',
    icon: Play,
    to: '/algorithms',
    color: 'blue',
    tag: 'Moduł',
  },
  {
    title: 'Eksperymenty',
    description: 'Generuj grafy i przygotowuj badania porównawcze.',
    icon: FlaskConical,
    to: '/experiments',
    color: 'cyan',
    tag: 'Moduł',
  },
  {
    title: 'Analiza wyników',
    description: 'Przeglądaj statystyki i wykresy wydajności.',
    icon: BarChart3,
    to: '/results',
    color: 'orange',
    tag: 'Moduł',
  },
]

export default function Dashboard() {
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow"> GRAPH ALGORITHM LABORATORY</div>
          <h1>Panel główny <span className="heading-accent">GraphLab</span></h1>
          <p>Interaktywne środowisko do wizualizacji, nauki i analizy algorytmów grafowych.</p>
        </div>
        <div className="heading-actions">
          <span className="version-pill"><span className="status-dot" /> Prototyp aplikacji</span>
          <Link to="/editor" className="btn btn-primary">
            Otwórz edytor <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>

      <div className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-label"> INTERAKTYWNE LABORATORIUM</div>
          <h2>Odkrywaj algorytmy.<br /><span>Analizuj ich działanie.</span></h2>
          <p>
            Projektuj grafy, poznawaj zasady działania algorytmów
            i porównuj ich wydajność w jednym środowisku.
          </p>
          <div className="welcome-actions">
            <Link to="/editor" className="btn btn-white">
              Rozpocznij pracę <ArrowRight size={17} />
            </Link>
            <Link to="/algorithms" className="btn btn-glass">
              <BookOpen size={17} /> Poznaj algorytmy
            </Link>
          </div>
        </div>
        <div className="welcome-decoration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="orbit-node node-one">A</span>
          <span className="orbit-node node-two">B</span>
          <span className="orbit-node node-three">C</span>
          <span className="orbit-node node-four">D</span>
          <span className="orbit-center"><Network size={34} /></span>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map(stat => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span className={`stat-icon icon-${stat.color}`}><stat.icon size={21} /></span>
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
          <h2>Podgląd wizualizacji</h2>
          <p>Przykładowy graf ważony z wyróżnioną ścieżką A → C → E → F.</p>
        </div>
        <span className="section-chip"><Clock3 size={14} /> Podgląd demonstracyjny</span>
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
        <DemoGraph />
        <div className="preview-footer">
          <div><span className="preview-footer-label">Przykładowa trasa</span><strong>A → C → E → F</strong></div>
          <div><span className="preview-footer-label">Suma wag trasy</span><strong>9</strong></div>
          <Link to="/editor" className="btn btn-outline">Przejdź do edytora <ArrowRight size={16} /></Link>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2>Moduły aplikacji</h2>
          <p>Przejdź do wybranego obszaru środowiska GraphLab.</p>
        </div>
      </div>

      <div className="feature-grid">
        {features.map(feature => (
          <Link to={feature.to} className="feature-card" key={feature.title}>
            <div className="feature-top">
              <span className={`feature-icon icon-${feature.color}`}><feature.icon size={22} /></span>
              <span className="feature-tag">{feature.tag}</span>
            </div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            <span className="feature-link">Otwórz moduł <ArrowRight size={16} /></span>
          </Link>
        ))}
      </div>
    </div>
  )
}
