import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const GraphEditor = lazy(() => import('./pages/GraphEditor'))
const Algorithms = lazy(() => import('./pages/Algorithms'))
const Experiments = lazy(() => import('./pages/Experiments'))
const Results = lazy(() => import('./pages/Results'))
const MST = lazy(() => import('./pages/MST'))
const Comparison = lazy(() => import('./pages/Comparison'))

function RouteFallback() {
  return (
    <div className="page-container" style={{ paddingTop: 48 }}>
      <div className="panel" style={{ padding: 28, color: '#aebbd0' }}>
        Ładowanie modułu GraphLab…
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/editor" element={<GraphEditor />} />
            <Route path="/algorithms" element={<Algorithms />} />
            <Route path="/comparison" element={<Comparison />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/results" element={<Results />} />
            <Route path="/mst" element={<MST />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
