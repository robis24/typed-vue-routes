import { describe, it, expect } from "vitest";
import { toRouteRecords, createCastGuard } from "./castRoutes";
import { defineRoute } from "./defineRoute";
import { p } from "./parsers";
import type { RouteLocationNormalized } from "vue-router";

function mockLocation(
  overrides: Record<string, unknown> = {},
): RouteLocationNormalized {
  return {
    name: "",
    path: "",
    params: {},
    query: {},
    hash: "",
    fullPath: "",
    matched: [],
    meta: {},
    redirectedFrom: undefined,
    ...overrides,
  } as unknown as RouteLocationNormalized;
}

describe("toRouteRecords", () => {
  it("converts a flat leaf to a RouteRecordRaw", () => {
    const route = defineRoute({
      path: "/users",
      name: "users-list",
      component: {},
    });

    const [record] = toRouteRecords([route]);

    expect(record.path).toBe("/users");
    expect(record.name).toBe("users-list");
  });

  it("converts a group to a nested RouteRecordRaw", () => {
    const group = defineRoute({
      path: "/users",
      component: {},
      children: [
        defineRoute({ path: ":id", name: "user-detail", component: {} }),
      ],
    });

    const [record] = toRouteRecords([group]);

    expect(record.path).toBe("/users");
    expect(record.children).toHaveLength(1);
    expect(record.children![0].name).toBe("user-detail");
  });

  it("passes props through on leaf routes", () => {
    const route = defineRoute({
      path: "/users/:id",
      name: "user-detail",
      props: true,
      component: {},
    });

    const [record] = toRouteRecords([route]);

    expect(record.props).toBe(true);
  });
});

describe("createCastGuard", () => {
  it("allows navigation when params are valid", () => {
    const routes = [
      defineRoute({
        path: "/users/:id",
        name: "user-detail",
        params: { id: p.number },
        component: {},
      }),
    ];
    const guard = createCastGuard(routes);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "user-detail", params: { id: "42" } }),
      mockLocation(),
      () => {},
    );

    expect(result).toBeUndefined();
  });

  it("blocks navigation when a path param fails to parse", () => {
    const routes = [
      defineRoute({
        path: "/users/:id",
        name: "user-detail",
        params: { id: p.number },
        component: {},
      }),
    ];
    const guard = createCastGuard(routes);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "user-detail", params: { id: "not-a-number" } }),
      mockLocation(),
      () => {},
    );

    expect(result).toBe(false);
  });

  it("redirects with default when a query param is absent", () => {
    const routes = [
      defineRoute({
        path: "/search",
        name: "search",
        query: { page: { type: p.number, default: 1 } },
        component: {},
      }),
    ];
    const guard = createCastGuard(routes);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "search", query: {} }),
      mockLocation(),
      () => {},
    ) as { query: Record<string, string> };

    expect(result.query.page).toBe("1");
  });

  it("does not redirect when query params are valid", () => {
    const routes = [
      defineRoute({
        path: "/search",
        name: "search",
        query: { page: { type: p.number, default: 1 } },
        component: {},
      }),
    ];
    const guard = createCastGuard(routes);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "search", query: { page: "5" } }),
      mockLocation(),
      () => {},
    );

    expect(result).toBeUndefined();
  });

  it("flattens groups to collect leaf routes", () => {
    const group = defineRoute({
      path: "/users",
      component: {},
      children: [
        defineRoute({
          path: ":id",
          name: "user-detail",
          params: { id: p.number },
          component: {},
        }),
      ],
    });
    const guard = createCastGuard([group]);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "user-detail", params: { id: "bad" } }),
      mockLocation(),
      () => {},
    );

    expect(result).toBe(false);
  });

  it("passes through unknown routes", () => {
    const routes = [
      defineRoute({ path: "/users", name: "users-list", component: {} }),
    ];
    const guard = createCastGuard(routes);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "unknown" }),
      mockLocation(),
      () => {},
    );

    expect(result).toBeUndefined();
  });

  it("merges group-level params into descendant leaves", () => {
    // Parent declares `id: p.number`; the leaf does not. The cast guard should
    // still validate `id` as a number because it's inherited from the group.
    const group = defineRoute({
      path: "/orgs/:id",
      component: {},
      params: { id: p.number },
      children: [
        defineRoute({ path: "users", name: "org-users", component: {} }),
      ],
    });
    const guard = createCastGuard([group]);

    const ok = guard.call(
      undefined as never,
      mockLocation({ name: "org-users", params: { id: "42" } }),
      mockLocation(),
      () => {},
    );
    const bad = guard.call(
      undefined as never,
      mockLocation({ name: "org-users", params: { id: "not-a-number" } }),
      mockLocation(),
      () => {},
    );

    expect(ok).toBeUndefined();
    expect(bad).toBe(false);
  });

  it("leaf params override group params on conflict", () => {
    // Group says `id: p.number`, leaf overrides with `p.string`. Strings always
    // parse, so 'abc' should pass even though the parent would have rejected it.
    const group = defineRoute({
      path: "/orgs/:id",
      component: {},
      params: { id: p.number },
      children: [
        // @ts-expect-error — `id` is not in this child's path; it's inherited from the
        // parent's `/orgs/:id`. The strict-params constraint can't see the parent path,
        // so we suppress here. Runtime behaviour is tested below.
        defineRoute({
          path: "users",
          name: "org-users",
          component: {},
          params: { id: p.string },
        }),
      ],
    });
    const guard = createCastGuard([group]);

    const result = guard.call(
      undefined as never,
      mockLocation({ name: "org-users", params: { id: "abc" } }),
      mockLocation(),
      () => {},
    );

    expect(result).toBeUndefined();
  });

  it("propagates group params through multiple levels of nesting", () => {
    // Grandparent declares :orgId, parent declares :teamId, leaf declares
    // nothing. Both inherited parsers must apply at the leaf.
    const tree = defineRoute({
      path: "/orgs/:orgId",
      component: {},
      params: { orgId: p.number },
      children: [
        defineRoute({
          path: "teams/:teamId",
          component: {},
          params: { teamId: p.number },
          children: [
            defineRoute({ path: "members", name: "team-members", component: {} }),
          ],
        }),
      ],
    });
    const guard = createCastGuard([tree]);

    const bad = guard.call(
      undefined as never,
      mockLocation({
        name: "team-members",
        params: { orgId: "1", teamId: "not-a-number" },
      }),
      mockLocation(),
      () => {},
    );

    expect(bad).toBe(false);
  });
});

describe("toRouteRecords — pass-through fields", () => {
  it("forwards meta, beforeEnter, redirect, alias on leaves", () => {
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

    const [record] = toRouteRecords([route]);

    expect(record.meta).toEqual({ roles: ["admin"] });
    expect(record.beforeEnter).toBe(guard);
    expect(record.redirect).toBe("/login");
    expect(record.alias).toBe("/u/:id");
  });

  it("forwards meta, beforeEnter, redirect, alias on groups", () => {
    const guard = () => true;
    const group = defineRoute({
      path: "/admin",
      component: {},
      meta: { section: "admin" },
      beforeEnter: guard,
      redirect: "/admin/dashboard",
      alias: "/a",
      children: [
        defineRoute({
          path: "dashboard",
          name: "admin-dashboard",
          component: {},
        }),
      ],
    });

    const [record] = toRouteRecords([group]);

    expect(record.meta).toEqual({ section: "admin" });
    expect(record.beforeEnter).toBe(guard);
    expect(record.redirect).toBe("/admin/dashboard");
    expect(record.alias).toBe("/a");
  });

  it("omits component on groups when not provided (guard-only wrapper)", () => {
    const group = defineRoute({
      path: "/protected",
      beforeEnter: () => true,
      children: [
        defineRoute({ path: "", name: "protected-home", component: {} }),
      ],
    });

    const [record] = toRouteRecords([group]);

    expect("component" in record).toBe(false);
    expect(record.beforeEnter).toBeDefined();
  });
});

describe("createCastGuard — representative real-world tree", () => {
  // Mirrors the shape encountered in a real migration: an auth-guarded root
  // wrapper, sibling layout routes, nested groups inheriting params, and leaves
  // with their own param overrides plus typed query.
  it("wires meta/guards/redirects/params correctly through a multi-level tree", () => {
    const authGuard = () => true;
    const tree = defineRoute({
      path: "/",
      beforeEnter: authGuard,
      meta: { requiresAuth: true },
      children: [
        defineRoute({
          path: "/orgs/:orgId",
          component: {},
          params: { orgId: p.number },
          children: [
            defineRoute({
              path: "",
              name: "org-overview",
              component: {},
              query: { tab: { type: p.string, default: "summary" } },
            }),
            defineRoute({
              path: "users/:userId",
              name: "org-user",
              component: {},
              params: { userId: p.number },
            }),
          ],
        }),
        defineRoute({
          path: "/login",
          name: "login",
          component: {},
          meta: { public: true },
        }),
      ],
    });

    const records = toRouteRecords([tree]);
    const guard = createCastGuard([tree]);

    // Vue Router record shape preserved
    expect(records).toHaveLength(1);
    expect(records[0].meta).toEqual({ requiresAuth: true });
    expect(records[0].beforeEnter).toBe(authGuard);
    expect(records[0].children).toHaveLength(2);

    // Cast guard inherits orgId from the org-* group
    expect(
      guard.call(
        undefined as never,
        mockLocation({
          name: "org-user",
          params: { orgId: "1", userId: "2" },
        }),
        mockLocation(),
        () => {},
      ),
    ).toBeUndefined();
    expect(
      guard.call(
        undefined as never,
        mockLocation({
          name: "org-user",
          params: { orgId: "x", userId: "2" },
        }),
        mockLocation(),
        () => {},
      ),
    ).toBe(false);

    // Query default applies for org-overview
    const overviewResult = guard.call(
      undefined as never,
      mockLocation({
        name: "org-overview",
        params: { orgId: "1" },
        query: {},
      }),
      mockLocation(),
      () => {},
    ) as { query: Record<string, string> };
    expect(overviewResult.query.tab).toBe("summary");

    // Sibling leaf carries its own meta and is not affected by org-* params
    const loginRecord = records[0].children!.find((r) => r.name === "login")!;
    expect(loginRecord.meta).toEqual({ public: true });
  });
});
