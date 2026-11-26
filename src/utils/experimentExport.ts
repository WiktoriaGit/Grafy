/**
 * Eksport wyników eksperymentów / badań do PDF i PNG.
 * Dane pochodzą wyłącznie z przekazanych pomiarów — bez fikcyjnych wniosków.
 * jsPDF / html-to-image ładowane dynamicznie dopiero przy eksporcie (code splitting).
 */
import type { jsPDF } from 'jspdf'
import {
  algorithmLabels,
  type AlgorithmId,
  type BenchResult,
} from './benchmark'
import {
  PROBLEM_GROUP_LABELS,
} from './benchEligibility'
import { topologyLabels } from './largeGraphs'
import {
  ALGORITHM_PAIR_BY_GROUP,
  HYPOTHESIS_LABELS,
  STUDY_KIND_LABELS,
  type ResearchStudy,
} from './researchStudy'
import {
  buildGroupInsights,
  complexityLabel,
  statusLabel,
} from './experimentInsights'

const FONT_REGULAR = '/fonts/NotoSans-Regular.ttf'
const FONT_BOLD = '/fonts/NotoSans-Bold.ttf'
const FONT_FAMILY = 'NotoSans'

let fontCache: { regular: string; bold: string } | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (fontCache) return fontCache
  const [regularBuf, boldBuf] = await Promise.all([
    fetch(FONT_REGULAR).then(r => {
      if (!r.ok) throw new Error('Nie udało się wczytać czcionki NotoSans-Regular.')
      return r.arrayBuffer()
    }),
    fetch(FONT_BOLD).then(r => {
      if (!r.ok) throw new Error('Nie udało się wczytać czcionki NotoSans-Bold.')
      return r.arrayBuffer()
    }),
  ])
  fontCache = {
    regular: arrayBufferToBase64(regularBuf),
    bold: arrayBufferToBase64(boldBuf),
  }
  return fontCache
}

async function loadJsPdfConstructor() {
  const mod = await import('jspdf')
  return mod.jsPDF
}

async function loadToPng() {
  const mod = await import('html-to-image')
  return mod.toPng
}

async function withPolishFont(doc: jsPDF): Promise<void> {
  const fonts = await loadFonts()
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular)
  doc.addFont('NotoSans-Regular.ttf', FONT_FAMILY, 'normal')
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold)
  doc.addFont('NotoSans-Bold.ttf', FONT_FAMILY, 'bold')
  doc.setFont(FONT_FAMILY, 'normal')
}

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

type PdfWriter = {
  doc: jsPDF
  y: number
  margin: number
  pageWidth: number
  pageHeight: number
  contentWidth: number
}

function createWriter(doc: jsPDF): PdfWriter {
  const margin = 16
  return {
    doc,
    y: margin,
    margin,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    contentWidth: doc.internal.pageSize.getWidth() - margin * 2,
  }
}

function ensureSpace(w: PdfWriter, needed: number) {
  if (w.y + needed <= w.pageHeight - w.margin) return
  w.doc.addPage()
  w.doc.setFont(FONT_FAMILY, 'normal')
  w.y = w.margin
}

function writeHeading(w: PdfWriter, text: string, size = 14) {
  ensureSpace(w, size + 8)
  w.doc.setFont(FONT_FAMILY, 'bold')
  w.doc.setFontSize(size)
  const lines = w.doc.splitTextToSize(text, w.contentWidth) as string[]
  w.doc.text(lines, w.margin, w.y)
  w.y += lines.length * (size * 0.45) + 4
  w.doc.setFont(FONT_FAMILY, 'normal')
}

function writeParagraph(w: PdfWriter, text: string, size = 10) {
  ensureSpace(w, 12)
  w.doc.setFont(FONT_FAMILY, 'normal')
  w.doc.setFontSize(size)
  const lines = w.doc.splitTextToSize(text, w.contentWidth) as string[]
  for (const line of lines) {
    ensureSpace(w, size * 0.5 + 2)
    w.doc.text(line, w.margin, w.y)
    w.y += size * 0.45 + 1.5
  }
  w.y += 2
}

function writeBullet(w: PdfWriter, text: string) {
  writeParagraph(w, `• ${text}`, 10)
}

function writeKeyValue(w: PdfWriter, key: string, value: string) {
  ensureSpace(w, 12)
  w.doc.setFontSize(10)
  w.doc.setFont(FONT_FAMILY, 'bold')
  w.doc.text(`${key}:`, w.margin, w.y)
  const keyWidth = w.doc.getTextWidth(`${key}: `)
  w.doc.setFont(FONT_FAMILY, 'normal')
  const lines = w.doc.splitTextToSize(value, w.contentWidth - keyWidth) as string[]
  w.doc.text(lines[0] ?? '', w.margin + keyWidth, w.y)
  w.y += 5
  for (let i = 1; i < lines.length; i++) {
    ensureSpace(w, 10)
    w.doc.text(lines[i], w.margin + keyWidth, w.y)
    w.y += 5
  }
  w.y += 1
}

function writeTable(w: PdfWriter, headers: string[], rows: string[][]) {
  const colCount = headers.length
  const colWidth = w.contentWidth / colCount
  const rowHeight = 7
  const fontSize = colCount > 7 ? 7 : 8

  const drawRow = (cells: string[], bold: boolean) => {
    ensureSpace(w, rowHeight + 2)
    w.doc.setFont(FONT_FAMILY, bold ? 'bold' : 'normal')
    w.doc.setFontSize(fontSize)
    cells.forEach((cell, i) => {
      const clipped = w.doc.splitTextToSize(cell, colWidth - 1.5) as string[]
      w.doc.text(clipped[0] ?? '', w.margin + i * colWidth, w.y)
    })
    w.y += rowHeight
  }

  drawRow(headers, true)
  w.doc.setDrawColor(180)
  w.doc.line(w.margin, w.y - 4, w.margin + w.contentWidth, w.y - 4)

  for (const row of rows) {
    drawRow(row, false)
  }
  w.y += 4
}

async function addChartImage(w: PdfWriter, dataUrl: string | null | undefined, caption: string) {
  if (!dataUrl) {
    writeParagraph(w, 'Brak wykresu do osadzenia (nie wykonano eksportu PNG lub sekcja wykresu była pusta).')
    return
  }
  ensureSpace(w, 90)
  writeHeading(w, caption, 12)
  const maxW = w.contentWidth
  const maxH = 85
  try {
    w.doc.addImage(dataUrl, 'PNG', w.margin, w.y, maxW, maxH)
    w.y += maxH + 6
  } catch {
    writeParagraph(w, 'Nie udało się osadzić obrazu wykresu w PDF.')
  }
}

/** Eksport elementu DOM (wykres) do PNG w wysokiej rozdzielczości. */
export async function exportElementPng(
  element: HTMLElement,
  filename: string,
  options?: { pixelRatio?: number },
): Promise<void> {
  const toPng = await loadToPng()
  const pixelRatio = options?.pixelRatio ?? 3
  const dataUrl = await toPng(element, {
    pixelRatio,
    cacheBust: true,
    backgroundColor: '#111116',
  })
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  triggerDownload(blob, filename.endsWith('.png') ? filename : `${filename}.png`)
}

export async function captureElementPngDataUrl(
  element: HTMLElement,
  options?: { pixelRatio?: number },
): Promise<string> {
  const toPng = await loadToPng()
  return toPng(element, {
    pixelRatio: options?.pixelRatio ?? 3,
    cacheBust: true,
    backgroundColor: '#111116',
  })
}

/** Model raportu PDF dla pojedynczej / wieloalgorytmowej sesji benchmarku. */
export type BenchReportMeta = {
  title: string
  generatedAt?: string
  graphParams?: {
    sourceLabel?: string
    topology?: string
    vertices?: number
    edges?: number
    density?: number
    directed?: boolean
    seed?: number
    repetitions?: number
  }
  notes?: string[]
}

export function buildBenchReportSections(rows: BenchResult[], meta: BenchReportMeta) {
  const ran = rows.filter(r => (r.status ?? 'ran') === 'ran')
  const algorithms = [...new Set(rows.map(r => algorithmLabels[r.algorithm]))]
  const sample = rows[0]
  const params = meta.graphParams ?? {}
  const insights = buildGroupInsights(rows)
    .map(g => g.summary)
    .filter(Boolean)

  return {
    title: meta.title,
    date: formatDate(meta.generatedAt ?? sample?.timestamp ?? new Date().toISOString()),
    algorithms,
    params: {
      source: params.sourceLabel
        ?? (sample ? (sample.sourceLabel ?? topologyLabels[sample.topology] ?? sample.topology) : '—'),
      topology: params.topology
        ?? (sample ? topologyLabels[sample.topology] ?? sample.topology : '—'),
      vertices: params.vertices ?? sample?.vertices,
      edges: params.edges ?? sample?.edges,
      density: params.density ?? sample?.density,
      directed: params.directed ?? sample?.directed,
      seed: params.seed ?? sample?.seed,
      repetitions: params.repetitions ?? sample?.repetitions,
    },
    tableHeaders: [
      'Algorytm', 'Status', 'V', 'E', 'Śr. ms', 'Med.', 'σ', 'Min', 'Max', 'Operacje', 'Złoż.',
    ],
    tableRows: rows.map(r => {
      const status = r.status ?? 'ran'
      // I3: dla error/skipped pokazujemy zmierzone czasy (jeśli są) + status z przyczyną.
      const showTiming = Number.isFinite(r.mean)
      return [
        algorithmLabels[r.algorithm],
        statusLabel(r),
        String(r.vertices),
        String(r.edges),
        showTiming ? (status === 'ran' ? fmt(r.mean) : `${fmt(r.mean)}*`) : '—',
        showTiming ? fmt(r.median) : '—',
        showTiming ? fmt(r.stdDev) : '—',
        showTiming ? fmt(r.min) : '—',
        showTiming ? fmt(r.max) : '—',
        showTiming ? String(r.operations) : '—',
        complexityLabel(r.algorithm),
      ]
    }),
    analysis: [
      ...insights,
      ...(meta.notes ?? []),
      ran.length === 0
        ? 'Brak ukończonych pomiarów — nie sformułowano wniosków ilościowych.'
        : `Liczba wierszy w raporcie: ${rows.length} (wykonane: ${ran.length}).`,
      rows.some(r => (r.status ?? 'ran') !== 'ran')
        ? 'Wiersze oznaczone * mają status pominięto/błąd — czasy zachowano, ale wykluczono z wniosków ilościowych.'
        : '',
    ].filter(Boolean),
  }
}

export async function exportBenchResultsPdf(
  rows: BenchResult[],
  meta: BenchReportMeta,
  chartDataUrl?: string | null,
): Promise<void> {
  if (!rows.length) throw new Error('Brak wyników do eksportu PDF.')
  const sections = buildBenchReportSections(rows, meta)
  const JsPDF = await loadJsPdfConstructor()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  await withPolishFont(doc)
  const w = createWriter(doc)

  writeHeading(w, 'GraphLab — raport eksperymentu', 16)
  writeHeading(w, sections.title, 13)
  writeKeyValue(w, 'Data wykonania', sections.date)
  writeKeyValue(w, 'Porównywane algorytmy', sections.algorithms.join(', '))
  writeKeyValue(w, 'Źródło / topologia', `${sections.params.source} / ${sections.params.topology}`)
  writeKeyValue(w, 'Parametry grafu',
    `V=${sections.params.vertices ?? '—'}, E=${sections.params.edges ?? '—'}, `
    + `gęstość=${sections.params.density != null ? `${sections.params.density}%` : '—'}, `
    + `skierowany=${sections.params.directed ? 'tak' : 'nie'}, seed=${sections.params.seed ?? '—'}`,
  )
  writeKeyValue(w, 'Liczba powtórzeń', String(sections.params.repetitions ?? '—'))

  writeHeading(w, 'Tabela wyników', 12)
  writeTable(w, sections.tableHeaders, sections.tableRows)

  await addChartImage(w, chartDataUrl, 'Wykres średnich czasów')

  writeHeading(w, 'Analiza wyników i wnioski', 12)
  for (const line of sections.analysis) writeBullet(w, line)
  writeParagraph(
    w,
    'Uwaga: wnioski opierają się wyłącznie na pomiarach zawartych w tym raporcie. '
    + 'Nie należy ich uogólniać poza zbadany zakres parametrów.',
    9,
  )

  const blob = doc.output('blob')
  triggerDownload(blob, `${safeFilename(sections.title || 'graphlab-eksperyment')}.pdf`)
}

export function buildResearchReportSections(study: ResearchStudy) {
  const [a, b] = ALGORITHM_PAIR_BY_GROUP[study.config.group]
  const flat = study.cases.flatMap(c => c.results.map(r => ({ case: c, result: r })))
  return {
    title: study.name,
    date: formatDate(study.createdAt),
    studyKind: STUDY_KIND_LABELS[study.config.studyKind],
    group: PROBLEM_GROUP_LABELS[study.config.group],
    algorithms: [algorithmLabels[a], algorithmLabels[b]],
    params: {
      repetitions: study.config.repetitions,
      seed: study.config.seed,
      topology: topologyLabels[study.config.topology] ?? study.config.topology,
      directed: study.config.directed,
      weightMin: study.config.weightMin,
      weightMax: study.config.weightMax,
      hypothesis: HYPOTHESIS_LABELS[study.config.hypothesis],
    },
    tableHeaders: [
      'Przypadek', 'Topo', 'V', 'E', 'Gęst.', 'Alg.', 'Śr.', 'Med.', 'σ', 'Status',
    ],
    tableRows: flat.map(({ case: c, result: r }) => {
      const status = r.status ?? 'ran'
      const showTiming = Number.isFinite(r.mean)
      return [
        c.plan.label,
        topologyLabels[c.plan.topology] ?? c.plan.topology,
        String(c.actualVertices),
        String(c.actualEdges),
        fmt(c.actualDensity, 1),
        algorithmLabels[r.algorithm],
        showTiming ? (status === 'ran' ? fmt(r.mean) : `${fmt(r.mean)}*`) : '—',
        showTiming ? fmt(r.median) : '—',
        showTiming ? fmt(r.stdDev) : '—',
        statusLabel(r),
      ]
    }),
    interpretation: study.interpretation.length
      ? study.interpretation
      : ['Brak automatycznej interpretacji — brak ukończonych pomiarów.'],
    hypothesisNote: study.hypothesisNote,
    hypothesisVerdict: study.hypothesisVerdict,
  }
}

export async function exportResearchStudyPdf(
  study: ResearchStudy,
  chartDataUrl?: string | null,
): Promise<void> {
  const sections = buildResearchReportSections(study)
  const JsPDF = await loadJsPdfConstructor()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  await withPolishFont(doc)
  const w = createWriter(doc)

  writeHeading(w, 'GraphLab — raport badania porównawczego', 16)
  writeHeading(w, sections.title, 13)
  writeKeyValue(w, 'Data wykonania', sections.date)
  writeKeyValue(w, 'Rodzaj badania', sections.studyKind)
  writeKeyValue(w, 'Kategoria problemu', sections.group)
  writeKeyValue(w, 'Porównywane algorytmy', sections.algorithms.join(' vs '))
  writeKeyValue(w, 'Parametry',
    `powtórzenia=${sections.params.repetitions}, seed=${sections.params.seed}, `
    + `topologia bazowa=${sections.params.topology}, skierowany=${sections.params.directed ? 'tak' : 'nie'}, `
    + `wagi ${sections.params.weightMin}–${sections.params.weightMax}`,
  )
  writeKeyValue(w, 'Hipoteza', sections.params.hypothesis)

  writeHeading(w, 'Tabela wyników', 12)
  writeTable(w, sections.tableHeaders, sections.tableRows)

  await addChartImage(w, chartDataUrl, 'Wykres wyników badania')

  writeHeading(w, 'Analiza wyników i wnioski', 12)
  for (const line of sections.interpretation) writeBullet(w, line)
  if (sections.hypothesisNote) {
    writeKeyValue(w, 'Status hipotezy', sections.hypothesisVerdict)
    writeParagraph(w, sections.hypothesisNote, 10)
  }
  writeParagraph(
    w,
    'Raport zawiera wyłącznie dane i wnioski wynikające z tej serii pomiarów GraphLab.',
    9,
  )

  const blob = doc.output('blob')
  triggerDownload(blob, `${safeFilename(study.name || 'graphlab-badanie')}.pdf`)
}

export type { AlgorithmId }
