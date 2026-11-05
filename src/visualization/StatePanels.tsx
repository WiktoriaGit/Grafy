import type { DistanceMap, Step, StructureKind } from '../algorithms/graphAlgorithms'

function formatDistance(value: number | null | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '∞'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function structureTitle(kind: StructureKind) {
  if (kind === 'queue') return 'Kolejka (FIFO)'
  if (kind === 'stack') return 'Stos (LIFO)'
  if (kind === 'priority') return 'Kandydaci (min. odległość)'
  return 'Struktura pomocnicza'
}

function structureHint(kind: StructureKind) {
  if (kind === 'queue') return 'Lewa strona = początek kolejki (kolejny do pobrania).'
  if (kind === 'stack') return 'Prawa strona = szczyt stosu (kolejny do pobrania).'
  if (kind === 'priority') return 'Posortowane rosnąco po bieżącej odległości.'
  return 'Ten algorytm nie używa kolejki ani stosu.'
}

type Props = {
  step?: Step
  structureKind: StructureKind
  showDistances: boolean
  vertices: string[]
  notice: string
}

export default function StatePanels({ step, structureKind, showDistances, vertices, notice }: Props) {
  const frontier = step?.frontier ?? []
  const visited = step?.visited ?? []
  const distances: DistanceMap = step?.distances ?? {}
  const updates = new Set((step?.distanceUpdates ?? []).map(item => item.vertex))
  const activeEdge = step?.activeEdge?.replace('|', ' → ')

  return (
    <div className="algo-side-panels">
      <section className="panel algo-side-card">
        <div className="panel-header"><h3>Bieżąca operacja</h3></div>
        <div className="algo-side-body">
          <div className="algo-kv"><span>Wierzchołek</span><strong>{step?.current ?? '—'}</strong></div>
          <div className="algo-kv"><span>Krawędź</span><strong>{activeEdge ?? '—'}</strong></div>
          <div className="algo-kv"><span>Zdarzenie</span><strong>{step?.event ?? '—'}</strong></div>
          <p className="algo-op-message">{step?.message ?? notice}</p>
        </div>
      </section>

      <section className="panel algo-side-card">
        <div className="panel-header"><h3>{structureTitle(structureKind)}</h3></div>
        <div className="algo-side-body">
          <p className="algo-structure-hint">{structureHint(structureKind)}</p>
          {frontier.length === 0 ? (
            <div className="algo-empty-structure">Pusto</div>
          ) : (
            <div className={`algo-chips ${structureKind === 'stack' ? 'algo-chips-stack' : ''}`}>
              {frontier.map((item, index) => (
                <span key={`${item}-${index}`} className="algo-chip algo-chip-frontier">
                  {item}
                  {showDistances && structureKind === 'priority' ? (
                    <small>{formatDistance(distances[item])}</small>
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel algo-side-card">
        <div className="panel-header"><h3>Odwiedzone</h3></div>
        <div className="algo-side-body">
          {visited.length === 0 ? (
            <div className="algo-empty-structure">Brak</div>
          ) : (
            <div className="algo-chips">
              {visited.map(item => (
                <span key={item} className="algo-chip algo-chip-visited">{item}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {showDistances && (
        <section className="panel algo-side-card algo-distances">
          <div className="panel-header"><h3>Odległości</h3></div>
          <div className="algo-side-body algo-distance-grid">
            {vertices.map(vertex => {
              const changed = updates.has(vertex)
              const isCurrent = step?.current === vertex
              return (
                <div
                  key={vertex}
                  className={`algo-distance-row ${changed ? 'is-updated' : ''} ${isCurrent ? 'is-current' : ''}`}
                >
                  <span>{vertex}</span>
                  <strong>{formatDistance(distances[vertex])}</strong>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
