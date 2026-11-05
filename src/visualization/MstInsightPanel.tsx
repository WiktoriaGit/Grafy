import { useEffect, useRef, useState } from 'react'
import type { MSTAlgorithm, MSTEdge, MSTStep } from '../algorithms/mstAlgorithms'
import { getMstPseudocode } from './pseudocode'

type TabId = 'operation' | 'structures' | 'pseudo' | 'history'

type Props = {
  algorithm: MSTAlgorithm
  step?: MSTStep
  steps: MSTStep[]
  stepIndex: number
  edges: MSTEdge[]
  vertices: string[]
  notice: string
  onSelectStep: (index: number) => void
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'operation', label: 'Operacja' },
  { id: 'structures', label: 'Struktury danych' },
  { id: 'pseudo', label: 'Pseudokod' },
  { id: 'history', label: 'Historia' },
]

function edgeName(edges: MSTEdge[], id: number | null | undefined) {
  if (id == null) return '—'
  const edge = edges.find(item => item.id === id)
  return edge ? `${edge.source}–${edge.target} (${edge.weight})` : `#${id}`
}

export default function MstInsightPanel({
  algorithm,
  step,
  steps,
  stepIndex,
  edges,
  vertices,
  notice,
  onSelectStep,
}: Props) {
  const [tab, setTab] = useState<TabId>('operation')
  const historyRef = useRef<HTMLButtonElement | null>(null)
  const pseudo = getMstPseudocode(algorithm)
  const candidates = step?.candidates ?? []
  const components = step?.components
  const sortedOrder = step?.sortedOrder ?? []

  useEffect(() => {
    historyRef.current?.scrollIntoView({ block: 'nearest' })
  }, [stepIndex, tab])

  return (
    <aside className="panel algo-insight">
      <div className="algo-insight-tabs" role="tablist" aria-label="Panele edukacyjne MST">
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
              <div><span>Krawędź</span><strong>{edgeName(edges, step?.considered)}</strong></div>
              <div><span>Waga drzewa/lasu</span><strong>{step ? step.treeWeight : '—'}</strong></div>
              <div><span>Zdarzenie</span><strong>{step?.event ?? '—'}</strong></div>
              <div><span>Linia pseudokodu</span><strong>{step ? step.pseudoLine : '—'}</strong></div>
            </div>
            <p className="algo-operation-summary">{step?.message ?? notice}</p>
            <p className="algo-operation-detail">{step?.detail ?? 'Uruchom Prima lub Kruskala, aby zobaczyć uzasadnienie każdej decyzji.'}</p>
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
              <h4>Wierzchołki w drzewie / lesie</h4>
              {(step?.visited.length ?? 0) === 0 ? (
                <div className="algo-empty-structure">Brak</div>
              ) : (
                <div className="algo-chips">
                  {step!.visited.map(item => (
                    <span key={item} className="algo-chip algo-chip-visited">{item}</span>
                  ))}
                </div>
              )}
            </section>

            {algorithm === 'prim' && (
              <section>
                <h4>Krawędzie kandydackie (przekrój)</h4>
                {candidates.length === 0 ? (
                  <div className="algo-empty-structure">Brak kandydatów</div>
                ) : (
                  <div className="algo-chips">
                    {candidates.map(id => (
                      <span key={id} className="algo-chip algo-chip-frontier">{edgeName(edges, id)}</span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {algorithm === 'kruskal' && (
              <>
                <section>
                  <h4>Kolejność krawędzi (po wadze)</h4>
                  {sortedOrder.length === 0 ? (
                    <div className="algo-empty-structure">Brak</div>
                  ) : (
                    <div className="algo-chips">
                      {sortedOrder.map(id => (
                        <span
                          key={id}
                          className={`algo-chip ${step?.considered === id ? 'algo-chip-frontier' : 'algo-chip-visited'}`}
                        >
                          {edgeName(edges, id)}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
                <section>
                  <h4>Union–Find (reprezentanci)</h4>
                  {!components ? (
                    <div className="algo-empty-structure">Brak stanu</div>
                  ) : (
                    <div className="algo-table-wrap">
                      <table className="algo-state-table">
                        <thead>
                          <tr>
                            <th>v</th>
                            <th>find(v)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vertices.map(vertex => (
                            <tr key={vertex} className={step?.activeEdge?.includes(vertex) ? 'is-current' : ''}>
                              <td>{vertex}</td>
                              <td>{components[vertex]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            <section>
              <h4>Wybrane krawędzie</h4>
              {(step?.selected.length ?? 0) === 0 ? (
                <div className="algo-empty-structure">Pusto</div>
              ) : (
                <div className="algo-chips">
                  {step!.selected.map(id => (
                    <span key={id} className="algo-chip algo-chip-visited">{edgeName(edges, id)}</span>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'pseudo' && (
          <div className="algo-pseudo-panel">
            <h4>Pseudokod — {algorithm === 'prim' ? 'PRIM' : 'KRUSKAL'}</h4>
            <ol className="algo-pseudo-list">
              {pseudo.map(line => (
                <li key={line.id} className={step?.pseudoLine === line.id ? 'is-active' : ''}>
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
