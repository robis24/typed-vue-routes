import { describe, it, expect } from "vitest";
import { extractRoutes, generateDts, type ExtractedRoute } from "../src/plugin";

describe("extractRoutes", () => {
  it("extracts a simple leaf route", () => {
    const source = `
      import { defineRoute } from 'typed-vue-routes'
      export const routes = [
        defineRoute({ path: '/users', name: 'users-list', component: {} })
      ]
    `;

    expect(extractRoutes(source, "routes.ts")).toEqual([
      { name: "users-list", path: "/users", params: {}, query: {} },
    ]);
  });

  it("extracts typed path params", () => {
    const source = `
      import { defineRoute } from 'typed-vue-routes'
      import { p } from 'typed-vue-routes'
      export const routes = [
        defineRoute({ path: '/users/:id', name: 'user-detail', params: { id: p.number }, component: {} })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.params).toEqual({ id: { member: "number" } });
    expect(route.path).toBe("/users/:id");
  });

  it("extracts all param types", () => {
    const source = `
      import { defineRoute, p } from 'typed-vue-routes'
      export const routes = [
        defineRoute({
          path: '/x/:a/:b/:c/:d',
          name: 'x',
          params: { a: p.number, b: p.boolean, c: p.date, d: p.string },
          component: {}
        })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.params).toEqual({
      a: { member: "number" },
      b: { member: "boolean" },
      c: { member: "date" },
      d: { member: "string" },
    });
  });

  it("extracts query params — shorthand and object form", () => {
    const source = `
      import { defineRoute, p } from 'typed-vue-routes'
      export const routes = [
        defineRoute({
          path: '/search',
          name: 'search',
          query: { q: p.string, page: { type: p.number, default: 1 } },
          component: {}
        })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.query).toEqual({
      q: { member: "string", hasDefault: false },
      page: { member: "number", hasDefault: true },
    });
  });

  it("resolves child paths relative to their group", () => {
    const source = `
      import { defineRoute } from 'typed-vue-routes'
      export const routes = [
        defineRoute({
          path: '/users',
          component: {},
          children: [
            defineRoute({ path: ':id', name: 'user-detail', component: {} }),
            defineRoute({ path: '', name: 'users-list', component: {} }),
          ]
        })
      ]
    `;
    const routes = extractRoutes(source, "routes.ts");
    const detail = routes.find((r) => r.name === "user-detail");
    const list = routes.find((r) => r.name === "users-list");

    expect(detail?.path).toBe("/users/:id");
    expect(list?.path).toBe("/users");
  });

  it("inherits params from parent group into children", () => {
    const source = `
      import { defineRoute, p } from 'typed-vue-routes'
      export const routes = [
        defineRoute({
          path: '/orgs/:orgId',
          component: {},
          children: [
            defineRoute({ path: 'users', name: 'org-users', params: { orgId: p.number }, component: {} }),
          ]
        })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.params).toEqual({ orgId: { member: "number" } });
    expect(route.path).toBe("/orgs/:orgId/users");
  });

  it("skips anonymous routes (no name)", () => {
    const source = `
      import { defineRoute } from 'typed-vue-routes'
      export const routes = [
        defineRoute({ path: '/anon', component: {} })
      ]
    `;

    expect(extractRoutes(source, "routes.ts")).toEqual([]);
  });

  it("handles multiple route files merged together", () => {
    const sourceA = `
      import { defineRoute } from 'typed-vue-routes'
      export const routes = [defineRoute({ path: '/a', name: 'route-a', component: {} })]
    `;
    const sourceB = `
      import { defineRoute } from 'typed-vue-routes'
      export const routes = [defineRoute({ path: '/b', name: 'route-b', component: {} })]
    `;
    const routes = [
      ...extractRoutes(sourceA, "a/routes.ts"),
      ...extractRoutes(sourceB, "b/routes.ts"),
    ];

    expect(routes.map((r) => r.name)).toEqual(["route-a", "route-b"]);
  });

  it("extracts custom parsers via type annotation", () => {
    const source = `
      import { defineRoute, Parser } from 'typed-vue-routes'
      const myParser: Parser<MyType> = { get: () => {}, set: () => {} }
      export const routes = [
        defineRoute({ path: '/:id', name: 'r', params: { id: myParser }, component: {} })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.params).toEqual({ id: { member: "MyType" } });
  });

  it("extracts custom parsers via shape detection (anonymous object)", () => {
    const source = `
      import { defineRoute } from 'typed-vue-routes'
      export const routes = [
        defineRoute({ 
          path: '/:id', 
          name: 'r', 
          params: { 
            id: { get: () => {}, set: () => {}, type: 'Custom' } 
          }, 
          component: {} 
        })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.params).toEqual({ id: { member: "Custom" } });
  });

  it("extracts custom parsers via shape detection (variable)", () => {
    const source = `
      import { defineRoute } from 'typed-vue-routes'
      const custom = { get: () => {}, set: () => {}, type: 'Custom' }
      export const routes = [
        defineRoute({ path: '/:id', name: 'r', params: { id: custom }, component: {} })
      ]
    `;
    const [route] = extractRoutes(source, "routes.ts");

    expect(route.params).toEqual({ id: { member: "Custom" } });
  });
});

describe("generateDts", () => {
  it("emits RouteNamedMap with correct RouteRecordInfo entries", () => {
    const routes = [
      {
        name: "user-detail",
        path: "/users/:id",
        params: { id: { member: "number" } },
        query: {},
      },
    ];
    const output = generateDts(routes, {});

    expect(output).toContain(
      "'user-detail': RouteRecordInfo<'user-detail', '/users/:id', { id: number }, { id: number }>",
    );
  });

  it("handles custom parser types in generateDts", () => {
    const routes = [
      {
        name: "custom",
        path: "/:id",
        params: { id: { member: "MyType" } },
        query: { q: { member: "QueryType", hasDefault: false } },
      },
    ];
    const output = generateDts(routes, {});

    expect(output).toContain("{ id: MyType }");
    expect(output).toContain("q?: QueryType");
  });

  it("emits RouteQueryMap inside the TypesConfig augmentation block", () => {
    const routes = [{ name: "home", path: "/", params: {}, query: {} }];
    const output = generateDts(routes, {});
    // RouteQueryMap must live inside the declare module block, not as a top-level export
    const moduleBlockStart = output.indexOf("declare module 'vue-router'");
    const moduleBlockEnd = output.lastIndexOf("}");
    const insideModule = output.slice(moduleBlockStart, moduleBlockEnd);

    expect(insideModule).toContain("RouteQueryMap:");
    expect(output).not.toContain("export interface RouteQueryMap");
  });

  it("emits Record<never, never> for routes with no query", () => {
    const routes = [{ name: "home", path: "/", params: {}, query: {} }];
    const output = generateDts(routes, {});

    expect(output).toContain("'home': Record<never, never>");
  });

  it("emits optional query param when no default, required when default present", () => {
    const routes = [
      {
        name: "search",
        path: "/search",
        params: {},
        query: {
          q: { member: "string", hasDefault: false },
          page: { member: "number", hasDefault: true },
        },
      },
    ];
    const output = generateDts(routes, {});

    expect(output).toContain("q?: string");
    expect(output).toContain("page: number");
  });

  it("emits date param as string in ParamsRaw, Date in resolved Params", () => {
    const routes = [
      {
        name: "events",
        path: "/events/:date",
        params: { date: { member: "date" } },
        query: {},
      },
    ];
    const output = generateDts(routes, {});

    expect(output).toContain("{ date: string }"); // ParamsRaw
    expect(output).toContain("{ date: Date }"); // Params
  });

  it("does NOT emit $router by default", () => {
    const routes = [{ name: "home", path: "/", params: {}, query: {} }];

    expect(generateDts(routes, {})).not.toContain("$router");
  });

  it("emits $router via typed-vue-routes package import when strictNamedRoutes is true", () => {
    const routes = [{ name: "home", path: "/", params: {}, query: {} }];
    const output = generateDts(routes, { strictNamedRoutes: true });

    expect(output).toContain("$router:");
    expect(output).toContain("import('typed-vue-routes').TypedRouter");
  });

  it("snapshot: full output for a representative route set", () => {
    const routes: ExtractedRoute[] = [
      { name: "home", path: "/", params: {}, query: {} },
      {
        name: "user-detail",
        path: "/users/:id",
        params: { id: { member: "number" } },
        query: {},
      },
      {
        name: "search",
        path: "/search",
        params: {},
        query: {
          q: { member: "string", hasDefault: false },
          page: { member: "number", hasDefault: true },
        },
      },
    ];

    expect(generateDts(routes, { strictNamedRoutes: true }))
      .toMatchInlineSnapshot(`
      "// AUTO-GENERATED by vite-plugin-typed-vue-routes — do not edit manually
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
          $router: import('typed-vue-routes').TypedRouter
        }
      }
      "
    `);
  });
});
