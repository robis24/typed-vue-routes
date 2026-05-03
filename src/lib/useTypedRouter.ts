import { useRouter } from 'vue-router'
import type { Router, NavigationFailure, RouteLocationRaw, RouteLocationPathRaw } from 'vue-router'

/**
 * The subset of `RouteLocationRaw` that excludes string paths and `{ path }` object forms.
 * When `RouteNamedMap` is populated the remaining union is fully typed per named route.
 */
export type TypedRouteLocationRaw = Exclude<RouteLocationRaw, string | RouteLocationPathRaw>

/**
 * A narrowed router where `push` and `replace` only accept name-based navigation.
 * String paths and `{ path }` objects produce a compile error.
 *
 * Use `useTypedRouter()` to get an instance, or enable `strictNamedRoutes` in the
 * Vite plugin to apply this restriction globally to `this.$router` in templates.
 */
export type TypedRouter = Omit<Router, 'push' | 'replace'> & {
  push(to: TypedRouteLocationRaw): Promise<NavigationFailure | void | undefined>
  replace(to: TypedRouteLocationRaw): Promise<NavigationFailure | void | undefined>
}

/**
 * Returns the router with `push` and `replace` restricted to named-route navigation.
 * Drop-in replacement for `useRouter()` when you want path-based navigation to be a type error.
 */
export function useTypedRouter(): TypedRouter {
  return useRouter() as unknown as TypedRouter
}
