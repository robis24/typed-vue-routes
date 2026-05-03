import type { Plugin } from 'vite'
import * as ts from 'typescript'
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface ExtractedParam {
  member: string  // 'number' | 'boolean' | 'date' | 'string'
}

interface ExtractedQueryParam {
  member: string
  hasDefault: boolean
}

interface ExtractedRoute {
  name: string
  path: string
  params: Record<string, ExtractedParam>
  query: Record<string, ExtractedQueryParam>
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

// Returns the p.x member name if the node is a valid `p.member` access, otherwise undefined
function getPMember(node: ts.Expression): string | undefined {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'p' &&
    VALID_P_MEMBERS.has(node.name.text)
  ) {
    return node.name.text
  }
  return undefined
}

function extractParamTypes(obj: ts.ObjectLiteralExpression): Record<string, ExtractedParam> {
  const result: Record<string, ExtractedParam> = {}
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const key = getPropName(prop.name)
    if (!key) continue
    const member = getPMember(prop.initializer)
    if (member) result[key] = { member }
  }
  return result
}

function extractQueryTypes(obj: ts.ObjectLiteralExpression): Record<string, ExtractedQueryParam> {
  const result: Record<string, ExtractedQueryParam> = {}
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const key = getPropName(prop.name)
    if (!key) continue

    const member = getPMember(prop.initializer)
    if (member) {
      // Shorthand: query: { page: p.number }
      result[key] = { member, hasDefault: false }
    } else if (ts.isObjectLiteralExpression(prop.initializer)) {
      // Object form: query: { page: { type: p.number, default: 1 } }
      let member = 'string'
      let hasDefault = false
      for (const inner of prop.initializer.properties) {
        if (!ts.isPropertyAssignment(inner)) continue
        const innerKey = getPropName(inner.name)
        if (innerKey === 'type') {
          const m = getPMember(inner.initializer)
          if (m) member = m
        } else if (innerKey === 'default') {
          hasDefault = true
        }
      }
      result[key] = { member, hasDefault }
    }
  }
  return result
}

function extractRoutes(source: string, filename: string): ExtractedRoute[] {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, false)
  const routes: ExtractedRoute[] = []

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineRoute' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const obj = node.arguments[0] as ts.ObjectLiteralExpression
      let name: string | undefined
      let path: string | undefined
      let params: Record<string, ExtractedParam> = {}
      let query: Record<string, ExtractedQueryParam> = {}

      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key = getPropName(prop.name)

        if (key === 'name' && ts.isStringLiteral(prop.initializer)) {
          name = prop.initializer.text
        } else if (key === 'path' && ts.isStringLiteral(prop.initializer)) {
          path = prop.initializer.text
        } else if (key === 'params' && ts.isObjectLiteralExpression(prop.initializer)) {
          params = extractParamTypes(prop.initializer)
        } else if (key === 'query' && ts.isObjectLiteralExpression(prop.initializer)) {
          query = extractQueryTypes(prop.initializer)
        }
      }

      if (name && path) {
        routes.push({ name, path, params, query })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

function generateDts(routes: ExtractedRoute[]): string {
  const lines: string[] = [
    '// AUTO-GENERATED by vite-plugin-typed-routes — do not edit manually',
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
      const resolvedParts = paramKeys.map((k) => `${k}: ${MEMBER_TO_RESOLVED[route.params[k].member] ?? 'string'}`)
      paramsRaw = `{ ${rawParts.join('; ')} }`
      params = `{ ${resolvedParts.join('; ')} }`
    }

    lines.push(
      `      '${route.name}': RouteRecordInfo<'${route.name}', '${route.path}', ${paramsRaw}, ${params}>`
    )
  }

  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('')

  lines.push('export interface RouteQueryMap {')
  for (const route of routes) {
    const queryKeys = Object.keys(route.query)
    if (queryKeys.length === 0) {
      lines.push(`  '${route.name}': Record<never, never>`)
    } else {
      const parts = queryKeys.map((k) => {
        const q = route.query[k]
        const optional = q.hasDefault ? '' : '?'
        return `${k}${optional}: ${MEMBER_TO_RESOLVED[q.member] ?? 'string'}`
      })
      lines.push(`  '${route.name}': { ${parts.join('; ')} }`)
    }
  }
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

export default function typedRoutes(): Plugin {
  let srcDir: string

  function generate() {
    const routeFiles = findRouteFiles(srcDir)
    const allRoutes: ExtractedRoute[] = []
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf-8')
      allRoutes.push(...extractRoutes(source, file))
    }
    const outPath = join(srcDir, 'typed-router.d.ts')
    writeFileSync(outPath, generateDts(allRoutes), 'utf-8')
  }

  return {
    name: 'vite-plugin-typed-routes',

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
