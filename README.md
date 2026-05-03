# typed-vue-routes

Code-first typed routing for Vue Router. Define your routes with a `defineRoute()` factory, get full IDE autocomplete on `router.push` and `useRoute()`, and have URL string params automatically cast to numbers, booleans, and dates at runtime.

Works with Vue Router 4 and 5. Requires TypeScript 5+.

## How it works

You define routes with `defineRoute()`. A Vite plugin reads those definitions at build time and generates a `typed-router.d.ts` that augments Vue Router's `TypesConfig` — the same mechanism used by `unplugin-vue-router`. From that point on, all native Vue Router APIs become type-safe: `router.push`, `useRoute().params`, and `useRoute().query`.

At runtime, a navigation guard casts raw URL strings (everything is a string in the URL) to the types you declared.

## Installation

```sh
npm install typed-vue-routes
```

Peer dependencies: `vue ^3.0.0`, `vue-router ^4.0.0 || ^5.0.0`.

## Setup

### 1. Register the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import typedRoutes from 'typed-vue-routes/plugin'

export default defineConfig({
  plugins: [typedRoutes()],
})
```

The plugin scans every `routes.ts` file under `src/` and writes `src/typed-router.d.ts`. Commit that file — editors pick it up immediately, CI typechecks against it.

### 2. Define your routes

```ts
// src/routes.ts
import { defineRoute, p, toRouteRecords, createCastGuard } from 'typed-vue-routes'
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  defineRoute({
    path: '/',
    name: 'home',
    component: () => import('./HomeView.vue'),
  }),
  defineRoute({
    path: '/users/:id',
    name: 'user-detail',
    params: { id: p.number },
    component: () => import('./UserView.vue'),
  }),
  defineRoute({
    path: '/search',
    name: 'search',
    query: {
      q: p.string,
      page: { type: p.number, default: 1 },
    },
    component: () => import('./SearchView.vue'),
  }),
]

export const router = createRouter({
  history: createWebHistory(),
  routes: toRouteRecords(routes),
})

router.beforeEach(createCastGuard(routes))
```

### 3. Include the generated declarations

Make sure `src/typed-router.d.ts` is included by your `tsconfig.json`. If your `include` already covers `src/**/*.ts`, nothing to change.

## Defining routes

### `defineRoute(config)`

**Leaf route** — a navigable route with a name.

```ts
defineRoute({
  name: 'user-detail',     // required for named navigation
  path: '/users/:id',      // path string; `:param` segments are extracted by the type system
  params: { id: p.number }, // typed path params — keys must match path segments
  query: { tab: p.string }, // typed query params
  component: () => import('./UserView.vue'),
  props: true,             // optional, passed through to Vue Router
})
```

**Layout route** — a wrapping route without its own name, with children.

```ts
defineRoute({
  path: '/users',
  component: () => import('./UserLayout.vue'),
  children: [
    defineRoute({ path: '', name: 'users-list', component: () => import('./UserList.vue') }),
    defineRoute({ path: ':id', name: 'user-detail', params: { id: p.number }, component: () => import('./UserDetail.vue') }),
  ],
})
```

Child paths are resolved relative to their parent. The parent's params are inherited by each child.

### Param parsers — `p`

| Parser | URL string | Resolved type |
|---|---|---|
| `p.string` | `"hello"` | `string` |
| `p.number` | `"42"` | `number` |
| `p.boolean` | `"true"` / `"false"` | `boolean` |
| `p.date` | `"2024-01-15"` (ISO 8601) | `Date` |

### Custom parsers

You can define your own parsers by providing an object with `get` and `set` methods. The plugin will automatically detect them.

To get the correct TypeScript type in the generated `.d.ts`, you can either:
1. **Use a type annotation:** `const myParser: Parser<MyType> = { ... }`
2. **Provide a `type` hint:** `{ get, set, type: 'MyType' }`

```ts
const slugParser = {
  get: (raw: string) => raw.toLowerCase(),
  set: (val: string) => val,
  type: 'Slug' // Injected into the generated types
}

defineRoute({
  path: '/post/:slug',
  name: 'post-detail',
  params: { slug: slugParser },
  component: ...
})
```

## Reading typed params in components

### `useTypedRoute(name?)`

```ts
// Narrowed to a single route — IDE knows the exact types
const { route, query } = useTypedRoute('search')

route.params  // typed per RouteNamedMap
query.value   // { q: string | undefined; page: number }
```

In a component that can be rendered under multiple routes:

```ts
const { route, query } = useTypedRoute(['route-a', 'route-b'])
```

Without an argument, returns a union of all registered routes:

```ts
const { route } = useTypedRoute()
if (route.name === 'user-detail') {
  route.params.id // number
}
```

In development, `useTypedRoute('search')` emits a `console.warn` if the current route name doesn't match `'search'`, catching mismatches between route definitions and components.

## Typed navigation

### `useTypedRouter()`

A drop-in replacement for `useRouter()` that restricts `push` and `replace` to named-route objects. String paths and `{ path }` objects become compile errors.

```ts
import { useTypedRouter } from 'typed-vue-routes'

const router = useTypedRouter()

router.push({ name: 'user-detail', params: { id: 42 } }) // typed
router.push('/users/42')                                  // type error
router.push({ path: '/users/42' })                       // type error
```

`TypedRouter` is assignable to `Router`, so it works wherever Vue Router's `Router` type is expected.

### `strictNamedRoutes` plugin option

To enforce typed navigation globally — including `this.$router` in Options API and templates — enable `strictNamedRoutes`:

```ts
typedRoutes({ strictNamedRoutes: true })
```

This augments `TypesConfig['$router']` with `TypedRouter`, making path-based calls a compile error project-wide without requiring `useTypedRouter()` per component.

### ESLint rule (optional)

Ban `useRouter` imports to enforce `useTypedRouter` in Composition API code:

```js
// eslint.config.js
{
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: 'vue-router',
        importNames: ['useRouter'],
        message: "Use useTypedRouter() from 'typed-vue-routes' instead.",
      }],
    }],
  },
}
```

## API reference

### Runtime (`typed-vue-routes`)

| Export | Description |
|---|---|
| `defineRoute(config)` | Declare a typed route or layout group |
| `toRouteRecords(defs)` | Convert `defineRoute` output to `RouteRecordRaw[]` for `createRouter` |
| `createCastGuard(defs)` | Build a `beforeEach` navigation guard that casts URL strings to typed values |
| `useTypedRoute(name?)` | Composable — typed `route` + parsed `query` computed ref |
| `useTypedRouter()` | Composable — `useRouter()` narrowed to name-only navigation |
| `p` | Parser namespace: `p.string`, `p.number`, `p.boolean`, `p.date` |

### Plugin (`typed-vue-routes/plugin`)

```ts
import typedRoutes from 'typed-vue-routes/plugin'

typedRoutes(options?)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `strictNamedRoutes` | `boolean` | `false` | Augment `$router` with `TypedRouter` to ban path navigation globally |

## Generated file

`src/typed-router.d.ts` is written automatically by the plugin and should be committed. Do not edit it manually — it is overwritten on every build.

Example output:

```ts
// AUTO-GENERATED by vite-plugin-typed-vue-routes — do not edit manually
import type { RouteRecordInfo } from 'vue-router'

declare module 'vue-router' {
  interface TypesConfig {
    RouteNamedMap: {
      'home': RouteRecordInfo<'home', '/', Record<never, never>, Record<never, never>>
      'user-detail': RouteRecordInfo<'user-detail', '/users/:id', { id: number }, { id: number }>
      'search': RouteRecordInfo<'search', '/search', Record<never, never>, Record<never, never>>
    }
    RouteQueryMap: {
      'home': Record<never, never>
      'user-detail': Record<never, never>
      'search': { q?: string; page: number }
    }
  }
}
```

## License

MIT
