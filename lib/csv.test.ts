import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows with commas and CRLF line endings', () => {
    const csv = toCsv(['Name', 'Amount'], [['Silicon', 639], ['Texture', 789]])
    expect(csv).toBe('Name,Amount\r\nSilicon,639\r\nTexture,789')
  })

  it('quotes a field containing a comma', () => {
    const csv = toCsv(['Address'], [['Kathmandu, Nepal']])
    expect(csv).toBe('Address\r\n"Kathmandu, Nepal"')
  })

  it('quotes and escapes a field containing a double quote', () => {
    const csv = toCsv(['Note'], [['She said "hi"']])
    expect(csv).toBe('Note\r\n"She said ""hi"""')
  })

  it('quotes a field containing a newline', () => {
    const csv = toCsv(['Note'], [['line one\nline two']])
    expect(csv).toBe('Note\r\n"line one\nline two"')
  })

  it('returns just the header row for no data', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B')
  })
})
