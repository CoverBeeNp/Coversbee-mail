import { describe, it, expect } from 'vitest'
import { renderTransactionalEmail, renderCampaignEmail, escapeHtml } from './templates'

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

  it('escapes HTML in customer name and item name/variant so it cannot inject markup', () => {
    const { html } = renderTransactionalEmail('received', {
      blanxerOrderNumber: '1',
      items: [{ name: '<a href="https://evil.example">Click</a>', variant: '<script>x</script>', unitPrice: 1, qty: 1, lineTotal: 1 }],
      total: 1,
      customerName: '<b>Nasty</b> & co',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="https://evil.example">')
    expect(html).toContain('&lt;b&gt;Nasty&lt;/b&gt; &amp; co')
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt;')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
  })
})

describe('escapeHtml', () => {
  it('escapes the five reserved HTML characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })
})

describe('renderCampaignEmail', () => {
  it('does not escape the staff-authored body HTML', () => {
    const { html } = renderCampaignEmail('Subject', '<p>Hello <strong>World</strong></p>')
    expect(html).toContain('<p>Hello <strong>World</strong></p>')
  })
})
