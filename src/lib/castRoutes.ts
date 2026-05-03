import type { RouteRecordRaw, NavigationGuardWithThis, RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import type { RouteDefinition, RouteGroup } from './defineRoute'
import { isRouteGroup } from './defineRoute'
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
type AnyDef = AnyRouteDef | RouteGroup

/** @internal */
function toRuntime(def: AnyRouteDef): RuntimeRoute {
  return def as unknown as RuntimeRoute
}

/** @internal */
function collectLeaves(defs: ReadonlyArray<AnyDef>): AnyRouteDef[] {
  return defs.flatMap(def =>
    isRouteGroup(def) ? collectLeaves(def.children as AnyDef[]) : [def as AnyRouteDef],
  )
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

/** @internal */
function toRouteRecord(def: AnyDef): RouteRecordRaw {
  if (isRouteGroup(def)) {
    return {
      path: def.path,
      ...(def.name !== undefined ? { name: def.name } : {}),
      component: def.component,
      children: (def.children as AnyDef[]).map(toRouteRecord),
    } as RouteRecordRaw
  }
  const runtime = toRuntime(def as AnyRouteDef)
  return {
    path: runtime.path,
    name: runtime.name,
    component: runtime.component,
    ...(runtime.props !== undefined ? { props: runtime.props } : {}),
  } as RouteRecordRaw
}

/**
 * Converts an array of {@link RouteDefinition} and {@link RouteGroup} objects to
 * `RouteRecordRaw[]` for passing directly to `createRouter({ routes })`.
 *
 * Groups are preserved as nested records so Vue Router can render `<router-view>`
 * layout components correctly.
 */
export function toRouteRecords(defs: AnyDef[]): RouteRecordRaw[] {
  return defs.map(toRouteRecord)
}

/**
 * Creates a `beforeEach` navigation guard that validates and casts route params at runtime.
 *
 * - Path params: blocks navigation (`return false`) if the raw URL value cannot be parsed.
 * - Query params: redirects with defaults applied when a param is absent or unparseable.
 *
 * Accepts both {@link RouteDefinition} and {@link RouteGroup} — groups are flattened
 * to collect all leaf routes.
 *
 * Register with `router.beforeEach(createCastGuard(allRoutes))`.
 */
export function createCastGuard(defs: AnyDef[]): NavigationGuardWithThis<undefined> {
  const registry = new Map<string, RuntimeRoute>()
  for (const def of collectLeaves(defs)) {
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
