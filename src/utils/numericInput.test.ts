import { describe, expect, it } from 'vitest'
import {
  acceptNumberListDraft,
  acceptNumericDraft,
  formatNumberList,
  isNumberListDraft,
  isNumericDraft,
  parseIntField,
  parseNumberList,
} from './numericInput'

describe('numericInput — edycja bez natychmiastowej normalizacji', () => {
  it('pozwala całkowicie wyczyścić pole (pusty string)', () => {
    expect(isNumericDraft('')).toBe(true)
    expect(acceptNumericDraft('20', '')).toBe('')
    expect(parseIntField('').ok).toBe(false)
  })

  it('wpisanie nowej wartości nie dokleja wiodącego zera', () => {
    expect(acceptNumericDraft('', '2')).toBe('2')
    expect(acceptNumericDraft('2', '20')).toBe('20')
    expect(parseIntField('20')).toEqual({ ok: true, value: 20 })
    expect(parseIntField('020')).toEqual({ ok: true, value: 20 })
  })

  it('pozwala swobodnie wpisywać przecinki w listach', () => {
    expect(isNumberListDraft('100,')).toBe(true)
    expect(isNumberListDraft('100, 200,')).toBe(true)
    expect(isNumberListDraft('100,200,400,800')).toBe(true)
    expect(acceptNumberListDraft('100', '100,')).toBe('100,')
    expect(acceptNumberListDraft('100,', '100,2')).toBe('100,2')
    expect(acceptNumberListDraft('100,2', '100,20')).toBe('100,20')
  })

  it('poprawnie parsuje listy liczb przy zatwierdzeniu', () => {
    expect(parseNumberList('100,200,400,800')).toEqual({
      ok: true,
      value: [100, 200, 400, 800],
    })
    expect(parseNumberList('1000, 2000, 3000')).toEqual({
      ok: true,
      value: [1000, 2000, 3000],
    })
    expect(parseNumberList('100, 200,', { min: 2 })).toEqual({
      ok: true,
      value: [100, 200],
    })
    expect(formatNumberList([100, 500, 1000])).toBe('100, 500, 1000')
  })

  it('odrzuca błędne wartości', () => {
    expect(parseIntField('abc').ok).toBe(false)
    expect(parseIntField('12.5', { integer: true }).ok).toBe(false)
    expect(parseNumberList('100, x, 200').ok).toBe(false)
    expect(acceptNumericDraft('12', '12a')).toBe('12')
    expect(acceptNumberListDraft('1,2', '1,2b')).toBe('1,2')
  })

  it('zachowuje limity min/max', () => {
    expect(parseIntField('1', { min: 2, label: 'V' }).ok).toBe(false)
    expect(parseIntField('10001', { max: 10000, label: 'V' }).ok).toBe(false)
    expect(parseNumberList('5, 150', { min: 1, max: 100, label: 'Gęstość' }).ok).toBe(false)
    expect(parseIntField('5', { min: 1, max: 100 })).toEqual({ ok: true, value: 5 })
    expect(parseNumberList('100, 500', { min: 2, max: 10000 })).toEqual({
      ok: true,
      value: [100, 500],
    })
  })
})
