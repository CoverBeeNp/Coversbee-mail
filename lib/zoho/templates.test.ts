import { describe, it, expect } from 'vitest'
import { renderTransactionalEmail } from './templates'

describe('renderTransactionalEmail', () => {
  it('renders a subject and HTML body referencing the order number', () => {
    const { subject, html } = renderTransactionalEmail('dispatched', {
      blanxerOrderNumber: '1747', items: [{ name: 'SIlicon', variant: 'Old Rose/iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 }],
      total: 1768, customerName: 'Nees shah',
    })
    expect(subject).toContain('1747')
    expect(html).toContain('Nees shah')
    expect(html).toContain('SIlicon')
    expect(html).toContain('1768')
  })

  for (const status of ['received', 'dispatched', 'delivered', 'cancelled'] as const) {
    it(`has a template for status "${status}"`, () => {
      const { subject } = renderTransactionalEmail(status, { blanxerOrderNumber: '1', items: [], total: 0, customerName: 'Test' })
      expect(subject.length).toBeGreaterThan(0)
    })
  }

  it('renders distinct copy for each status', () => {
    const order = { blanxerOrderNumber: '1', items: [], total: 0, customerName: 'Test' }
    const rendered = (['received', 'dispatched', 'delivered', 'cancelled'] as const).map(
      (status) => renderTransactionalEmail(status, order)
    )
    const subjects = new Set(rendered.map((r) => r.subject))
    const htmls = new Set(rendered.map((r) => r.html))
    expect(subjects.size).toBe(4)
    expect(htmls.size).toBe(4)
  })
})
