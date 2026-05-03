import { computed, type ComputedRef, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import type { TypesConfig, LocationQuery } from 'vue-router'
import { getRegisteredRoute } from './routeRegistry'

type _RouteMap = TypesConfig extends Record<'RouteNamedMap', infer T> ? T : Record<string, unknown>
type _QueryMap = TypesConfig extends Record<'RouteQueryMap', infer T> ? T : Record<string, Record<string, unknown>>

/**
 * Global mode: Returns a union of all known typed routes.
 * Narrow the type using `if (route.name === '...')`.
 */
export function useTypedRoute(): {
  route: ReturnType<typeof useRoute<keyof _RouteMap>>
  query: ComputedRef<_QueryMap[keyof _QueryMap]>
}

/**
 * Specific mode: Returns the exactly typed route for `name`.
 * Emits a console warning in development if the current route name doesn't match.
 */
export function useTypedRoute<TName extends string & keyof _QueryMap & keyof _RouteMap>(
  name: TName,
): { route: ReturnType<typeof useRoute<TName>>; query: ComputedRef<_QueryMap[TName]> }

/**
 * Multi-route mode: Returns a union of the specified typed routes.
 * Emits a console warning in development if the current route name doesn't match any of the names.
 */
export function useTypedRoute<TName extends string & keyof _QueryMap & keyof _RouteMap>(
  names: TName[],
): { route: ReturnType<typeof useRoute<TName>>; query: ComputedRef<_QueryMap[TName]> }

export function useTypedRoute(
  nameOrNames?: string | string[],
): { route: ReturnType<typeof useRoute>; query: ComputedRef<unknown> } {
  const route = useRoute()

  if (import.meta.env.DEV && nameOrNames !== undefined) {
    watchEffect(() => {
      const currentName = String(route.name ?? '')
      const expected = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]
      if (currentName && !expected.includes(currentName)) {
        console.warn(
          `[useTypedRoute] Mismatch: Component expects route "${expected.join(
            ' | ',
          )}", but currently on "${currentName}". ` +
            `Type safety is not guaranteed on this route.`,
        )
      }
    })
  }

  const query = computed(() => {
    const currentName = String(route.name ?? '')
    const def = getRegisteredRoute(currentName)

    if (!def) return {}

    return Object.fromEntries(
      Object.entries(def.query).map(([key, bound]) => {
        const rawEntry = (route.query as LocationQuery)[key]
        const raw = Array.isArray(rawEntry) ? rawEntry[0] : rawEntry
        return [key, bound.resolve(raw)]
      }),
    )
  })

  return { route, query }
}
