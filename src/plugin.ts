import type { Plugin } from 'vite'
import * as ts from 'typescript'
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** @internal */
export interface ExtractedParam {
  member: string  // 'number' | 'boolean' | 'date' | 'string'
}

/** @internal */
export interface ExtractedQueryParam {
  member: string
  hasDefault: boolean
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

function getParserType(node: ts.Expression, sourceFile: ts.SourceFile): string | undefined {
  // 1. Check legacy p.* namespace (on the raw node first)
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'p' &&
    VALID_P_MEMBERS.has(node.name.text)
  ) {
    return node.name.text
  }

  // 2. Resolve the node (handling identifiers and finding their declarations)
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
                  return typeArg.typeName.text
                }
                // Handle basic types: number, string, boolean
                if (typeArg.kind === ts.SyntaxKind.NumberKeyword) return 'number'
                if (typeArg.kind === ts.SyntaxKind.StringKeyword) return 'string'
                if (typeArg.kind === ts.SyntaxKind.BooleanKeyword) return 'boolean'
              }
            }
            if (decl.initializer) return getParserType(decl.initializer, sourceFile)
          }
        }
      }
    }
  }

  // 3. Check for object shape { get, set }
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
      return explicitType ?? 'string'
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
      const member = getParserType(prop.initializer, sourceFile)
      if (member) result[key] = { member }
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text
      const member = getParserType(prop.name, sourceFile)
      if (member) result[key] = { member }
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

      const member = getParserType(prop.initializer, sourceFile)
      if (member) {
        result[key] = { member, hasDefault: false }
      } else {
        const val = resolveNode(prop.initializer, sourceFile)
        if (ts.isObjectLiteralExpression(val)) {
          let m = 'string'
          let hasDefault = false
          for (const inner of val.properties) {
            if (!ts.isPropertyAssignment(inner)) continue
            const innerKey = getPropName(inner.name)
            if (innerKey === 'type') {
              const pm = getParserType(inner.initializer, sourceFile)
              if (pm) m = pm
            } else if (innerKey === 'default') {
              hasDefault = true
            }
          }
          result[key] = { member: m, hasDefault }
        }
      }
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text
      const member = getParserType(prop.name, sourceFile)
      if (member) {
        result[key] = { member, hasDefault: false }
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
 * Generates the content of `typed-router.d.ts` from the extracted route list.
 *
 * Exported for testing.
 */
export function generateDts(routes: ExtractedRoute[], options: TypedRoutesOptions): string {
  const lines: string[] = [
    '// AUTO-GENERATED by vite-plugin-typed-vue-routes — do not edit manually',
    "import type { RouteRecordInfo } from 'vue-router'",
    '',
    "declare module 'vue-router' {",
    '  interface TypesConfig {',
    '    RouteNamedMap: {',
  ]

  for (const route of routes) {
    const paramKeys = Object.keys(route.params)
    let paramsRaw = 'Record<never, never>'
    let params = 'Record<never, never>'

    if (paramKeys.length > 0) {
      const rawParts = paramKeys.map((k) => `${k}: ${MEMBER_TO_RAW[route.params[k].member] ?? 'string'}`)
      const resolvedParts = paramKeys.map(
        (k) => `${k}: ${MEMBER_TO_RESOLVED[route.params[k].member] ?? route.params[k].member}`
      )
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
        return `${k}${optional}: ${MEMBER_TO_RESOLVED[q.member] ?? q.member}`
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
