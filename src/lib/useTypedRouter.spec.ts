import { describe, it, vi, expectTypeOf } from 'vitest'
import { useTypedRouter, type TypedRouter, type TypedRouteLocationRaw } from './useTypedRouter'
import type { RouteLocationPathRaw, Router } from 'vue-router'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: vi.fn().mockReturnValue({ push: vi.fn(), replace: vi.fn() }),
  }
})

describe('useTypedRouter', () => {
  it('return type is TypedRouter', () => {
    expectTypeOf(useTypedRouter()).toExtend<TypedRouter>()
  })

  it('TypedRouter is assignable to Router (runtime-compatible)', () => {
    expectTypeOf<TypedRouter>().toExtend<Router>()
  })
})

describe('TypedRouter type constraints', () => {
  type PushArg = Parameters<TypedRouter['push']>[0]
  type ReplaceArg = Parameters<TypedRouter['replace']>[0]

  it('push accepts named-route objects', () => {
    expectTypeOf<{ name: string }>().toExtend<PushArg>()
  })

  it('push rejects string paths', () => {
    expectTypeOf<string>().not.toExtend<PushArg>()
  })

  it('push rejects path-object navigation', () => {
    expectTypeOf<RouteLocationPathRaw>().not.toExtend<PushArg>()
  })

  it('replace rejects string paths', () => {
    expectTypeOf<string>().not.toExtend<ReplaceArg>()
  })

  it('replace rejects path-object navigation', () => {
    expectTypeOf<RouteLocationPathRaw>().not.toExtend<ReplaceArg>()
  })

  it('TypedRouteLocationRaw excludes string', () => {
    expectTypeOf<string>().not.toExtend<TypedRouteLocationRaw>()
  })

  it('TypedRouteLocationRaw excludes RouteLocationPathRaw', () => {
    expectTypeOf<RouteLocationPathRaw>().not.toExtend<TypedRouteLocationRaw>()
  })
})
