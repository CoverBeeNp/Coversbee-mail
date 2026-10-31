import { describe, it, expect } from 'vitest'
import { config } from './proxy'

describe('proxy matcher', () => {
  it('covers the finance pages', () => {
    expect(config.matcher).toContain('/finance/:path*')
  })
})
