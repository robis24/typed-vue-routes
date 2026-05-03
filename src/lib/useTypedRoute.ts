import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import type { TypesConfig, LocationQuery } from 'vue-router'
import { resolveQueryConfig } from './parsers'
import { getRegisteredRoute } from './routeRegistry'
import type { RouteQueryMap } from '../typed-router'

type _RouteMap = TypesConfig extends Record<'RouteNamedMap', infer T> ? T : Record<never, never>


/**
 * Composable that returns a fully typed `route` and a reactive `query` object
 * with URL strings cast to their declared types via the registered parsers.
 *
 * `route` is the standard Vue Router route typed to `TName` (typed params via `RouteNamedMap`).
 * `query` is a `ComputedRef` that re-evaluates on every URL change.
 *
 * @example
 * ```ts
 * const { query } = useTypedRoute('companies-list')
 * query.value.search  // string | undefined
 * ```
 */
export function useTypedRoute<TName extends string & keyof RouteQueryMap & keyof _RouteMap>(
  name: TName,
): { route: ReturnType<typeof useRoute<TName>>; query: ComputedRef<RouteQueryMap[TName]> } {
  const route = useRoute<TName>(name)
  const def = getRegisteredRoute(name)

  const query = computed<RouteQueryMap[TName]>(() => {
    if (!def?.query) return {} as RouteQueryMap[TName]

    return Object.fromEntries(
      Object.entries(def.query).map(([key, config]) => {
        const bound = resolveQueryConfig(config)
        const rawEntry = (route.query as LocationQuery)[key]
        const raw = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry
        return [key, bound.resolve(raw)]
      }),
    ) as RouteQueryMap[TName]
  })

  return { route, query }
}
