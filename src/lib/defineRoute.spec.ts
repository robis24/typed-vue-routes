import { describe, it, expect } from "vitest";
import { defineRoute, isRouteGroup } from "./defineRoute";
import { p } from "./parsers";

describe("defineRoute — leaf", () => {
  it("returns a RouteDefinition with __typed flag", () => {
    const route = defineRoute({
      path: "/users",
      name: "users-list",
      component: {},
    });

    expect(route.__typed).toBe(true);
    expect(route.name).toBe("users-list");
    expect(route.path).toBe("/users");
  });

  it("carries params and query configs", () => {
    const route = defineRoute({
      path: "/users/:id",
      name: "user-detail",
      params: { id: p.number },
      query: { q: p.string },
      component: {},
    });

    expect(route.params).toEqual({ id: p.number });
    expect(route.query).toEqual({ q: p.string });
  });

  it("isRouteGroup returns false", () => {
    const route = defineRoute({
      path: "/users",
      name: "users-list",
      component: {},
    });

    expect(isRouteGroup(route)).toBe(false);
  });
});

describe("defineRoute — group", () => {
  it("returns a RouteGroup with __group flag", () => {
    const group = defineRoute({
      path: "/users",
      component: {},
      children: [
        defineRoute({ path: ":id", name: "user-detail", component: {} }),
      ],
    });

    expect(group.__group).toBe(true);
    expect(group.path).toBe("/users");
  });

  it("isRouteGroup returns true", () => {
    const group = defineRoute({
      path: "/users",
      component: {},
      children: [
        defineRoute({ path: ":id", name: "user-detail", component: {} }),
      ],
    });

    expect(isRouteGroup(group)).toBe(true);
  });

  it("carries children", () => {
    const child = defineRoute({
      path: ":id",
      name: "user-detail",
      component: {},
    });
    const group = defineRoute({
      path: "/users",
      component: {},
      children: [child],
    });

    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBe(child);
  });

  it("name is optional on groups", () => {
    const group = defineRoute({ path: "/users", component: {}, children: [] });

    expect(group.name).toBeUndefined();
  });

  it("component is optional on groups (guard-only wrapper)", () => {
    const group = defineRoute({
      path: "/protected",
      beforeEnter: () => true,
      children: [
        defineRoute({ path: "", name: "protected-home", component: {} }),
      ],
    });

    expect(group.component).toBeUndefined();
    expect(group.beforeEnter).toBeDefined();
  });

  it("carries params for downstream cast-guard inheritance", () => {
    const group = defineRoute({
      path: "/orgs/:orgId",
      component: {},
      params: { orgId: p.number },
      children: [
        defineRoute({ path: "users", name: "org-users", component: {} }),
      ],
    });

    expect(group.params).toEqual({ orgId: p.number });
  });

  it("carries meta, beforeEnter, redirect, alias on groups", () => {
    const guard = () => true;
    const group = defineRoute({
      path: "/admin",
      component: {},
      meta: { requiresAuth: true },
      beforeEnter: guard,
      redirect: "/admin/dashboard",
      alias: "/a",
      children: [
        defineRoute({ path: "dashboard", name: "admin-dashboard", component: {} }),
      ],
    });

    expect(group.meta).toEqual({ requiresAuth: true });
    expect(group.beforeEnter).toBe(guard);
    expect(group.redirect).toBe("/admin/dashboard");
    expect(group.alias).toBe("/a");
  });
});

describe("defineRoute — params with widened TPath", () => {
  // When the surrounding array is annotated as ReadonlyArray<RouteDefinition | RouteGroup>,
  // contextual typing widens TPath to `string`. ExtractPathParams<string> is `never`, which
  // would make the strict path-key check reject every params declaration. The conditional
  // `string extends TPath ? unknown : ...` in the lib's signature lets these calls compile.
  it("accepts params when the call site contextually widens TPath to string", () => {
    type AnyDef = ReturnType<typeof defineRoute<string, string>>;
    const list: ReadonlyArray<AnyDef> = [
      defineRoute({
        path: "/users/:id",
        name: "user-detail",
        params: { id: p.number },
        component: {},
      }),
    ];

    expect(list).toHaveLength(1);
  });
});

describe("defineRoute — leaf pass-through fields", () => {
  it("carries meta, beforeEnter, redirect, alias", () => {
    const guard = () => true;
    const route = defineRoute({
      path: "/users/:id",
      name: "user-detail",
      component: {},
      meta: { roles: ["admin"] },
      beforeEnter: guard,
      redirect: "/login",
      alias: "/u/:id",
    });

    expect(route.meta).toEqual({ roles: ["admin"] });
    expect(route.beforeEnter).toBe(guard);
    expect(route.redirect).toBe("/login");
    expect(route.alias).toBe("/u/:id");
  });
});
