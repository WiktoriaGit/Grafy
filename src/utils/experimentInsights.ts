import {
  algorithmLabels,
  type AlgorithmId,
  type BenchResult,
} from './benchmark'
import {
  ALGORITHM_PROBLEM_GROUP,
  PROBLEM_GROUP_LABELS,
  type AlgorithmProblemGroup,
} from './benchEligibility'
import { benchComplexity } from './pairCompare'

export type GroupInsight = {
  group: AlgorithmProblemGroup
  label: string
  ran: BenchResult[]
  skipped: BenchResult[]
  fasterId: AlgorithmId | 'tie' | null
  summary: string
}

export function buildGroupInsights(results: BenchResult[]): GroupInsight[] {
  const groups: AlgorithmProblemGroup[] = ['search', 'shortest', 'mst']
  return groups.map(group => {
    const rows = results.filter(r => ALGORITHM_PROBLEM_GROUP[r.algorithm] === group)
    const ran = rows.filter(r => (r.status ?? 'ran') === 'ran')
    const skipped = rows.filter(r => (r.status ?? 'ran') !== 'ran')
    let fasterId: AlgorithmId | 'tie' | null = null
    let summary = ''

    if (ran.length === 0) {
      summary = skipped.length
        ? `Brak wykonanych pomiarów w kategorii „${PROBLEM_GROUP_LABELS[group]}” (wszystkie pominięte lub z błędem).`
        : `Brak algorytmów z kategorii „${PROBLEM_GROUP_LABELS[group]}” w tej sesji.`
    } else if (ran.length === 1) {
      fasterId = ran[0].algorithm
      summary = `W kategorii „${PROBLEM_GROUP_LABELS[group]}” wykonano tylko ${algorithmLabels[ran[0].algorithm]} `
        + `(średnia ${ran[0].mean.toFixed(3)} ms) — brak drugiego pomiaru do porównania w tej grupie.`
    } else {
      const sorted = [...ran].sort((a, b) => a.mean - b.mean)
      const best = sorted[0]
      const second = sorted[1]
      if (Math.abs(best.mean - second.mean) < 1e-9) {
        fasterId = 'tie'
        summary = `W kategorii „${PROBLEM_GROUP_LABELS[group]}” średnie czasy najlepszych pomiarów są równe.`
      } else {
        fasterId = best.algorithm
        const diff = second.mean - best.mean
        const pct = second.mean > 0 ? (diff / second.mean) * 100 : null
        summary = `W kategorii „${PROBLEM_GROUP_LABELS[group]}” szybszy w tym pomiarze był ${algorithmLabels[best.algorithm]} `
          + `(${best.mean.toFixed(3)} ms) względem ${algorithmLabels[second.algorithm]} (${second.mean.toFixed(3)} ms)`
          + (pct != null ? ` — różnica ${diff.toFixed(3)} ms (~${pct.toFixed(1)}%).` : '.')
        summary += ' To nie oznacza „najlepszego” algorytmu uniwersalnie — uwzględnij poprawność i ograniczenia problemu.'
      }
    }

    return {
      group,
      label: PROBLEM_GROUP_LABELS[group],
      ran,
      skipped,
      fasterId,
      summary,
    }
  }).filter(g => g.ran.length + g.skipped.length > 0)
}

export function complexityLabel(id: AlgorithmId): string {
  return benchComplexity(id)?.time ?? '—'
}

export function statusLabel(result: BenchResult): string {
  const status = result.status ?? 'ran'
  if (status === 'ran') return 'wykonano'
  if (status === 'skipped') return 'pominięto'
  return 'błąd'
}
