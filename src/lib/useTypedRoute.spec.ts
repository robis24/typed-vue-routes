import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { reactive, effectScope } from 'vue'
import { useTypedRoute } from './useTypedRoute'
import { registerRoute, clearRegistry } from './routeRegistry'
import { p } from './parsers'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRoute: vi.fn() }
})

import { useRoute } from 'vue-router'

// Runs a composable inside a reactive scope. The scope is stopped in afterEach.
let stopScope = () => {}

function setup<T>(fn: () => T): T {
  const scope = effectScope()
  const result = scope.run(fn)!
  stopScope = () => scope.stop()
  return result
}

describe('useTypedRoute', () => {
  beforeEach(() => clearRegistry())
  afterEach(() => stopScope())

  it('returns the route object from useRoute', () => {
    const mockRoute = reactive({ name: 'home', query: {} })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute())
    expect(result.route).toBe(mockRoute)
  })

  it('resolves a present query param through its parser', () => {
    registerRoute('search', { page: { type: p.number, default: 1 } })
    const mockRoute = reactive({ name: 'search', query: { page: '5' } })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute('search'))
    expect(result.query.value).toEqual({ page: 5 })
  })

  it('applies the default when a query param is absent', () => {
    registerRoute('search', { page: { type: p.number, default: 1 } })
    const mockRoute = reactive({ name: 'search', query: {} })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute('search'))
    expect(result.query.value).toEqual({ page: 1 })
  })

  it('returns undefined for an optional query param that is absent', () => {
    registerRoute('search', { q: p.string })
    const mockRoute = reactive({ name: 'search', query: {} })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute('search'))
    expect((result.query.value as Record<string, unknown>).q).toBeUndefined()
  })

  it('takes the first value when a query param appears multiple times in the URL', () => {
    registerRoute('search', { tag: p.string })
    const mockRoute = reactive({ name: 'search', query: { tag: ['vue', 'react'] } })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute('search'))
    expect((result.query.value as Record<string, unknown>).tag).toBe('vue')
  })

  it('returns {} when the current route has no registry entry', () => {
    const mockRoute = reactive({ name: 'unregistered', query: { foo: 'bar' } })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute())
    expect(result.query.value).toEqual({})
  })

  it('query is reactive — updates when route.query changes', () => {
    registerRoute('search', { page: { type: p.number, default: 1 } })
    const mockRoute = reactive({ name: 'search', query: { page: '2' } })
    vi.mocked(useRoute).mockReturnValue(mockRoute as never)

    const result = setup(() => useTypedRoute('search'))
    expect((result.query.value as Record<string, unknown>).page).toBe(2)

    mockRoute.query.page = '9'
    expect((result.query.value as Record<string, unknown>).page).toBe(9)
  })

  describe('dev-mode name mismatch warning', () => {
    let warn: MockInstance

    beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
    afterEach(() => { warn.mockRestore() })

    it('warns when the current route does not match the expected name', () => {
      const mockRoute = reactive({ name: 'wrong-route', query: {} })
      vi.mocked(useRoute).mockReturnValue(mockRoute as never)

      setup(() => useTypedRoute('search'))

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[useTypedRoute]'))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('search'))
    })

    it('does not warn when the current route matches the expected name', () => {
      const mockRoute = reactive({ name: 'search', query: {} })
      vi.mocked(useRoute).mockReturnValue(mockRoute as never)

      setup(() => useTypedRoute('search'))

      expect(warn).not.toHaveBeenCalled()
    })

    it('does not warn when the route is in the accepted names array', () => {
      const mockRoute = reactive({ name: 'route-b', query: {} })
      vi.mocked(useRoute).mockReturnValue(mockRoute as never)

      setup(() => useTypedRoute(['route-a', 'route-b']))

      expect(warn).not.toHaveBeenCalled()
    })

    it('does not warn in global mode (no name argument)', () => {
      const mockRoute = reactive({ name: 'any-route', query: {} })
      vi.mocked(useRoute).mockReturnValue(mockRoute as never)

      setup(() => useTypedRoute())

      expect(warn).not.toHaveBeenCalled()
    })
  })
})
