import { describe, it, expect } from "vitest";
import {
  resolveAreaAutomationIds,
  createCardSignature,
  getAreaAutomations,
  evaluateClimateAlert,
  getClimateEntities,
} from "../room-model";
import type { HassEntity } from "home-assistant-js-websocket";
import type { SmartRoomCardConfig } from "../types";
import type { HomeAssistant } from "custom-card-helpers";

function makeEntity(entityId: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return { entity_id: entityId, state, attributes, last_changed: "", last_updated: "", context: { id: "" } } as HassEntity;
}

function makeCardConfig(overrides: Partial<SmartRoomCardConfig> = {}): SmartRoomCardConfig {
  return { type: "custom:smart-area-card", room: "Test Room", ...overrides };
}

describe("resolveAreaAutomationIds", () => {
  const registry = {
    "automation.lights": { entity_id: "automation.lights", area_id: "living_room" },
    "automation.blinds": { entity_id: "automation.blinds", area_id: "living_room" },
    "sensor.temp": { entity_id: "sensor.temp", area_id: "living_room" },
    "automation.alarm": { entity_id: "automation.alarm", area_id: "bedroom" },
  };

  it("returns automation entity IDs for the given area", () => {
    const ids = resolveAreaAutomationIds(registry, "living_room");
    expect(ids).toContain("automation.lights");
    expect(ids).toContain("automation.blinds");
    expect(ids).not.toContain("sensor.temp");
    expect(ids).not.toContain("automation.alarm");
  });

  it("returns empty array for unknown area", () => {
    expect(resolveAreaAutomationIds(registry, "garage")).toEqual([]);
  });

  it("returns empty array for empty roomId", () => {
    expect(resolveAreaAutomationIds(registry, "")).toEqual([]);
    expect(resolveAreaAutomationIds(registry, "   ")).toEqual([]);
  });
});

describe("createCardSignature", () => {
  it("includes device entity states", () => {
    const config = makeCardConfig({
      devices: [{ entity: "light.living", type: "light" }],
    });
    const states = { "light.living": makeEntity("light.living", "on") };
    const sig = createCardSignature(config, states);
    expect(sig).toContain("light.living:on");
  });

  it("marks missing entities as :missing", () => {
    const config = makeCardConfig({
      devices: [{ entity: "light.missing", type: "light" }],
    });
    const sig = createCardSignature(config, {});
    expect(sig).toContain("light.missing:missing");
  });

  it("includes automation entity IDs", () => {
    const config = makeCardConfig({});
    const states = { "automation.test": makeEntity("automation.test", "on") };
    const sig = createCardSignature(config, states, ["automation.test"]);
    expect(sig).toContain("automation.test:on");
  });

  it("produces identical signatures for identical state", () => {
    const config = makeCardConfig({ devices: [{ entity: "light.a", type: "light" }, { entity: "light.b", type: "light" }] });
    const states = {
      "light.a": makeEntity("light.a", "on"),
      "light.b": makeEntity("light.b", "off"),
    };
    expect(createCardSignature(config, states)).toBe(createCardSignature(config, states));
  });

  it("produces different signatures when state changes", () => {
    const config = makeCardConfig({ devices: [{ entity: "light.a", type: "light" }] });
    const s1 = { "light.a": makeEntity("light.a", "on") };
    const s2 = { "light.a": makeEntity("light.a", "off") };
    expect(createCardSignature(config, s1)).not.toBe(createCardSignature(config, s2));
  });
});

describe("getAreaAutomations", () => {
  const registry = {
    "automation.lights": { entity_id: "automation.lights", area_id: "living_room" },
    "automation.blinds": { entity_id: "automation.blinds", area_id: "living_room" },
    "automation.alarm": { entity_id: "automation.alarm", area_id: "bedroom" },
  };

  const hass = {
    states: {
      "automation.lights": makeEntity("automation.lights", "on", { friendly_name: "Lights", last_triggered: "2024-01-01T12:00:00Z" }),
      "automation.blinds": makeEntity("automation.blinds", "off", { friendly_name: "Blinds", last_triggered: null }),
      "automation.alarm": makeEntity("automation.alarm", "on", { friendly_name: "Alarm" }),
    },
  } as unknown as HomeAssistant;

  it("returns automations for the area, enabled-first", () => {
    const results = getAreaAutomations(hass, registry, "living_room");
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Lights");
    expect(results[0].enabled).toBe(true);
    expect(results[1].name).toBe("Blinds");
    expect(results[1].enabled).toBe(false);
  });

  it("returns empty for unknown area", () => {
    expect(getAreaAutomations(hass, registry, "garage")).toEqual([]);
  });

  it("returns empty for blank roomId", () => {
    expect(getAreaAutomations(hass, registry, "")).toEqual([]);
  });

  it("includes lastTriggered from entity attributes", () => {
    const results = getAreaAutomations(hass, registry, "living_room");
    const lights = results.find((r) => r.name === "Lights");
    expect(lights?.lastTriggered).toBe("2024-01-01T12:00:00Z");
  });
});

describe("evaluateClimateAlert", () => {
  function makeClimateEntity(state: string, unit?: string): HassEntity {
    return makeEntity("sensor.temp", state, unit ? { unit_of_measurement: unit } : {});
  }

  it("returns undefined when alert is disabled", () => {
    const entity = makeClimateEntity("25");
    expect(evaluateClimateAlert("temperature", entity, { enabled: false, min: 30 }, "Temperature", "mdi:thermometer")).toBeUndefined();
  });

  it("returns undefined when entity is undefined", () => {
    expect(evaluateClimateAlert("temperature", undefined, { enabled: true, min: 30 }, "Temperature", "mdi:thermometer")).toBeUndefined();
  });

  it("triggers on min threshold breach", () => {
    const alert = evaluateClimateAlert("temperature", makeClimateEntity("15"), { enabled: true, min: 18 }, "Temperature", "mdi:thermometer");
    expect(alert).toBeDefined();
    expect(alert?.key).toBe("temperature");
  });

  it("does not trigger when value is above min", () => {
    expect(evaluateClimateAlert("temperature", makeClimateEntity("22"), { enabled: true, min: 18 }, "Temperature", "mdi:thermometer")).toBeUndefined();
  });

  it("triggers on max threshold breach", () => {
    const alert = evaluateClimateAlert("temperature", makeClimateEntity("35"), { enabled: true, max: 28 }, "Temperature", "mdi:thermometer");
    expect(alert).toBeDefined();
  });

  it("triggers on eq string match (presence)", () => {
    const entity = makeClimateEntity("on");
    const alert = evaluateClimateAlert("presence", entity, { enabled: true, eq: "on" }, "Presence", "mdi:motion-sensor");
    expect(alert).toBeDefined();
    expect(alert?.key).toBe("presence");
  });

  it("does not trigger on eq string mismatch", () => {
    const entity = makeClimateEntity("off");
    expect(evaluateClimateAlert("presence", entity, { enabled: true, eq: "on" }, "Presence", "mdi:motion-sensor")).toBeUndefined();
  });

  it("returns undefined when state is not numeric for numeric alert", () => {
    const entity = makeClimateEntity("unavailable");
    expect(evaluateClimateAlert("temperature", entity, { enabled: true, min: 18 }, "Temperature", "mdi:thermometer")).toBeUndefined();
  });

  it("includes room name in reason when provided", () => {
    const alert = evaluateClimateAlert("temperature", makeClimateEntity("15", "°C"), { enabled: true, min: 18 }, "Temperature", "mdi:thermometer", "Living Room");
    expect(alert?.reason).toContain("Living Room");
    expect(alert?.reason).toContain("15 °C");
  });
});

describe("getClimateEntities", () => {
  it("returns empty array for undefined sensors", () => {
    expect(getClimateEntities(undefined)).toEqual([]);
  });

  it("collects all preset sensor entity IDs", () => {
    const sensors: SmartRoomCardConfig["sensors"] = {
      temperature: "sensor.temp",
      humidity: "sensor.humidity",
    };
    const entities = getClimateEntities(sensors);
    expect(entities).toContain("sensor.temp");
    expect(entities).toContain("sensor.humidity");
  });

  it("includes custom sensor entities", () => {
    const sensors: SmartRoomCardConfig["sensors"] = {
      custom: [{ name: "CO2", entity: "sensor.co2" }],
    };
    const entities = getClimateEntities(sensors);
    expect(entities).toContain("sensor.co2");
  });
});
