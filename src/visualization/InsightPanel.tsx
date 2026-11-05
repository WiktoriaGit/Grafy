import { useEffect, useRef, useState } from 'react'
import {
  formatDistance,
  type Algorithm,
  type Step,
  type StructureKind,
} from '../algorithms/graphAlgorithms'
import { getPseudocode } from './pseudocode'

type TabId = 'operation' | 'structures' | 'pseudo' | 'history'

type Props = {
  algorithm: Algorithm
  step?: Step
  steps: Step[]
  stepIndex: number
  structureKind: StructureKind
  vertices: string[]
  notice: string
  showDistances: boolean
  onSelectStep: (index: number) => void
}

function structureTitle(kind: StructureKind) {
  if (kind === 'queue') return 'Kolejka (FIFO)'
  if (kind === 'stack') return 'Stos (LIFO)'
  if (kind === 'priority') return 'Kandydaci według odległości'
  return 'Wierzchołki o skończonej odległości'
}

function structureHint(kind: StructureKind) {
  if (kind === 'queue') return 'Lewa strona = początek kolejki (kolejny element do pobrania).'
  if (kind === 'stack') return 'Prawa strona = szczyt stosu (kolejny element do pobrania).'
  if (kind === 'priority') return 'Posortowane rosnąco po bieżącej odległości d(·).'
  return 'Bellman–Ford nie używa kolejki priorytetowej — poniżej widać wierzchołki ze skończonym d(·). Kluczowa jest tablica odległości i poprzedników oraz historia relaksacji.'
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'operation', label: 'Operacja' },
  { id: 'structures', label: 'Struktury danych' },
  { id: 'pseudo', label: 'Pseudokod' },
  { id: 'history', label: 'Historia' },
]

export default function InsightPanel({
  algorithm,
  step,
  steps,
  stepIndex,
  structureKind,
  vertices,
  notice,
  showDistances,
  onSelectStep,
}: Props) {
  const [tab, setTab] = useState<TabId>('operation')
  const historyRef = useRef<HTMLButtonElement | null>(null)
  const pseudo = getPseudocode(algorithm)
  const frontier = step?.frontier ?? []
  const visited = step?.visited ?? []
  const distances = step?.distances
  const parents = step?.parents
  const updates = new Set((step?.distanceUpdates ?? []).map(item => item.vertex))
  const activeEdge = step?.activeEdge?.replace('|', ' → ')

  useEffect(() => {
    historyRef.current?.scrollIntoView({ block: 'nearest' })
  }, [stepIndex, tab])

  return (
    <aside className="panel algo-insight">
      <div className="algo-insight-tabs" role="tablist" aria-label="Panele edukacyjne">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="algo-insight-body">
        {tab === 'operation' && (
          <div className="algo-operation-panel">
            <div className="algo-operation-kicker">Bieżąca operacja</div>
            <h3>{step?.title ?? 'Brak uruchomionego przebiegu'}</h3>
            <div className="algo-operation-meta">
              <div><span>Wierzchołek</span><strong>{step?.current ?? '—'}</strong></div>
              <div><span>Krawędź</span><strong>{activeEdge ?? '—'}</strong></div>
              <div><span>Zdarzenie</span><strong>{step?.event ?? '—'}</strong></div>
              <div><span>Linia pseudokodu</span><strong>{step ? step.pseudoLine : '—'}</strong></div>
            </div>
            <p className="algo-operation-summary">{step?.message ?? notice}</p>
            <p className="algo-operation-detail">{step?.detail ?? 'Uruchom algorytm, aby zobaczyć szczegółowy opis każdej operacji oraz uzasadnienie decyzji.'}</p>
            {step?.reason && (
              <div className="algo-operation-reason">
                <strong>Dlaczego?</strong>
                <p>{step.reason}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'structures' && (
          <div className="algo-structures-panel">
            <section>
              <h4>{structureTitle(structureKind)}</h4>
              <p className="algo-structure-hint">{structureHint(structureKind)}</p>
              {frontier.length === 0 ? (
                <div className="algo-empty-structure">Pusto</div>
              ) : (
                <div className={`algo-chips ${structureKind === 'stack' ? 'algo-chips-stack' : ''}`}>
                  {frontier.map((item, index) => (
                    <span key={`${item}-${index}`} className="algo-chip algo-chip-frontier">
                      {item}
                      {showDistances && structureKind === 'priority' ? (
                        <small>{formatDistance(distances?.[item])}</small>
                      ) : null}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h4>Odwiedzone / ustalone</h4>
              {visited.length === 0 ? (
                <div className="algo-empty-structure">Brak</div>
              ) : (
                <div className="algo-chips">
                  {visited.map(item => (
                    <span key={item} className="algo-chip algo-chip-visited">{item}</span>
                  ))}
                </div>
              )}
            </section>

            {showDistances && (
              <section>
                <h4>Tablica odległości i poprzedników</h4>
                <div className="algo-table-wrap">
                  <table className="algo-state-table">
                    <thead>
                      <tr>
                        <th>v</th>
                        <th>d(v)</th>
                        <th>π(v)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vertices.map(vertex => {
                        const changed = updates.has(vertex)
                        const isCurrent = step?.current === vertex
                        return (
                          <tr
                            key={vertex}
                            className={`${changed ? 'is-updated' : ''} ${isCurrent ? 'is-current' : ''}`}
                          >
                            <td>{vertex}</td>
                            <td>{formatDistance(distances?.[vertex])}</td>
                            <td>{parents?.[vertex] ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'pseudo' && (
          <div className="algo-pseudo-panel">
            <h4>Pseudokod — {algorithm.toUpperCase()}</h4>
            <ol className="algo-pseudo-list">
              {pseudo.map(line => (
                <li
                  key={line.id}
                  className={step?.pseudoLine === line.id ? 'is-active' : ''}
                >
                  <span className="algo-pseudo-num">{line.id}</span>
                  <code>{line.text}</code>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === 'history' && (
          <div className="algo-history-panel">
            <h4>Historia operacji</h4>
            {steps.length === 0 ? (
              <div className="algo-empty-structure">Brak historii — uruchom algorytm.</div>
            ) : (
              <div className="algo-history-list">
                {steps.map((item, index) => (
                  <button
                    key={`${item.event}-${index}`}
                    type="button"
                    ref={index === stepIndex ? historyRef : undefined}
                    className={`algo-history-item ${index === stepIndex ? 'is-active' : ''}`}
                    aria-current={index === stepIndex ? 'step' : undefined}
                    aria-label={`Krok ${index + 1}: ${item.title}`}
                    onClick={() => onSelectStep(index)}
                  >
                    <span className="algo-history-index">{index + 1}</span>
                    <span className="algo-history-copy">
                      <strong>{item.title}</strong>
                      <small>{item.message}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
