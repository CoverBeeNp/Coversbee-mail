/* eslint-disable @typescript-eslint/no-explicit-any -- calling server functions with placeholder arguments */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createServiceClientMock = vi.fn()

vi.mock('@/lib/auth/requireUser', () => ({
  requireUser: async () => { throw new Error('Unauthorized') },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => createServiceClientMock(),
}))

import * as bankBalance from '@/lib/bankBalance/bankBalance'
import * as categories from '@/lib/expenses/categories'
import * as expenses from '@/lib/expenses/expenses'
import * as deviceModelOptions from '@/lib/orders/deviceModelOptions'
import * as manualOrders from '@/lib/orders/manualOrders'
import * as statements from '@/lib/statements/statements'

// Every export of a 'use server' file is callable by direct POST. This walks
// the exports rather than naming them, so a new function added without a login
// check fails here.
const SERVER_MODULES = { bankBalance, categories, expenses, deviceModelOptions, manualOrders, statements }

const cases = Object.entries(SERVER_MODULES).flatMap(([moduleName, mod]) =>
  Object.entries(mod)
    .filter(([, value]) => typeof value === 'function')
    .map(([name, fn]) => ({ label: `${moduleName}.${name}`, fn: fn as (...args: any[]) => Promise<unknown> }))
)

describe('finance server functions require a login', () => {
  beforeEach(() => createServiceClientMock.mockClear())

  it('covers every server function', () => {
    expect(cases.length).toBe(19)
  })

  it.each(cases)('$label rejects without a login and never reaches the database', async ({ fn }) => {
    await expect(fn('placeholder', {})).rejects.toThrow('Unauthorized')
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })
})
