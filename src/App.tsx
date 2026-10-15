
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import GraphEditor from './pages/GraphEditor'
import Algorithms from './pages/Algorithms'
import Experiments from './pages/Experiments'
import Results from './pages/Results'
import MST from './pages/MST'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/editor" element={<GraphEditor />} />
          <Route path="/algorithms" element={<Algorithms />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/results" element={<Results />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/mst" element={<MST />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
