/**
 * Returned by {@link Parser.get} when the raw URL string cannot be parsed.
 */
export type ParseResult<T> = T | 'miss'

/**
 * Bidirectional codec between a URL string and a typed value.
 *
 * - `get` parses a raw URL string into `T`, returning `'miss'` on failure.
 * - `set` serializes a `T` back to a URL string.
 * - `type` is an optional string injected verbatim into the generated `typed-router.d.ts`
 *   as the resolved TypeScript type. Required when `T` is not `string` and you want
 *   precise types in the generated declarations (e.g. `type: 'Status'` → `param: Status`).
 *   Without it the generated type falls back to `string`.
 */
export interface Parser<T> {
  get(raw: string): ParseResult<T>
  set(value: T): string
  type?: string
}

/** @internal */
export const NumberParser: Parser<number> = {
  get(raw) {
    if (raw.trim() === '') return 'miss'
    const n = Number(raw)
    return isNaN(n) ? 'miss' : n
  },
  set(value) {
    return String(value)
  },
}

/** @internal */
export const BooleanParser: Parser<boolean> = {
  get(raw) {
    if (raw === 'true') return true
    if (raw === 'false') return false
    return 'miss'
  },
  set(value) {
    return String(value)
  },
}

/**
 * @internal
 * Expects an ISO 8601 date string (YYYY-MM-DD) in the URL; resolves to a `Date` at runtime.
 */
export const DateParser: Parser<Date> = {
  get(raw) {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? 'miss' : d
  },
  set(value) {
    return value.toISOString().split('T')[0]
  },
}

/** @internal */
export const StringParser: Parser<string> = {
  get(raw) { return raw },
  set(value) { return value },
}

/**
 * Shape accepted by the `query` option of {@link defineRoute}.
 *
 * - Shorthand: `p.number` — no default, param is optional in the typed query object.
 * - Object form: `{ type: p.number, default: 0 }` — default applied by the navigation guard
 *   when the param is absent or unparseable; param becomes required in the typed query object.
 */
export type QueryParamConfig =
  | Parser<unknown>
  | { type: Parser<unknown>; default: unknown }

/**
 * A parser-default pair resolved from a {@link QueryParamConfig}.
 *
 * Exposes the two runtime operations needed by the navigation guard and composable
 * without leaking the erased `T` to callers.
 * @internal
 */
export interface BoundQueryParam {
  /** Parses a raw URL value, returning the default if absent or unparseable. */
  resolve(raw: string | null | undefined): unknown
  /**
   * Returns the serialized default to inject into the URL when the raw value is absent
   * or unparseable. Returns `undefined` if no patch is needed.
   */
  patchIfNeeded(raw: string | null | undefined): string | undefined
}

/** @internal */
function isParser(config: QueryParamConfig): config is Parser<unknown> {
  return 'get' in config
}

/**
 * @internal
 * Resolves a {@link QueryParamConfig} into a {@link BoundQueryParam}.
 *
 * The parser and default value share the same `T` by construction of `QueryParamConfig`,
 * but TypeScript cannot verify this once they are stored in a heterogeneous record.
 * The relationship is captured here as a closure while the types are still correlated,
 * so callers never need a cast.
 */
export function resolveQueryConfig(config: QueryParamConfig): BoundQueryParam {
  if (isParser(config)) {
    return {
      resolve(raw) {
        if (raw == null) return undefined
        const parsed = config.get(raw)
        return parsed === 'miss' ? undefined : parsed
      },
      patchIfNeeded: () => undefined,
    }
  }

  const { type: parser, default: defaultVal } = config

  return {
    resolve(raw) {
      if (raw == null) return defaultVal
      const parsed = parser.get(raw)
      return parsed === 'miss' ? defaultVal : parsed
    },
    patchIfNeeded(raw) {
      if (raw != null && parser.get(raw) !== 'miss') return undefined
      // `parser` and `defaultVal` share the same `T` — see JSDoc above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (parser as Parser<any>).set(defaultVal)
    },
  }
}

/**
 * Built-in parsers for use in {@link defineRoute}.
 *
 * @example
 * ```ts
 * defineRoute({
 *   path: '/users/:id',
 *   name: 'user-detail',
 *   params: { id: p.number },
 *   query:  { q: p.string, page: { type: p.number, default: 1 } },
 * })
 * ```
 */
export const p = {
  number: NumberParser,
  boolean: BooleanParser,
  /** Expects an ISO 8601 date string in the URL (YYYY-MM-DD); resolves to `Date`. */
  date: DateParser,
  string: StringParser,
} as const
