/**
 * Bezpieczna edycja pól liczbowych i list liczb.
 * Podczas pisania trzymamy string; parsowanie / limity dopiero przy blur lub uruchomieniu.
 */

export type ParseOk<T> = { ok: true; value: T }
export type ParseErr = { ok: false; message: string }
export type ParseResult<T> = ParseOk<T> | ParseErr

export type IntFieldOptions = {
  label?: string
  min?: number
  max?: number
  integer?: boolean
  allowEmpty?: boolean
}

export type NumberListOptions = {
  label?: string
  min?: number
  max?: number
  minCount?: number
  maxCount?: number
  integer?: boolean
}

/** Formatuje listę liczb do wyświetlenia (wartości domyślne / po commit). */
export function formatNumberList(values: number[]): string {
  return values.map(v => String(v)).join(', ')
}

/** Czy draft wygląda jak niepełna, ale dozwolona edycja liczby (w tym pusty string). */
export function isNumericDraft(raw: string): boolean {
  const t = raw.trim()
  if (t === '') return true
  // pozwala: "-", ".", "-.", "0.", "12,", nie: "12a"
  return /^-?\d*(?:[.,]\d*)?$/.test(t.replace(/\s/g, ''))
}

/**
 * Czy draft listy jest akceptowalny podczas pisania
 * (puste tokeny, końcowy przecinek, spacje).
 */
export function isNumberListDraft(raw: string): boolean {
  if (raw.trim() === '') return true
  // same cyfry, spacje, przecinki, kropki, minusy
  if (!/^[\d\s,.-]+$/.test(raw)) return false
  const parts = raw.split(',')
  return parts.every(part => {
    const t = part.trim()
    if (t === '') return true
    return /^-?\d*(?:[.,]\d*)?$/.test(t)
  })
}

function normalizeDecimal(token: string): string {
  return token.trim().replace(',', '.')
}

/** Parsuje pojedynczą liczbę; pusty string → błąd (chyba że allowEmpty). */
export function parseNumberField(raw: string, options: IntFieldOptions = {}): ParseResult<number | null> {
  const label = options.label ?? 'Wartość'
  const trimmed = raw.trim()
  if (trimmed === '') {
    if (options.allowEmpty) return { ok: true, value: null }
    return { ok: false, message: `${label}: pole nie może być puste.` }
  }
  const normalized = normalizeDecimal(trimmed)
  if (normalized === '-' || normalized === '.' || normalized === '-.') {
    return { ok: false, message: `${label}: dokończ wpisywanie liczby.` }
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) {
    return { ok: false, message: `${label}: podaj poprawną liczbę.` }
  }
  if (options.integer !== false && !Number.isInteger(n)) {
    return { ok: false, message: `${label}: wymagana liczba całkowita.` }
  }
  if (options.min != null && n < options.min) {
    return { ok: false, message: `${label}: minimum to ${options.min}.` }
  }
  if (options.max != null && n > options.max) {
    return { ok: false, message: `${label}: maksimum to ${options.max}.` }
  }
  return { ok: true, value: n }
}

export function parseIntField(raw: string, options: IntFieldOptions = {}): ParseResult<number> {
  const result = parseNumberField(raw, { ...options, integer: options.integer ?? true })
  if (!result.ok) return result
  if (result.value == null) {
    return { ok: false, message: `${options.label ?? 'Wartość'}: pole nie może być puste.` }
  }
  return { ok: true, value: result.value }
}

/**
 * Parsuje listę liczb oddzielonych przecinkami.
 * Ignoruje puste segmenty (np. końcowy przecinek po commit).
 */
export function parseNumberList(raw: string, options: NumberListOptions = {}): ParseResult<number[]> {
  const label = options.label ?? 'Lista'
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { ok: false, message: `${label}: podaj co najmniej jedną liczbę.` }
  }
  const tokens = trimmed.split(',').map(t => t.trim()).filter(Boolean)
  if (!tokens.length) {
    return { ok: false, message: `${label}: podaj co najmniej jedną liczbę.` }
  }
  if (options.minCount != null && tokens.length < options.minCount) {
    return { ok: false, message: `${label}: wymagane co najmniej ${options.minCount} wartości.` }
  }
  if (options.maxCount != null && tokens.length > options.maxCount) {
    return { ok: false, message: `${label}: maksymalnie ${options.maxCount} wartości.` }
  }

  const values: number[] = []
  for (const token of tokens) {
    const parsed = parseNumberField(token, {
      label,
      min: options.min,
      max: options.max,
      integer: options.integer ?? true,
    })
    if (!parsed.ok) return parsed
    if (parsed.value == null) {
      return { ok: false, message: `${label}: pomiń puste pozycje lub dokończ listę.` }
    }
    values.push(parsed.value)
  }
  return { ok: true, value: values }
}

/** Aktualizuje draft listy tylko gdy tekst jest jeszcze legalną niedokończoną edycją. */
export function acceptNumberListDraft(previous: string, next: string): string {
  return isNumberListDraft(next) ? next : previous
}

/** Aktualizuje draft liczby tylko gdy tekst jest legalną niedokończoną edycją. */
export function acceptNumericDraft(previous: string, next: string): string {
  return isNumericDraft(next) ? next : previous
}
