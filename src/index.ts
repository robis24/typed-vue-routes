// Runtime — safe to import in Vue components and the router setup file

export { defineRoute, isRouteGroup } from './lib/defineRoute'
export type { RouteDefinition, RouteGroup, InferParams, InferQuery } from './lib/defineRoute'

export { toRouteRecords, createCastGuard } from './lib/castRoutes'

export { p, resolveQueryConfig } from './lib/parsers'
export type { Parser, ParseResult, QueryParamConfig, BoundQueryParam } from './lib/parsers'

export { useTypedRoute } from './lib/useTypedRoute'
export { useTypedRouter } from './lib/useTypedRouter'
export type { TypedRouter, TypedRouteLocationRaw } from './lib/useTypedRouter'
