import { describe, it, expect } from 'vitest'
import { renderTransactionalEmail, renderCampaignEmail, escapeHtml } from './templates'

describe('renderTransactionalEmail', () => {
  it('renders a subject and HTML body referencing the order number, customer, items, and total for "received"', () => {
    const { subject, html } = renderTransactionalEmail('received', {
      blanxerOrderNumber: '1747', items: [{ name: 'SIlicon', variant: 'Old Rose/iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 }],
      total: 1768, customerName: 'Nees shah', address: 'Dulal chowk, Kapan',
    })
    expect(subject).toContain('1747')
    expect(html).toContain('Nees shah')
    expect(html).toContain('SIlicon')
    expect(html).toContain('1768')
    expect(html).toContain('Dulal chowk, Kapan')
  })

  it('renders the carrier and tracking link for "dispatched"', () => {
    const { subject, html } = renderTransactionalEmail('dispatched', {
      blanxerOrderNumber: '1747', items: [], total: 1768, customerName: 'Nees shah',
      trackingUrl: 'https://coversbee.com.np/track/abc123',
    })
    expect(subject).toContain('1747')
    expect(html).toContain('Nepal Can Move')
    expect(html).toContain('https://coversbee.com.np/track/abc123')
  })

  it('falls back to a placeholder message when dispatched with no tracking link', () => {
    const { html } = renderTransactionalEmail('dispatched', {
      blanxerOrderNumber: '1747', items: [], total: 1768, customerName: 'Nees shah', trackingUrl: null,
    })
    expect(html).not.toContain('href="null"')
    expect(html).toContain('tracking link')
  })

  it('renders the delivery address and customer care contact for "delivered"', () => {
    const { html } = renderTransactionalEmail('delivered', {
      blanxerOrderNumber: '1747', items: [], total: 1768, customerName: 'Nees shah', address: 'Dulal chowk, Kapan',
    })
    expect(html).toContain('Dulal chowk, Kapan')
    expect(html).toContain('info@coversbee.com.np')
  })

  it('includes the Google review link and an SMS review heads-up for "delivered"', () => {
    const { html } = renderTransactionalEmail('delivered', {
      blanxerOrderNumber: '1747', items: [], total: 1768, customerName: 'Nees shah',
    })
    expect(html).toContain('https://g.page/r/CeedE59zZPfHEAI/review')
    expect(html.toLowerCase()).toContain('text')
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

describe('email shell branding', () => {
  it('includes the logo image sourced from APP_URL', () => {
    const { html } = renderTransactionalEmail('received', {
      blanxerOrderNumber: '1', items: [], total: 0, customerName: 'Test',
    })
    expect(html).toContain(`src="${process.env.APP_URL ?? 'http://localhost:3000'}/logo.png"`)
    expect(html).toContain('alt="CoversBee"')
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

  it('includes a real unsubscribe link for the given customer, not a mailto', () => {
    const { html } = renderCampaignEmail('Subject', '<p>Body</p>', 'cust-123')
    expect(html).toContain('/unsubscribe?customer=cust-123')
    expect(html).not.toContain('mailto:info@coversbee.com.np?subject=Unsubscribe')
  })

  it('falls back to a plain unsubscribe link with no customer id (preview mode)', () => {
    const { html } = renderCampaignEmail('Subject', '<p>Body</p>')
    expect(html).toContain('/unsubscribe"')
  })
})

describe('unsubscribe link on transactional emails', () => {
  it('includes the customer id when provided', () => {
    const { html } = renderTransactionalEmail('received', {
      blanxerOrderNumber: '1', items: [], total: 0, customerName: 'Test', customerId: 'cust-456',
    })
    expect(html).toContain('/unsubscribe?customer=cust-456')
  })
})
