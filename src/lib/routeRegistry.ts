import { resolveQueryConfig, type BoundQueryParam, type QueryParamConfig } from './parsers'

interface RegistryEntry {
  query: Record<string, BoundQueryParam>
}

// Module-level singleton populated at import time by defineRoute() side effects.
const registry = new Map<string, RegistryEntry>()

/** @internal */
export function registerRoute(name: string, query?: Record<string, QueryParamConfig>): void {
  const resolvedQuery: Record<string, BoundQueryParam> = {}

  if (query) {
    for (const [key, config] of Object.entries(query)) {
      resolvedQuery[key] = resolveQueryConfig(config)
    }
  }

  registry.set(name, { query: resolvedQuery })
}

/** @internal */
export function getRegisteredRoute(name: string): RegistryEntry | undefined {
  return registry.get(name)
}

/** @internal — test use only */
export function clearRegistry(): void {
  registry.clear()
}
