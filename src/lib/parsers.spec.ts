import { describe, it, expect } from "vitest";
import {
  NumberParser,
  BooleanParser,
  DateParser,
  StringParser,
  enumParser,
  resolveQueryConfig,
  p,
} from "./parsers";

describe("NumberParser", () => {
  it("parses valid integers", () => {
    expect(NumberParser.get("42")).toBe(42);
    expect(NumberParser.get("0")).toBe(0);
    expect(NumberParser.get("-7")).toBe(-7);
  });

  it("parses valid floats", () => {
    expect(NumberParser.get("3.14")).toBeCloseTo(3.14);
  });

  it("returns miss for non-numeric strings", () => {
    expect(NumberParser.get("abc")).toBe("miss");
    expect(NumberParser.get("")).toBe("miss");
    expect(NumberParser.get("1a")).toBe("miss");
  });

  it("serializes numbers back to strings", () => {
    expect(NumberParser.set(42)).toBe("42");
    expect(NumberParser.set(-7)).toBe("-7");
  });
});

describe("BooleanParser", () => {
  it("parses true and false literals", () => {
    expect(BooleanParser.get("true")).toBe(true);
    expect(BooleanParser.get("false")).toBe(false);
  });

  it("returns miss for anything else", () => {
    expect(BooleanParser.get("1")).toBe("miss");
    expect(BooleanParser.get("yes")).toBe("miss");
    expect(BooleanParser.get("")).toBe("miss");
  });

  it("serializes booleans back to strings", () => {
    expect(BooleanParser.set(true)).toBe("true");
    expect(BooleanParser.set(false)).toBe("false");
  });
});

describe("DateParser", () => {
  it("parses ISO 8601 date strings", () => {
    const raw = "2024-06-15";

    const result = DateParser.get(raw);

    expect(result).not.toBe("miss");
    expect((result as Date).getFullYear()).toBe(2024);
  });

  it("returns miss for invalid dates", () => {
    expect(DateParser.get("not-a-date")).toBe("miss");
    expect(DateParser.get("")).toBe("miss");
  });

  it("serializes dates to YYYY-MM-DD", () => {
    const d = new Date("2024-06-15T00:00:00.000Z");

    const result = DateParser.set(d);

    expect(result).toBe("2024-06-15");
  });
});

describe("StringParser", () => {
  it("returns the raw value unchanged", () => {
    expect(StringParser.get("hello")).toBe("hello");
    expect(StringParser.get("")).toBe("");
  });

  it("serializes strings back unchanged", () => {
    expect(StringParser.set("hello")).toBe("hello");
  });
});

describe("p namespace", () => {
  it("exposes the built-in parsers", () => {
    expect(p.number).toBe(NumberParser);
    expect(p.boolean).toBe(BooleanParser);
    expect(p.date).toBe(DateParser);
    expect(p.string).toBe(StringParser);
  });

  it("exposes p.enum as enumParser", () => {
    expect(p.enum).toBe(enumParser);
  });
});

describe("enumParser", () => {
  describe("string enum", () => {
    // String enums have no reverse-mapping, so a const object is identical at runtime.
    const Status = { Todo: "todo", Done: "done" } as const

    const parser = enumParser(Status, "@/types/Status");

    it("parses valid enum values", () => {
      expect(parser.get("todo")).toBe(Status.Todo);
      expect(parser.get("done")).toBe(Status.Done);
    });

    it("returns miss for unknown values", () => {
      expect(parser.get("nope")).toBe("miss");
      expect(parser.get("")).toBe("miss");
    });

    it("serializes back to the underlying string", () => {
      expect(parser.set(Status.Todo)).toBe("todo");
      expect(parser.set(Status.Done)).toBe("done");
    });
  });

  describe("numeric enum", () => {
    // TypeScript numeric enums emit reverse-mapping keys at runtime:
    // enum Priority { Low = 1, High = 2 } → { '1': 'Low', '2': 'High', Low: 1, High: 2 }
    const Priority = { 1: "Low", 2: "High", Low: 1, High: 2 } as unknown as Record<string, string | number>

    const parser = enumParser(Priority, "@/types/Priority");

    it("parses numeric strings to enum values", () => {
      expect(parser.get("1")).toBe(1);
      expect(parser.get("2")).toBe(2);
    });

    it("does not accept reverse-mapped enum keys", () => {
      expect(parser.get("Low")).toBe("miss");
      expect(parser.get("High")).toBe("miss");
    });

    it("returns miss for unknown numeric values", () => {
      expect(parser.get("99")).toBe("miss");
      expect(parser.get("abc")).toBe("miss");
    });

    it("serializes the numeric value", () => {
      expect(parser.set(1)).toBe("1");
      expect(parser.set(2)).toBe("2");
    });
  });
});

describe("resolveQueryConfig", () => {
  describe("shorthand form (Parser directly)", () => {
    it("resolves a present valid value", () => {
      const bound = resolveQueryConfig(p.number);

      const result = bound.resolve("42");

      expect(result).toBe(42);
    });

    it("returns undefined when raw is null", () => {
      const bound = resolveQueryConfig(p.number);

      const result = bound.resolve(null);

      expect(result).toBeUndefined();
    });

    it("returns undefined when value fails to parse", () => {
      const bound = resolveQueryConfig(p.number);

      const result = bound.resolve("abc");

      expect(result).toBeUndefined();
    });

    it("never needs a patch", () => {
      const bound = resolveQueryConfig(p.number);

      expect(bound.patchIfNeeded(null)).toBeUndefined();
      expect(bound.patchIfNeeded("abc")).toBeUndefined();
      expect(bound.patchIfNeeded("42")).toBeUndefined();
    });
  });

  describe("object form (with default)", () => {
    it("resolves a present valid value", () => {
      const bound = resolveQueryConfig({ type: p.number, default: 1 });

      const result = bound.resolve("42");

      expect(result).toBe(42);
    });

    it("returns the default when raw is null", () => {
      const bound = resolveQueryConfig({ type: p.number, default: 1 });

      const result = bound.resolve(null);

      expect(result).toBe(1);
    });

    it("returns the default when value fails to parse", () => {
      const bound = resolveQueryConfig({ type: p.number, default: 1 });

      const result = bound.resolve("abc");

      expect(result).toBe(1);
    });

    it("patches when raw is null", () => {
      const bound = resolveQueryConfig({ type: p.number, default: 1 });

      const result = bound.patchIfNeeded(null);

      expect(result).toBe("1");
    });

    it("patches when raw fails to parse", () => {
      const bound = resolveQueryConfig({ type: p.number, default: 1 });

      const result = bound.patchIfNeeded("abc");

      expect(result).toBe("1");
    });

    it("does not patch when raw is valid", () => {
      const bound = resolveQueryConfig({ type: p.number, default: 1 });

      const result = bound.patchIfNeeded("42");

      expect(result).toBeUndefined();
    });
  });
});
