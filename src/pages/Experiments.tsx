import { useEffect, useRef, useState } from 'react'
import { Activity, BarChart3, Download, FlaskConical, Network, Play, Trash2 } from 'lucide-react'
import { algorithmLabels, exportCSV, loadResults, saveResults, type AlgorithmId, type BenchResult } from '../utils/benchmark'
import { algorithmLimit, graphSizes, MAX_EDGES } from '../utils/largeGraphs'
import './Experiments.css'

const ids:AlgorithmId[]=['bfs','dfs','dijkstra','bellman']
const fmt=(n:number)=>n.toLocaleString('pl-PL',{minimumFractionDigits:3,maximumFractionDigits:3})
export default function Experiments(){
  const [vertices,setVertices]=useState(100)
  const [seed,setSeed]=useState(12345)
  const workerRef=useRef<Worker|null>(null)
  useEffect(()=>()=>workerRef.current?.terminate(),[])
  const [density,setDensity]=useState(10)
  const [repetitions,setRepetitions]=useState(10)
  const [selected,setSelected]=useState<AlgorithmId[]>(['bfs','dfs','dijkstra','bellman'])
  const [results,setResults]=useState<BenchResult[]>(loadResults)
  const [busy,setBusy]=useState(false)
  const [status,setStatus]=useState('')
  const toggle=(id:AlgorithmId)=>setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])
  const expectedEdges=Math.min(MAX_EDGES,Math.max(vertices-1,Math.round(vertices*(vertices-1)/2*density/100)))
  const actualDensity=100*expectedEdges/(vertices*(vertices-1)/2)
  const limitation=selected.map(id=>algorithmLimit(id,vertices,expectedEdges)).find(Boolean)
  const cancel=()=>{workerRef.current?.terminate();workerRef.current=null;setBusy(false);setStatus('Anulowano obliczenia.')}
  const run=()=>{
    if(!selected.length){setStatus('Wybierz przynajmniej jeden algorytm.');return}
    if(limitation){setStatus(limitation);return}
    setBusy(true);setStatus('Uruchamianie osobnego wątku...')
    const worker=new Worker(new URL('../workers/benchmark.worker.ts',import.meta.url),{type:'module'})
    workerRef.current=worker
    worker.onmessage=(event:MessageEvent<{type:string;message?:string;results?:BenchResult[];edges?:number}>)=>{
      const message=event.data
      if(message.type==='progress'){setStatus(message.message||'Trwa obliczanie...');return}
      if(message.type==='complete'){
        const next=message.results||[]
        setResults(previous=>{const all=[...next,...previous].slice(0,200);saveResults(all);return all})
        setStatus(`Zakończono ${next.length} pomiarów na grafie z ${message.edges} krawędziami.`)
      }else{setStatus(message.message||'Błąd eksperymentu.')}
      worker.terminate();workerRef.current=null;setBusy(false)
    }
    worker.onerror=()=>{setStatus('Błąd wątku obliczeniowego.');worker.terminate();workerRef.current=null;setBusy(false)}
    worker.postMessage({vertices,density,seed,repetitions,selected})
  }
  const clear=()=>{if(!window.confirm('Usunąć historię pomiarów?'))return;setResults([]);saveResults([]);setStatus('Historia usunięta.')}
  return <div className="page-container">
    <div className="page-heading"><div><div className="eyebrow"><FlaskConical size={14}/> PERFORMANCE LAB</div><h1>Eksperymenty</h1><p>Rzeczywiste pomiary czasu działania algorytmów na generowanych grafach.</p></div><span className="version-pill">Moduł badawczy</span></div>
    <div className="bench-grid">
      <section className="panel bench-controls"><div className="panel-header"><h3><Network size={18}/> Konfiguracja grafu</h3></div>
        <div className="bench-form">
          <label htmlFor="bench-n">Liczba wierzchołków: <b>{vertices}</b></label>
          <select id="bench-n" value={vertices} disabled={busy} onChange={e=>setVertices(Number(e.target.value))}>{graphSizes.map(n=><option key={n} value={n}>{n.toLocaleString('pl-PL')} wierzchołków</option>)}</select>
          <label htmlFor="bench-d">Docelowa gęstość: <b>{density}%</b></label>
          <input id="bench-d" type="range" min="1" max="30" step="1" value={density} disabled={busy} onChange={e=>setDensity(Number(e.target.value))}/>
          <label htmlFor="bench-r">Liczba powtórzeń</label>
          <select id="bench-r" value={repetitions} disabled={busy} onChange={e=>setRepetitions(Number(e.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option></select>
          <label htmlFor="bench-seed">Ziarno generatora</label>
          <input className="bench-number" id="bench-seed" type="number" step="1" value={seed} disabled={busy} onChange={e=>setSeed(Number(e.target.value))}/>
          <p className="bench-hint">Graf nieskierowany, spójny, wagi 1–20. Przewidywana liczba krawędzi: <b>{expectedEdges.toLocaleString('pl-PL')}</b>. Rzeczywista gęstość: <b>{actualDensity.toFixed(3)}%</b>. Limit bezpieczeństwa: {MAX_EDGES.toLocaleString('pl-PL')} krawędzi. To samo ziarno oznacza identyczny graf dla tych samych parametrów.</p>
          {limitation&&<p className="bench-warning" role="alert">{limitation} Odznacz ten algorytm albo wybierz mniejszy graf.</p>}
          <div className="bench-subtitle">ALGORYTMY</div>
          {ids.map(id=><label className="bench-check" key={id}><input type="checkbox" checked={selected.includes(id)} disabled={busy} onChange={()=>toggle(id)}/><span>{algorithmLabels[id]}</span></label>)}
          <button className="btn btn-primary bench-run" disabled={busy||!!limitation} onClick={run}><Play size={16}/>{busy?'Trwa pomiar...':'Uruchom eksperyment'}</button>
          {busy&&<button className="btn btn-outline bench-run" onClick={cancel}>Anuluj obliczenia</button>}
          <div className="bench-status" role="status">{status||'Gotowe do uruchomienia pomiarów.'}</div>
        </div>
      </section>
      <section className="panel bench-output"><div className="panel-header"><h3><Activity size={18}/> Ostatnie wyniki</h3><span className="section-chip">Czas w ms</span></div>
        {results.length===0?<div className="bench-empty"><BarChart3 size={40}/><h3>Brak wyników</h3><p>Skonfiguruj graf i uruchom pierwszy eksperyment.</p></div>:<div className="bench-result-list">{results.slice(0,4).map(r=><div className="bench-result" key={r.id}><div><strong>{algorithmLabels[r.algorithm]}</strong><small>{r.vertices} wierzchołków · {r.edges} krawędzi · {r.repetitions} powtórzeń</small></div><div className="bench-time">{fmt(r.mean)} <span>ms</span></div></div>)}</div>}
        <div className="bench-note">BFS i DFS analizują osiągalność, a Dijkstra i Bellman–Ford najkrótsze ścieżki. Obliczenia odbywają się w Web Workerze, poza głównym wątkiem interfejsu. Czasy zależą od sprzętu i obciążenia systemu. Obecna Dijkstra używa O(V²); Bellman–Ford może być kosztowny dla dużych grafów.</div>
      </section>
    </div>
    <section className="panel bench-history"><div className="panel-header"><h3><BarChart3 size={18}/> Historia eksperymentów ({results.length})</h3><div className="bench-actions"><button className="btn btn-outline" disabled={!results.length||busy} onClick={()=>exportCSV(results)}><Download size={15}/> CSV</button><button className="btn btn-outline" disabled={!results.length||busy} onClick={clear}><Trash2 size={15}/> Wyczyść</button></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Algorytm</th><th>V</th><th>E</th><th>Średni (ms)</th><th>Min (ms)</th><th>Max (ms)</th><th>Operacje</th></tr></thead><tbody>{results.length===0?<tr><td colSpan={7} className="bench-no-data">Brak zapisanych pomiarów.</td></tr>:results.map(r=><tr key={r.id}><td>{algorithmLabels[r.algorithm]}</td><td>{r.vertices}</td><td>{r.edges}</td><td>{fmt(r.mean)}</td><td>{fmt(r.min)}</td><td>{fmt(r.max)}</td><td>{r.operations.toLocaleString('pl-PL')}</td></tr>)}</tbody></table></div>
    </section>
  </div>
}
