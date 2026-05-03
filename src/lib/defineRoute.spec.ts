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
});
