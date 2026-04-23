import { describe, it, expect } from "vitest";
import { evaluateCondition, evaluateConditions, evaluateAllConditions } from "../conditions";
import type { HassEntity } from "home-assistant-js-websocket";

function makeEntity(state: string, entityId = "sensor.test"): HassEntity {
  return { entity_id: entityId, state, attributes: {}, last_changed: "", last_updated: "", context: { id: "" } } as HassEntity;
}

const states = (entries: Record<string, string>): Record<string, HassEntity> =>
  Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, makeEntity(v, k)]));

describe("evaluateCondition", () => {
  it("returns false when condition is undefined", () => {
    expect(evaluateCondition({}, undefined)).toBe(false);
  });

  it("returns false when entity is missing from states", () => {
    expect(evaluateCondition({}, { entity: "sensor.x", operator: "eq", value: "on" })).toBe(false);
  });

  describe("eq", () => {
    it("matches string equality", () => {
      const s = states({ "sensor.x": "on" });
      expect(evaluateCondition(s, { entity: "sensor.x", operator: "eq", value: "on" })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.x", operator: "eq", value: "off" })).toBe(false);
    });

    it("compares as strings even with numbers", () => {
      const s = states({ "sensor.x": "42" });
      expect(evaluateCondition(s, { entity: "sensor.x", operator: "eq", value: 42 })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.x", operator: "eq", value: "42" })).toBe(true);
    });
  });

  describe("neq", () => {
    it("returns true when state differs", () => {
      const s = states({ "sensor.x": "off" });
      expect(evaluateCondition(s, { entity: "sensor.x", operator: "neq", value: "on" })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.x", operator: "neq", value: "off" })).toBe(false);
    });
  });

  describe("gt / gte / lt / lte", () => {
    const s = states({ "sensor.temp": "22" });

    it("gt: true when state > value", () => {
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "gt", value: 21 })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "gt", value: 22 })).toBe(false);
    });

    it("gte: true when state >= value", () => {
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "gte", value: 22 })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "gte", value: 23 })).toBe(false);
    });

    it("lt: true when state < value", () => {
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "lt", value: 23 })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "lt", value: 22 })).toBe(false);
    });

    it("lte: true when state <= value", () => {
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "lte", value: 22 })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.temp", operator: "lte", value: 21 })).toBe(false);
    });

    it("returns false when state is not numeric", () => {
      const nonNumeric = states({ "sensor.temp": "unavailable" });
      expect(evaluateCondition(nonNumeric, { entity: "sensor.temp", operator: "gt", value: 0 })).toBe(false);
    });
  });

  describe("in / not_in", () => {
    const s = states({ "sensor.mode": "away" });

    it("in: true when state is in array", () => {
      expect(evaluateCondition(s, { entity: "sensor.mode", operator: "in", value: ["home", "away"] })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.mode", operator: "in", value: ["home"] })).toBe(false);
    });

    it("not_in: true when state is not in array", () => {
      expect(evaluateCondition(s, { entity: "sensor.mode", operator: "not_in", value: ["home"] })).toBe(true);
      expect(evaluateCondition(s, { entity: "sensor.mode", operator: "not_in", value: ["home", "away"] })).toBe(false);
    });

    it("in returns false when value is not an array", () => {
      expect(evaluateCondition(s, { entity: "sensor.mode", operator: "in", value: "away" })).toBe(false);
    });
  });
});

describe("evaluateConditions (OR)", () => {
  it("returns false for empty list", () => {
    expect(evaluateConditions({}, [])).toBe(false);
    expect(evaluateConditions({}, undefined)).toBe(false);
  });

  it("returns true when any condition matches", () => {
    const s = states({ "sensor.a": "on", "sensor.b": "off" });
    expect(evaluateConditions(s, [
      { entity: "sensor.a", operator: "eq", value: "on" },
      { entity: "sensor.b", operator: "eq", value: "on" },
    ])).toBe(true);
  });

  it("returns false when no condition matches", () => {
    const s = states({ "sensor.a": "off", "sensor.b": "off" });
    expect(evaluateConditions(s, [
      { entity: "sensor.a", operator: "eq", value: "on" },
      { entity: "sensor.b", operator: "eq", value: "on" },
    ])).toBe(false);
  });
});

describe("evaluateAllConditions (AND)", () => {
  it("returns false for empty list", () => {
    expect(evaluateAllConditions({}, [])).toBe(false);
    expect(evaluateAllConditions({}, undefined)).toBe(false);
  });

  it("returns true only when all conditions match", () => {
    const s = states({ "sensor.a": "on", "sensor.b": "on" });
    expect(evaluateAllConditions(s, [
      { entity: "sensor.a", operator: "eq", value: "on" },
      { entity: "sensor.b", operator: "eq", value: "on" },
    ])).toBe(true);
  });

  it("returns false when any condition fails", () => {
    const s = states({ "sensor.a": "on", "sensor.b": "off" });
    expect(evaluateAllConditions(s, [
      { entity: "sensor.a", operator: "eq", value: "on" },
      { entity: "sensor.b", operator: "eq", value: "on" },
    ])).toBe(false);
  });
});
