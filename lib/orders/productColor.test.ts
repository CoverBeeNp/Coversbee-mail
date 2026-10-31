import { describe, it, expect } from 'vitest'
import { extractColor } from './productColor'

describe('extractColor', () => {
  it('extracts a single leading color word', () => {
    expect(extractColor('Brown Silicon')).toEqual({ color: 'Brown', baseName: 'Silicon' })
    expect(extractColor('Blue Texture')).toEqual({ color: 'Blue', baseName: 'Texture' })
  })

  it('extracts a two-word modifier plus color', () => {
    expect(extractColor('Light Yellow SIlicon')).toEqual({ color: 'Light Yellow', baseName: 'SIlicon' })
    expect(extractColor('Dark Pink Silicon')).toEqual({ color: 'Dark Pink', baseName: 'Silicon' })
  })

  it('keeps the rest of a multi-word product name intact', () => {
    expect(extractColor('Purple Half Butterfly')).toEqual({ color: 'Purple', baseName: 'Half Butterfly' })
    expect(extractColor('Black Half Butterfly')).toEqual({ color: 'Black', baseName: 'Half Butterfly' })
  })

  it('returns a null color and the original name unchanged when no recognized color word leads it', () => {
    expect(extractColor('Birthday Teedy')).toEqual({ color: null, baseName: 'Birthday Teedy' })
    expect(extractColor('F1 Racer')).toEqual({ color: null, baseName: 'F1 Racer' })
  })

  it('does not treat a modifier alone as a color when the next word is not a recognized color', () => {
    expect(extractColor('Light P Texture')).toEqual({ color: null, baseName: 'Light P Texture' })
  })

  it('trims surrounding whitespace before matching', () => {
    expect(extractColor('  Brown Silicon  ')).toEqual({ color: 'Brown', baseName: 'Silicon' })
  })
})
