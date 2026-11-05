import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Download,
  FileUp,
  Library,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'
import {
  deleteLibraryGraph,
  duplicateLibraryGraph,
  exportLibraryGraphs,
  exportSingleLibraryGraph,
  getLibraryGraph,
  importLibraryJson,
  librarySummary,
  listLibraryGraphs,
  renameLibraryGraph,
  saveLibraryGraph,
  type LibraryGraph,
} from '../library/graphLibrary'
import { saveWorkspace, type WorkspaceGraph } from '../workspace/graphWorkspace'
import './GraphLibraryPanel.css'

type Props = {
  /** Current editor/workspace graph to save into the library. */
  currentGraph: WorkspaceGraph | null
  /** Called after a library graph is loaded into the workspace. */
  onLoad?: (entry: LibraryGraph) => void
  /** Compact mode for Experiments / Algorithms side panels. */
  compact?: boolean
  title?: string
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pl-PL')
  } catch {
    return iso
  }
}

export default function GraphLibraryPanel({
  currentGraph,
  onLoad,
  compact = false,
  title = 'Biblioteka grafów',
}: Props) {
  const [entries, setEntries] = useState<LibraryGraph[]>(() => listLibraryGraphs())
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState('Grafy lokalne (localStorage) — przetrwają odświeżenie strony.')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    const next = listLibraryGraphs()
    setEntries(next)
    if (selectedId && !next.some(e => e.id === selectedId)) setSelectedId('')
  }

  useEffect(() => {
    refresh()
  }, [])

  const selected = entries.find(e => e.id === selectedId) ?? null

  const saveNew = () => {
    if (!currentGraph) {
      setStatus('Brak bieżącego grafu do zapisania.')
      return
    }
    try {
      const entry = saveLibraryGraph(name || `Graf ${entries.length + 1}`, currentGraph)
      setName(entry.name)
      setSelectedId(entry.id)
      refresh()
      setStatus(`Zapisano „${entry.name}” w bibliotece.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nie udało się zapisać.')
    }
  }

  const overwrite = () => {
    if (!currentGraph || !selectedId) {
      setStatus('Wybierz graf z listy, aby go nadpisać bieżącym obszarem roboczym.')
      return
    }
    if (!window.confirm(`Nadpisać „${selected?.name ?? selectedId}” bieżącym grafem?`)) return
    try {
      const entry = saveLibraryGraph(name || selected?.name || 'Graf', currentGraph, selectedId)
      setSelectedId(entry.id)
      refresh()
      setStatus(`Nadpisano „${entry.name}”.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nie udało się nadpisać.')
    }
  }

  const loadSelected = () => {
    const entry = selectedId ? getLibraryGraph(selectedId) : null
    if (!entry) {
      setStatus('Wybierz graf z listy.')
      return
    }
    saveWorkspace(entry.graph, { source: 'file' })
    onLoad?.(entry)
    setStatus(`Wczytano „${entry.name}” do obszaru roboczego.`)
  }

  const renameSelected = () => {
    if (!selectedId) return
    const next = window.prompt('Nowa nazwa grafu:', selected?.name ?? '')
    if (next == null) return
    try {
      const entry = renameLibraryGraph(selectedId, next)
      setName(entry.name)
      refresh()
      setStatus(`Zmieniono nazwę na „${entry.name}”.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nie udało się zmienić nazwy.')
    }
  }

  const copySelected = () => {
    if (!selectedId) return
    try {
      const entry = duplicateLibraryGraph(selectedId)
      setSelectedId(entry.id)
      setName(entry.name)
      refresh()
      setStatus(`Utworzono kopię „${entry.name}”.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nie udało się skopiować.')
    }
  }

  const removeSelected = () => {
    if (!selectedId || !selected) return
    if (!window.confirm(`Usunąć „${selected.name}” z biblioteki? Tej operacji nie można cofnąć.`)) return
    deleteLibraryGraph(selectedId)
    setSelectedId('')
    refresh()
    setStatus(`Usunięto „${selected.name}”.`)
  }

  const exportSelected = () => {
    try {
      const json = selectedId ? exportSingleLibraryGraph(selectedId) : exportLibraryGraphs()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedId ? `graphlab-${selected?.name || 'graf'}.json` : 'graphlab-biblioteka.json'
      a.click()
      URL.revokeObjectURL(url)
      setStatus(selectedId ? 'Wyeksportowano wybrany graf.' : 'Wyeksportowano całą bibliotekę.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Eksport nieudany.')
    }
  }

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const text = await file.text()
      const imported = importLibraryJson(text)
      refresh()
      if (imported[0]) setSelectedId(imported[0].id)
      setStatus(`Zaimportowano ${imported.length} graf(ów) do biblioteki.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import nieudany.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={`gl-panel ${compact ? 'gl-panel-compact' : ''}`}>
      <div className="gl-panel-header">
        <h3><Library size={16} /> {title}</h3>
        <span className="section-chip">{entries.length}</span>
      </div>

      <div className="gl-panel-body">
        {!compact && (
          <label className="gl-field">
            Nazwa przy zapisie
            <input
              type="text"
              maxLength={120}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="np. Sieć kampusu"
            />
          </label>
        )}

        <label className="gl-field">
          Zapisane grafy
          <select value={selectedId} onChange={e => {
            setSelectedId(e.target.value)
            const entry = entries.find(item => item.id === e.target.value)
            if (entry) setName(entry.name)
          }}
          >
            <option value="">— wybierz —</option>
            {entries.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({librarySummary(entry)})
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <p className="gl-meta">
            ID: <code>{selected.id.slice(0, 8)}…</code>
            {' · '}zapisano {formatDate(selected.createdAt)}
            {' · '}zmieniono {formatDate(selected.updatedAt)}
          </p>
        )}

        <div className="gl-actions">
          {!compact && (
            <>
              <button type="button" className="gl-btn gl-btn-primary" onClick={saveNew} disabled={!currentGraph}>
                <Save size={15} /> Zapisz jako nowy
              </button>
              <button type="button" className="gl-btn" onClick={overwrite} disabled={!currentGraph || !selectedId}>
                <Save size={15} /> Nadpisz wybrany
              </button>
            </>
          )}
          <button type="button" className="gl-btn gl-btn-primary" onClick={loadSelected} disabled={!selectedId}>
            <FileUp size={15} /> Wczytaj
          </button>
          {!compact && (
            <>
              <button type="button" className="gl-btn" onClick={renameSelected} disabled={!selectedId}>
                <Pencil size={15} /> Zmień nazwę
              </button>
              <button type="button" className="gl-btn" onClick={copySelected} disabled={!selectedId}>
                <Copy size={15} /> Kopiuj
              </button>
              <button type="button" className="gl-btn" onClick={removeSelected} disabled={!selectedId}>
                <Trash2 size={15} /> Usuń
              </button>
            </>
          )}
          <button type="button" className="gl-btn" onClick={exportSelected}>
            <Download size={15} /> Eksport JSON
          </button>
          <button type="button" className="gl-btn" onClick={() => fileRef.current?.click()}>
            <FileUp size={15} /> Import JSON
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={e => void importFile(e.target.files?.[0])}
        />
        <p className="gl-status" role="status">{status}</p>
      </div>
    </div>
  )
}
