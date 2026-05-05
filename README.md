# typed-vue-routes

Typed routing and runtime param casting for Vue Router, based on your route config.

Declare routes with `defineRoute()` and a parser per param — `p.number`, `p.boolean`, `p.date`, or your own. A Vite plugin reads those declarations and generates `typed-router.d.ts`, making `router.push` and `useRoute()` fully typed. A `beforeEach` guard then validates and casts every URL string to the declared type before the component mounts, so `route.params.id` is an actual `number` at runtime.

Also covered: typed query params with defaults, and custom parsers for any `string ↔ T` mapping — enums, slugs, custom date formats.

Works with Vue Router 4 and 5. Requires TypeScript 5+ and Vite 5+.
If you want filesystem-based routing where each `.vue` file under `pages/` becomes a route, use [`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router) — that's the official direction and it's mature.

## Installation

```sh
npm install typed-vue-routes
```

Peer dependencies: `vue ^3.0.0`, `vue-router ^4.0.0 || ^5.0.0`.

## Setup

### 1. Register the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import typedRoutes from "typed-vue-routes/plugin";

export default defineConfig({
  plugins: [typedRoutes()],
});
```

The plugin scans every `routes.ts` file under `src/` and writes `src/typed-router.d.ts`. Either commit that file, or `.gitignore` it and rely on `vite` regenerating it on dev/build (in which case fresh clones type-error until the first run — pick whichever fits your workflow).

### 2. Define your routes

```ts
// src/routes.ts
import {
  defineRoute,
  p,
  toRouteRecords,
  createCastGuard,
} from "typed-vue-routes";
import { createRouter, createWebHistory } from "vue-router";

const routes = [
  defineRoute({
    path: "/",
    name: "home",
    component: () => import("./HomeView.vue"),
  }),
  defineRoute({
    path: "/users/:id",
    name: "user-detail",
    params: { id: p.number },
    component: () => import("./UserView.vue"),
  }),
  defineRoute({
    path: "/search",
    name: "search",
    query: {
      q: p.string,
      page: { type: p.number, default: 1 },
    },
    component: () => import("./SearchView.vue"),
  }),
];

export const router = createRouter({
  history: createWebHistory(),
  routes: toRouteRecords(routes),
});

router.beforeEach(createCastGuard(routes));
```

### 3. Include the generated declarations

Make sure `src/typed-router.d.ts` is picked up by `tsconfig.json`. If your `include` already covers `src/**/*.ts`, nothing to change.

## Defining routes

### Leaf routes

```ts
defineRoute({
  name: "user-detail", // required for named navigation
  path: "/users/:id", // path string; `:param` segments are extracted by the type system
  params: { id: p.number }, // optional; path segments without an entry default to `string`
  query: { tab: p.string }, // optional
  component: () => import("./UserView.vue"),

  // Pass-through to RouteRecordRaw — keep them where they always lived:
  meta: { requiresAuth: true },
  beforeEnter: (to, from) => {
    /* ... */
  },
  redirect: "/users",
  alias: "/u/:id",
  props: true,
});
```

`name` is required on every leaf. If you have a true unnamed route (e.g. a catch-all `'/:catchAll(.*)*'`), keep it as a plain `RouteRecordRaw` and concat it in:

```ts
const routes: RouteRecordRaw[] = [
  ...toRouteRecords(appRoutes),
  { path: "/:catchAll(.*)*", component: NotFoundPage },
];
```

### Layout routes

A wrapping route with children. The wrapper itself doesn't need a name.

```ts
defineRoute({
  path: "/users",
  component: () => import("./UserLayout.vue"),
  children: [
    defineRoute({
      path: "",
      name: "users-list",
      component: () => import("./UserList.vue"),
    }),
    defineRoute({
      path: ":id",
      name: "user-detail",
      params: { id: p.number },
      component: () => import("./UserDetail.vue"),
    }),
  ],
});
```

Child paths resolve relative to their parent. Parent params are inherited by each child.

### Guard-only wrappers

`component` is optional on layout routes, so you can use a wrapper purely to share a `beforeEnter` guard:

```ts
defineRoute({
  path: "/",
  beforeEnter: requireAuth,
  // no component — children render directly under the parent's <router-view>
  children: [
    defineRoute({ name: "dashboard", path: "dashboard", component: Dashboard }),
    defineRoute({ name: "settings", path: "settings", component: Settings }),
  ],
});
```

### Param parsers — `p`

Built-in parsers:

| Parser      | URL string                | Resolved type |
| ----------- | ------------------------- | ------------- |
| `p.string`  | `"hello"`                 | `string`      |
| `p.number`  | `"42"`                    | `number`      |
| `p.boolean` | `"true"` / `"false"`      | `boolean`     |
| `p.date`    | `"2024-01-15"` (ISO 8601) | `Date`        |

Path segments without an entry in `params` default to `string` — you only need to declare params you want to cast.

### Custom parsers

Implement the `Parser<T>` interface — `get` parses a URL string into `T` (return `'miss'` on failure), `set` serializes `T` back to a string.

```ts
import type { Parser } from "typed-vue-routes";

type Status = "active" | "inactive" | "archived";

const statusParser: Parser<Status> = {
  get: (raw) =>
    ["active", "inactive", "archived"].includes(raw) ? (raw as Status) : "miss",
  set: (val) => val,
};

defineRoute({
  path: "/items",
  name: "item-list",
  query: { status: statusParser },
  component: () => import("./ItemList.vue"),
});
```

The Vite plugin reads the `Parser<T>` type annotation and emits `status?: Status` in the generated `.d.ts`, so `query.value.status` is `Status | undefined` — not `string`.

For inline parsers or when the type argument can't be inferred from the annotation (e.g. union literals), add a `type` string that the plugin injects verbatim:

```ts
const statusParser = {
  get: (raw: string): Status | 'miss' => ...,
  set: (val: Status) => val,
  type: "'active' | 'inactive' | 'archived'",  // injected as-is into the .d.ts
}
```

The best use case is query params that act as enum filters — you get precise union types in the IDE instead of `string`.

### `p.enum`

For TypeScript enums and `const` enum-like objects, use the built-in `p.enum` helper instead of writing a parser by hand:

```ts
import { defineRoute, p } from 'typed-vue-routes'
import { Status } from '@/types/status'

defineRoute({
  path: '/items',
  name: 'item-list',
  query: { status: p.enum(Status, '@/types/status') },
  component: () => import('./ItemList.vue'),
})
```

The second argument is the import path — the Vite plugin reads it at build time and emits `import type { Status } from '@/types/status'` in the generated `.d.ts`, so `query.value.status` resolves to the enum type rather than `string`.

Both string enums (`{ Todo: 'todo' }`) and numeric enums are supported. Invalid URL values return `'miss'` and the navigation guard blocks the navigation.

## Reading typed params

### `useTypedRoute(name?)`

```ts
// Narrow to one route — params and query are exact:
const { route, query } = useTypedRoute("search");
route.params; // typed per the route's declared params
query.value; // { q: string | undefined; page: number }

// Narrow to multiple known routes when a component is shared:
const { route } = useTypedRoute(["route-a", "route-b"]);

// Or: discriminate by name on the union of all routes:
const { route } = useTypedRoute();
if (route.name === "user-detail") {
  route.params.id; // number
}
```

In development, `useTypedRoute('search')` emits `console.warn` if the active route name doesn't match — catches drift between route definitions and components.

You can also use vanilla Vue Router 4.5+ narrowing: `useRoute<'search'>()` — it works because the plugin augments `TypesConfig.RouteNamedMap`. `useTypedRoute()` adds the parsed-query computed ref and the dev-mode mismatch warning on top.

## Typed navigation

### `useTypedRouter()`

Drop-in replacement for `useRouter()` that restricts `push`/`replace` to named-route objects. String paths and `{ path }` objects become compile errors.

```ts
import { useTypedRouter } from "typed-vue-routes";

const router = useTypedRouter();

router.push({ name: "user-detail", params: { id: 42 } }); // typed
router.push("/users/42"); // type error
router.push({ path: "/users/42" }); // type error
```

`TypedRouter` is assignable to `Router`, so it slots in wherever Vue Router's `Router` type is expected.

### `strictNamedRoutes` plugin option

To enforce typed navigation everywhere — including `this.$router` in Options API and templates — enable `strictNamedRoutes`:

```ts
typedRoutes({ strictNamedRoutes: true });
```

This augments `TypesConfig['$router']` with `TypedRouter`, making path-based navigation a compile error project-wide. Useful as a final tightening step once you've migrated your `router.push` callsites.

### ESLint rule (optional)

To force `useTypedRouter` instead of `useRouter` in Composition API code:

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

## Supported route features

Every `RouteRecordRaw` field listed below is accepted by `defineRoute()` and forwarded as-is to the underlying record:

- `name`, `path`, `component`, `children`
- `params`, `query` (typed equivalents — see above)
- `props`
- `meta`
- `beforeEnter`
- `redirect`
- `alias`

Group routes (those with `children`) accept an optional `component` for guard-only wrappers.

## Known limitations

- **Leaf routes require `name`.** Unnamed leaves don't fit the typed-routes model. Catch-all routes work as plain `RouteRecordRaw` concat'd into the final array.
- **No `?` / `*` / `+` path operators in the type system.** Paths like `/items/:id?` resolve as `string`, not `string | undefined`. Vue Router itself handles them correctly at runtime; only the type narrowing is missing.
- **No named views (`components`, plural).** Single-component routes only. Open an issue if you need multi-view typing.
- **Composables shared across routes still need explicit narrowing.** A component that mounts under multiple route names will get `useRoute()` typed as the union of those routes; narrow with `useRoute<'a' | 'b'>()` or `useTypedRoute(['a', 'b'])`. This is the same constraint `unplugin-vue-router` and vanilla typed Vue Router have.

## API reference

### Runtime (`typed-vue-routes`)

| Export                  | Description                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `defineRoute(config)`   | Declare a typed leaf or layout route                                                                    |
| `toRouteRecords(defs)`  | Convert `defineRoute` output to `RouteRecordRaw[]` for `createRouter`                                   |
| `createCastGuard(defs)` | Build a `beforeEach` navigation guard that casts URL strings to typed values and applies query defaults |
| `useTypedRoute(name?)`  | Composable — typed `route` + parsed `query` computed ref                                                |
| `useTypedRouter()`      | Composable — `useRouter()` narrowed to name-only navigation                                             |
| `p`                     | Parser namespace: `p.string`, `p.number`, `p.boolean`, `p.date`                                         |
| `Parser<T>`             | Type for declaring custom parsers                                                                       |

### Plugin (`typed-vue-routes/plugin`)

```ts
import typedRoutes from 'typed-vue-routes/plugin'

typedRoutes(options?)
```

| Option              | Type      | Default | Description                                                          |
| ------------------- | --------- | ------- | -------------------------------------------------------------------- |
| `strictNamedRoutes` | `boolean` | `false` | Augment `$router` with `TypedRouter` to ban path navigation globally |

## Generated file

`src/typed-router.d.ts` is written automatically by the plugin. Do not edit it by hand — it is overwritten on every build.

Example output:

```ts
// AUTO-GENERATED by vite-plugin-typed-vue-routes — do not edit manually
import type { RouteRecordInfo } from "vue-router";

declare module "vue-router" {
  interface TypesConfig {
    RouteNamedMap: {
      home: RouteRecordInfo<
        "home",
        "/",
        Record<never, never>,
        Record<never, never>
      >;
      "user-detail": RouteRecordInfo<
        "user-detail",
        "/users/:id",
        { id: number },
        { id: number }
      >;
      search: RouteRecordInfo<
        "search",
        "/search",
        Record<never, never>,
        Record<never, never>
      >;
    };
    RouteQueryMap: {
      home: Record<never, never>;
      "user-detail": Record<never, never>;
      search: { q?: string; page: number };
    };
  }
}
```

## License

MIT
