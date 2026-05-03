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
});
