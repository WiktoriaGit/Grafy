
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Menu,
  Network,
  PanelLeftClose,
  X,
} from 'lucide-react'

const navigation = [
  { to: '/', label: 'Panel główny', icon: LayoutDashboard, end: true },
  { to: '/editor', label: 'Edytor grafów', icon: Network },
  { to: '/algorithms', label: 'Algorytmy', icon: GitBranch },
  { to: '/experiments', label: 'Eksperymenty', icon: FlaskConical },
  { to: '/results', label: 'Wyniki i analiza', icon: BarChart3 },
  { to: '/mst', label: 'Prim i Kruskal', icon: GitBranch },
]

const titles: Record<string, string> = {
  '/': 'Panel główny',
  '/editor': 'Edytor grafów',
  '/algorithms': 'Algorytmy grafowe',
  '/experiments': 'Eksperymenty',
  '/results': 'Wyniki i analiza',
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const title = titles[location.pathname] ?? 'GraphLab'

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Zamknij menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><Network size={23} strokeWidth={2.2} /></div>
          {!collapsed && (
            <div className="brand-text">
              <strong>Graph<span>Lab</span></strong>
              <small>ALGORITHM STUDIO</small>
            </div>
          )}
          <button
            className="icon-button collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            title="Zwiń lub rozwiń menu"
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Zamknij menu"
          >
            <X size={19} />
          </button>
        </div>

        {!collapsed && <div className="nav-caption">PRZESTRZEŃ ROBOCZA</div>}

        <nav className="sidebar-nav" aria-label="Nawigacja główna">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
            >
              <Icon size={19} strokeWidth={1.9} />
              {!collapsed && <span>{label}</span>}
              {!collapsed && <ChevronRight className="nav-arrow" size={15} />}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-version">
            <Activity size={15} />
            {!collapsed && <span>GraphLab v0.1.0</span>}
          </div>
        </div>
      </aside>

      <div className={`main-area ${collapsed ? 'main-expanded' : ''}`}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Otwórz menu"
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={15} className="breadcrumb-separator" />
            <span className="breadcrumb-current">{title}</span>
          </div>

          <div className="topbar-right">
            <div className="topbar-status">
              <span className="status-dot" />
              Środowisko lokalne
            </div>
            <div className="topbar-divider" />
            <div className="avatar">GL</div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <span>© 2026 GraphLab — Projekt inżynierski</span>
          <div>
            <BookOpen size={14} />
            <span>React · TypeScript · React Flow</span>
            <ArrowUpRight size={13} />
          </div>
        </footer>
      </div>
    </div>
  )
}
