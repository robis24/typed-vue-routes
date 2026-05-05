import type { Plugin } from 'vite'
import * as ts from 'typescript'
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** @internal */
export interface ExtractedParam {
  /**
   * Either a built-in parser member ('number' | 'boolean' | 'date' | 'string') or a
   * TypeScript identifier referring to a custom type (e.g. an enum). When `importFrom`
   * is set, this is the identifier to import.
   */
  member: string
  /** When set, emit `import type { <member> } from '<importFrom>'` in the generated d.ts. */
  importFrom?: string
}

/** @internal */
export interface ExtractedQueryParam {
  member: string
  hasDefault: boolean
  /** See {@link ExtractedParam.importFrom}. */
  importFrom?: string
}

/** @internal */
export interface ExtractedRoute {
  name: string
  path: string
  params: Record<string, ExtractedParam>
  query: Record<string, ExtractedQueryParam>
}

export interface TypedRoutesOptions {
  /**
   * When `true`, augments `TypesConfig['$router']` so that `this.$router.push` and
   * `this.$router.replace` in Vue templates and Options API components only accept
   * name-based navigation. String paths and `{ path }` objects become compile errors.
   *
   * For Composition API, use `useTypedRouter()` from `typed-vue-routes`.
   *
   * @default false
   */
  strictNamedRoutes?: boolean
}

// Valid members of the `p` namespace
const VALID_P_MEMBERS = new Set(['number', 'boolean', 'date', 'string'])

// TypeScript types for the router.push input (ParamsRaw)
const MEMBER_TO_RAW: Record<string, string> = {
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  string: 'string',
}

// TypeScript types for useRoute().params / useTypedRoute().query (resolved)
const MEMBER_TO_RESOLVED: Record<string, string> = {
  number: 'number',
  boolean: 'boolean',
  date: 'Date',
  string: 'string',
}

function findRouteFiles(srcDir: string): string[] {
  const results: string[] = []

  function walk(dir: string) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          walk(full)
        } else if (entry === 'routes.ts') {
          results.push(full)
        }
      } catch {
        continue
      }
    }
  }

  walk(srcDir)
  return results
}

function getPropName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  return undefined
}

function getParserType(
  node: ts.Expression,
  sourceFile: ts.SourceFile,
): ExtractedParam | undefined {
  // 1. p.enum(<Identifier>, '<string-literal-import-path>')
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'p' &&
    node.expression.name.text === 'enum' &&
    node.arguments.length >= 2
  ) {
    const enumArg = node.arguments[0]
    const pathArg = node.arguments[1]
    if (ts.isIdentifier(enumArg) && ts.isStringLiteral(pathArg)) {
      return { member: enumArg.text, importFrom: pathArg.text }
    }
  }

  // 2. Legacy p.* namespace (on the raw node first)
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'p' &&
    VALID_P_MEMBERS.has(node.name.text)
  ) {
    return { member: node.name.text }
  }

  // 3. Resolve the node (handling identifiers and finding their declarations)
  if (ts.isIdentifier(node)) {
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === node.text) {
            // Check type annotation: const x: Parser<number>
            if (
              decl.type &&
              ts.isTypeReferenceNode(decl.type) &&
              ts.isIdentifier(decl.type.typeName) &&
              decl.type.typeName.text === 'Parser'
            ) {
              if (decl.type.typeArguments && decl.type.typeArguments.length > 0) {
                const typeArg = decl.type.typeArguments[0]
                if (ts.isTypeReferenceNode(typeArg) && ts.isIdentifier(typeArg.typeName)) {
                  return { member: typeArg.typeName.text }
                }
                // Handle basic types: number, string, boolean
                if (typeArg.kind === ts.SyntaxKind.NumberKeyword) return { member: 'number' }
                if (typeArg.kind === ts.SyntaxKind.StringKeyword) return { member: 'string' }
                if (typeArg.kind === ts.SyntaxKind.BooleanKeyword) return { member: 'boolean' }
              }
            }
            if (decl.initializer) return getParserType(decl.initializer, sourceFile)
          }
        }
      }
    }
  }

  // 4. Check for object shape { get, set }
  if (ts.isObjectLiteralExpression(node)) {
    let hasGet = false
    let hasSet = false
    let explicitType: string | undefined

    for (const prop of node.properties) {
      if (!('name' in prop)) continue
      const key = getPropName(prop.name as ts.PropertyName)
      if (key === 'get') hasGet = true
      if (key === 'set') hasSet = true
      if (key === 'type' && ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
        explicitType = prop.initializer.text
      }
    }

    if (hasGet && hasSet) {
      return { member: explicitType ?? 'string' }
    }
  }

  return undefined
}

function resolveNode(node: ts.Node, sourceFile: ts.SourceFile): ts.Node {
  if (ts.isIdentifier(node)) {
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === node.text && decl.initializer) {
            return decl.initializer
          }
        }
      }
    }
  }
  return node
}

function extractParamTypes(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile
): Record<string, ExtractedParam> {
  const result: Record<string, ExtractedParam> = {}
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = getPropName(prop.name)
      if (!key) continue
      const parser = getParserType(prop.initializer, sourceFile)
      if (parser) result[key] = parser
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text
      const parser = getParserType(prop.name, sourceFile)
      if (parser) result[key] = parser
    } else if (ts.isSpreadAssignment(prop)) {
      const val = resolveNode(prop.expression, sourceFile)
      if (ts.isObjectLiteralExpression(val)) {
        Object.assign(result, extractParamTypes(val, sourceFile))
      }
    }
  }
  return result
}

function extractQueryTypes(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile
): Record<string, ExtractedQueryParam> {
  const result: Record<string, ExtractedQueryParam> = {}
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = getPropName(prop.name)
      if (!key) continue

      const parser = getParserType(prop.initializer, sourceFile)
      if (parser) {
        result[key] = { ...parser, hasDefault: false }
      } else {
        const val = resolveNode(prop.initializer, sourceFile)
        if (ts.isObjectLiteralExpression(val)) {
          let inferred: ExtractedParam = { member: 'string' }
          let hasDefault = false
          for (const inner of val.properties) {
            if (!ts.isPropertyAssignment(inner)) continue
            const innerKey = getPropName(inner.name)
            if (innerKey === 'type') {
              const pm = getParserType(inner.initializer, sourceFile)
              if (pm) inferred = pm
            } else if (innerKey === 'default') {
              hasDefault = true
            }
          }
          result[key] = { ...inferred, hasDefault }
        }
      }
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text
      const parser = getParserType(prop.name, sourceFile)
      if (parser) {
        result[key] = { ...parser, hasDefault: false }
      }
    } else if (ts.isSpreadAssignment(prop)) {
      const val = resolveNode(prop.expression, sourceFile)
      if (ts.isObjectLiteralExpression(val)) {
        Object.assign(result, extractQueryTypes(val, sourceFile))
      }
    }
  }
  return result
}

/** @internal Joins a parent and child path, normalising slashes. Empty child = index route. */
function joinPaths(parent: string, child: string): string {
  if (!child) return parent
  const p = parent.endsWith('/') ? parent.slice(0, -1) : parent
  const c = child.startsWith('/') ? child.slice(1) : child
  return `${p}/${c}`
}

interface RouteConfig {
  name?: string
  path?: string
  params: Record<string, ExtractedParam>
  query: Record<string, ExtractedQueryParam>
  children?: ts.ArrayLiteralExpression
}

function extractRouteConfig(obj: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): RouteConfig {
  const config: RouteConfig = { params: {}, query: {} }

  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const val = resolveNode(prop.expression, sourceFile)
      if (ts.isObjectLiteralExpression(val)) {
        const spreadConfig = extractRouteConfig(val, sourceFile)
        if (spreadConfig.name) config.name = spreadConfig.name
        if (spreadConfig.path) config.path = spreadConfig.path
        if (spreadConfig.children) config.children = spreadConfig.children
        Object.assign(config.params, spreadConfig.params)
        Object.assign(config.query, spreadConfig.query)
      }
      continue
    }

    if (!ts.isPropertyAssignment(prop)) continue
    const key = getPropName(prop.name)
    const val = resolveNode(prop.initializer, sourceFile)
    if (!key) continue

    const handlers: Record<string, (v: ts.Node) => void> = {
      name: (v) => { if (ts.isStringLiteral(v)) config.name = v.text },
      path: (v) => { if (ts.isStringLiteral(v)) config.path = v.text },
      params: (v) => { if (ts.isObjectLiteralExpression(v)) Object.assign(config.params, extractParamTypes(v, sourceFile)) },
      query: (v) => { if (ts.isObjectLiteralExpression(v)) Object.assign(config.query, extractQueryTypes(v, sourceFile)) },
      children: (v) => { if (ts.isArrayLiteralExpression(v)) config.children = v },
    }

    handlers[key]?.(val)
  }

  return config
}

/**
 * Parses `source` (the text of a route file) and returns all named routes found in
 * `defineRoute` calls, with their fully-resolved paths and typed param/query metadata.
 *
 * Exported for testing.
 */
export function extractRoutes(source: string, filename: string): ExtractedRoute[] {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, false)
  const routes: ExtractedRoute[] = []

  function processDefineRoute(
    obj: ts.ObjectLiteralExpression,
    pathPrefix: string,
    paramsPrefix: Record<string, ExtractedParam>
  ) {
    const { name, path, params: localParams, query, children: childrenNode } =
      extractRouteConfig(obj, sourceFile)

    if (path === undefined) return

    const fullPath = pathPrefix ? joinPaths(pathPrefix, path) : path
    const mergedParams = { ...paramsPrefix, ...localParams }

    if (childrenNode) {
      if (name) routes.push({ name, path: fullPath, params: mergedParams, query: {} })
      for (const element of childrenNode.elements) {
        visitWithPrefix(element, fullPath, mergedParams)
      }
    } else if (name) {
      routes.push({ name, path: fullPath, params: mergedParams, query })
    }
  }

  function visitWithPrefix(
    node: ts.Node,
    pathPrefix: string,
    paramsPrefix: Record<string, ExtractedParam>
  ) {
    const resolved = resolveNode(node, sourceFile)
    if (
      ts.isCallExpression(resolved) &&
      ts.isIdentifier(resolved.expression) &&
      resolved.expression.text === 'defineRoute' &&
      resolved.arguments.length > 0
    ) {
      const arg = resolveNode(resolved.arguments[0], sourceFile)
      if (ts.isObjectLiteralExpression(arg)) {
        processDefineRoute(arg, pathPrefix, paramsPrefix)
        return
      }
    }
    ts.forEachChild(node, (child) => visitWithPrefix(child, pathPrefix, paramsPrefix))
  }

  visitWithPrefix(sourceFile, '', {})
  return routes
}

/**
 * Extracts `:segment` parameter names from a path string. Mirrors the
 * `ExtractPathParams<TPath>` TypeScript type, so untyped path segments
 * still surface as `string` in the generated d.ts. Regex modifiers
 * (e.g. `:catchAll(.*)*`) are ignored — only valid identifier chars
 * are picked up.
 */
function extractPathSegmentNames(path: string): string[] {
  const out: string[] = []
  const re = /:([A-Za-z_$][A-Za-z_$0-9]*)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(path)) !== null) {
    out.push(match[1])
  }
  return out
}

/**
 * Computes the raw URL-input TypeScript type for a parameter:
 * - built-in members (`number`, `boolean`, `date`, `string`) use the {@link MEMBER_TO_RAW} table.
 * - custom types with an `importFrom` use their member name (the imported identifier) directly.
 * - everything else falls back to `string`.
 */
function rawTypeFor(param: ExtractedParam): string {
  if (param.importFrom) return param.member
  return MEMBER_TO_RAW[param.member] ?? 'string'
}

/**
 * Computes the resolved (parsed) TypeScript type for a parameter — used for `useRoute().params`
 * and `useTypedRoute().query`. Custom types use the imported identifier; built-ins use the
 * {@link MEMBER_TO_RESOLVED} table.
 */
function resolvedTypeFor(param: { member: string; importFrom?: string }): string {
  if (param.importFrom) return param.member
  return MEMBER_TO_RESOLVED[param.member] ?? param.member
}

/**
 * Walks every route's params and query to gather `(member, importFrom)` pairs that need
 * a corresponding `import type { ... }` line at the top of the generated d.ts.
 *
 * Pairs are deduplicated per (importFrom, member). Multiple routes referencing the same
 * enum produce a single import.
 */
function collectImports(routes: ExtractedRoute[]): Map<string, Set<string>> {
  const importsByPath = new Map<string, Set<string>>()
  const visit = (param: { member: string; importFrom?: string }) => {
    if (!param.importFrom) return
    let names = importsByPath.get(param.importFrom)
    if (!names) {
      names = new Set()
      importsByPath.set(param.importFrom, names)
    }
    names.add(param.member)
  }
  for (const route of routes) {
    for (const key of Object.keys(route.params)) visit(route.params[key])
    for (const key of Object.keys(route.query)) visit(route.query[key])
  }
  return importsByPath
}

/**
 * Generates the content of `typed-router.d.ts` from the extracted route list.
 *
 * Exported for testing.
 */
export function generateDts(routes: ExtractedRoute[], options: TypedRoutesOptions): string {
  const lines: string[] = [
    '// AUTO-GENERATED by vite-plugin-typed-vue-routes — do not edit manually',
    "import type { RouteRecordInfo } from 'vue-router'",
  ]

  const importsByPath = collectImports(routes)
  const importPaths = Array.from(importsByPath.keys()).sort()
  for (const path of importPaths) {
    const names = Array.from(importsByPath.get(path)!).sort()
    lines.push(`import type { ${names.join(', ')} } from '${path}'`)
  }

  lines.push('')
  lines.push("declare module 'vue-router' {")
  lines.push('  interface TypesConfig {')
  lines.push('    RouteNamedMap: {')

  for (const route of routes) {
    const declaredKeys = Object.keys(route.params)
    const pathSegmentKeys = extractPathSegmentNames(route.path)
    const allKeys = Array.from(new Set([...pathSegmentKeys, ...declaredKeys]))
    let paramsRaw = 'Record<never, never>'
    let params = 'Record<never, never>'

    if (allKeys.length > 0) {
      const rawParts = allKeys.map((k) => {
        const declared = route.params[k]
        const rawType = declared ? rawTypeFor(declared) : 'string'
        return `${k}: ${rawType}`
      })
      const resolvedParts = allKeys.map((k) => {
        const declared = route.params[k]
        const resolvedType = declared ? resolvedTypeFor(declared) : 'string'
        return `${k}: ${resolvedType}`
      })
      paramsRaw = `{ ${rawParts.join('; ')} }`
      params = `{ ${resolvedParts.join('; ')} }`
    }

    lines.push(
      `      '${route.name}': RouteRecordInfo<'${route.name}', '${route.path}', ${paramsRaw}, ${params}>`
    )
  }

  lines.push('    }')
  lines.push('    RouteQueryMap: {')

  for (const route of routes) {
    const queryKeys = Object.keys(route.query)
    if (queryKeys.length === 0) {
      lines.push(`      '${route.name}': Record<never, never>`)
    } else {
      const parts = queryKeys.map((k) => {
        const q = route.query[k]
        const optional = q.hasDefault ? '' : '?'
        return `${k}${optional}: ${resolvedTypeFor(q)}`
      })
      lines.push(`      '${route.name}': { ${parts.join('; ')} }`)
    }
  }

  lines.push('    }')

  if (options.strictNamedRoutes) {
    lines.push("    $router: import('typed-vue-routes').TypedRouter")
  }

  lines.push('  }')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

export default function typedRoutes(options: TypedRoutesOptions = {}): Plugin {
  let srcDir: string

  function generate() {
    const routeFiles = findRouteFiles(srcDir)
    const allRoutes: ExtractedRoute[] = []
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf-8')
      allRoutes.push(...extractRoutes(source, file))
    }
    const outPath = join(srcDir, 'typed-router.d.ts')
    writeFileSync(outPath, generateDts(allRoutes, options), 'utf-8')
  }

  return {
    name: 'vite-plugin-typed-vue-routes',

    configResolved(config) {
      srcDir = join(config.root, 'src')
    },

    buildStart() {
      generate()
    },

    watchChange(id) {
      if (id.endsWith('routes.ts') && id.startsWith(srcDir)) {
        generate()
      }
    },
  }
}
