import type { RouteRecordRaw } from 'vue-router'
import type { Parser, QueryParamConfig } from './parsers'
import { registerRoute } from './routeRegistry'

/** @internal */
type InferParserType<T> = T extends Parser<infer U> ? U : never

/**
 * @internal
 * Recursively extracts `:param` segment names from a path string literal type.
 *
 * `'/users/:id/posts/:postId'` → `'id' | 'postId'`
 */
type ExtractPathParams<T extends string> =
  T extends `${string}:${infer P}/${infer R}`
    ? P | ExtractPathParams<R>
    : T extends `${string}:${infer P}`
      ? P
      : never

/** @internal */
type InferQueryParamType<T extends QueryParamConfig> =
  T extends Parser<infer U>
    ? U
    : T extends { type: Parser<infer U> }
      ? U
      : never

/**
 * Infers the resolved params object for a route — what `useRoute().params` returns.
 * Path segments without an explicit parser resolve to `string`.
 */
export type InferParams<
  TPath extends string,
  TParams extends Record<string, Parser<unknown>>,
> = {
  [K in ExtractPathParams<TPath>]: K extends keyof TParams
    ? InferParserType<TParams[K]>
    : string
}

/**
 * Infers the typed query object for a route — what {@link useTypedRoute} returns.
 * All params are optional unless a `default` is provided via the object form.
 */
export type InferQuery<TQuery extends Record<string, QueryParamConfig>> = {
  [K in keyof TQuery]?: InferQueryParamType<TQuery[K]>
}

/**
 * The typed route definition produced by {@link defineRoute}.
 *
 * Carries the full generic signature so `toRouteRecords` and `createCastGuard`
 * can extract parser and default information at runtime.
 */
export interface RouteDefinition<
  TName extends string = string,
  TPath extends string = string,
  TParams extends Record<string, Parser<unknown>> = Record<string, Parser<unknown>>,
  TQuery extends Record<string, QueryParamConfig> = Record<string, QueryParamConfig>,
> {
  readonly __typed: true
  readonly name: TName
  readonly path: TPath
  readonly params: TParams | undefined
  readonly query: TQuery | undefined
  readonly props?: RouteRecordRaw['props']
  readonly component: RouteRecordRaw['component']
}

/**
 * Defines a typed route.
 *
 * - `params` keys must match the `:segments` in `path` — extra keys are a type error.
 * - `query` values are {@link Parser} instances from the `p` namespace or the object form
 *   `{ type: p.number, default: 0 }` to supply a fallback applied by the navigation guard.
 *
 * The Vite plugin scans calls to `defineRoute` and generates `typed-router.d.ts`, which
 * augments `TypesConfig.RouteNamedMap` so that `router.push` and `useRoute()` become typed.
 *
 * @example
 * ```ts
 * export const userRoutes = [
 *   defineRoute({
 *     path: '/users/:id',
 *     name: 'user-detail',
 *     params: { id: p.number },
 *     component: () => import('./UserDetailView.vue'),
 *   }),
 * ]
 * ```
 */
export function defineRoute<
  TName extends string,
  TPath extends string,
  TParams extends Record<string, Parser<unknown>> = Record<never, never>,
  TQuery extends Record<string, QueryParamConfig> = Record<never, never>,
>(config: {
  name: TName
  path: TPath
  /** Extra keys not present in the path produce a type error via the `never` intersection. */
  params?: TParams & Record<Exclude<keyof TParams, ExtractPathParams<TPath>>, never>
  query?: TQuery
  props?: RouteRecordRaw['props']
  component: RouteRecordRaw['component']
}): RouteDefinition<TName, TPath, TParams, TQuery> {
  registerRoute(config.name, config.query as Record<string, QueryParamConfig> | undefined)
  return {
    __typed: true,
    name: config.name,
    path: config.path,
    params: config.params as TParams | undefined,
    query: config.query as TQuery | undefined,
    props: config.props,
    component: config.component,
  }
}
