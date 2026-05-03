import type { RouteRecordRaw, NavigationGuardWithThis, RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import type { RouteDefinition } from './defineRoute'
import { resolveQueryConfig, type Parser, type QueryParamConfig, type BoundQueryParam } from './parsers'

interface RuntimeRoute {
  name: string
  path: string
  params?: Record<string, Parser<unknown>>
  query?: Record<string, QueryParamConfig>
  props?: RouteRecordRaw['props']
  component: RouteRecordRaw['component']
}

type AnyRouteDef = RouteDefinition<string, string, Record<string, Parser<unknown>>, Record<string, QueryParamConfig>>

/** @internal */
function toRuntime(def: AnyRouteDef): RuntimeRoute {
  return def as unknown as RuntimeRoute
}

/** @internal */
function validatePathParams(
  params: RuntimeRoute['params'],
  rawParams: Record<string, string | string[]>,
): boolean {
  if (!params) return true
  for (const [key, parser] of Object.entries(params)) {
    const raw = rawParams[key]
    if (raw !== undefined && parser.get(String(raw)) === 'miss') return false
  }
  return true
}

/** @internal */
function buildQueryPatch(
  query: RuntimeRoute['query'],
  rawQuery: Record<string, string | null | Array<string | null>>,
): Record<string, string> | null {
  if (!query) return null
  const patch: Record<string, string> = {}

  for (const [key, config] of Object.entries(query)) {
    const bound: BoundQueryParam = resolveQueryConfig(config)
    const rawEntry = rawQuery[key]
    const raw = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry
    const serialized = bound.patchIfNeeded(raw)
    if (serialized !== undefined) patch[key] = serialized
  }

  return Object.keys(patch).length > 0 ? patch : null
}

/** @internal */
function redirectWithPatch(to: RouteLocationNormalized, patch: Record<string, string>): RouteLocationRaw {
  return {
    name: to.name ?? undefined,
    params: to.params as Record<string, string>,
    query: { ...to.query, ...patch } as Record<string, string>,
    hash: to.hash,
    replace: true,
  } as unknown as RouteLocationRaw
}

/**
 * Converts an array of {@link RouteDefinition} objects to `RouteRecordRaw[]`
 * for passing directly to `createRouter({ routes })`.
 */
export function toRouteRecords(defs: AnyRouteDef[]): RouteRecordRaw[] {
  return defs.map((def) => {
    const runtime = toRuntime(def)
    return {
      path: runtime.path,
      name: runtime.name,
      component: runtime.component,
      ...(runtime.props !== undefined ? { props: runtime.props } : {}),
    } as RouteRecordRaw
  })
}

/**
 * Creates a `beforeEach` navigation guard that validates and casts route params at runtime.
 *
 * - Path params: blocks navigation (`return false`) if the raw URL value cannot be parsed.
 * - Query params: redirects with defaults applied when a param is absent or unparseable.
 *
 * Register with `router.beforeEach(createCastGuard(allRoutes))`.
 */
export function createCastGuard(defs: AnyRouteDef[]): NavigationGuardWithThis<undefined> {
  const registry = new Map<string, RuntimeRoute>()
  for (const def of defs) {
    registry.set(def.name, toRuntime(def))
  }

  return (to: RouteLocationNormalized) => {
    const def = registry.get(String(to.name ?? ''))
    if (!def) return

    const rawParams = to.params as Record<string, string | string[]>
    const rawQuery = to.query as Record<string, string | null | Array<string | null>>

    if (!validatePathParams(def.params, rawParams)) return false

    const patch = buildQueryPatch(def.query, rawQuery)
    if (patch) return redirectWithPatch(to, patch)
  }
}
