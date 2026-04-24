import { describe, it, expect } from "vitest";
import { normalizeDomains, areaEntityIds, areaEntityIdsFiltered, buildEntitySelector, buildEntitySelectorFiltered } from "../registry-helpers";
import type { EntityRegistryEntry, DeviceRegistryEntry } from "../../types/ha-extensions";

// --- normalizeDomains ---

describe("normalizeDomains", () => {
  it("returns * when called with no argument", () => {
    expect(normalizeDomains()).toEqual(["*"]);
  });

  it("returns * when called with empty array", () => {
    expect(normalizeDomains([])).toEqual(["*"]);
  });

  it("returns * when all values are whitespace", () => {
    expect(normalizeDomains(["  ", ""])).toEqual(["*"]);
  });

  it("trims and deduplicates values", () => {
    expect(normalizeDomains(["light", " light", "switch"])).toEqual(["light", "switch"]);
  });

  it("preserves order of first occurrence after dedup", () => {
    expect(normalizeDomains(["switch", "light", "switch"])).toEqual(["switch", "light"]);
  });
});

// --- areaEntityIds ---

const makeEntity = (entity_id: string, area_id?: string, device_id?: string): EntityRegistryEntry =>
  ({ entity_id, area_id: area_id ?? null, device_id: device_id ?? null });

const makeDevice = (id: string, area_id?: string): DeviceRegistryEntry =>
  ({ id, area_id: area_id ?? null });

describe("areaEntityIds", () => {
  const entities: EntityRegistryEntry[] = [
    makeEntity("light.living", "room1"),
    makeEntity("switch.fan", "room1"),
    makeEntity("light.kitchen", "room2"),
    makeEntity("sensor.temp", undefined, "dev1"),
    makeEntity("binary_sensor.motion", "room1"),
  ];
  const devices: DeviceRegistryEntry[] = [
    makeDevice("dev1", "room1"),
  ];

  it("returns empty array when areaId is empty", () => {
    expect(areaEntityIds(entities, devices, "")).toEqual([]);
    expect(areaEntityIds(entities, devices, undefined)).toEqual([]);
  });

  it("returns all entities in area when no domain filter", () => {
    const result = areaEntityIds(entities, devices, "room1");
    expect(result).toEqual(["binary_sensor.motion", "light.living", "sensor.temp", "switch.fan"]);
  });

  it("filters by domain", () => {
    const result = areaEntityIds(entities, devices, "room1", ["light"]);
    expect(result).toEqual(["light.living"]);
  });

  it("includes entities assigned via device area", () => {
    const result = areaEntityIds(entities, devices, "room1", ["sensor"]);
    expect(result).toEqual(["sensor.temp"]);
  });

  it("excludes entities from other areas", () => {
    const result = areaEntityIds(entities, devices, "room2");
    expect(result).toEqual(["light.kitchen"]);
  });

  it("returns sorted results", () => {
    const result = areaEntityIds(entities, devices, "room1");
    expect(result).toEqual([...result].sort());
  });
});

// --- areaEntityIdsFiltered ---

describe("areaEntityIdsFiltered", () => {
  const entities: EntityRegistryEntry[] = [
    makeEntity("binary_sensor.motion", "room1"),
    makeEntity("binary_sensor.door", "room1"),
    makeEntity("light.living", "room1"),
  ];
  const devices: DeviceRegistryEntry[] = [];
  const states: Record<string, { attributes?: Record<string, unknown> }> = {
    "binary_sensor.motion": { attributes: { device_class: "motion" } },
    "binary_sensor.door": { attributes: { device_class: "door" } },
    "light.living": { attributes: {} },
  };

  it("returns empty when areaId is empty", () => {
    expect(areaEntityIdsFiltered(entities, devices, states, "")).toEqual([]);
  });

  it("returns all in-area entities when no device class filter", () => {
    const result = areaEntityIdsFiltered(entities, devices, states, "room1");
    expect(result).toEqual(["binary_sensor.door", "binary_sensor.motion", "light.living"]);
  });

  it("filters by device class", () => {
    const result = areaEntityIdsFiltered(entities, devices, states, "room1", undefined, ["motion"]);
    expect(result).toEqual(["binary_sensor.motion"]);
  });

  it("excludes entities with no device_class when class filter is active", () => {
    const result = areaEntityIdsFiltered(entities, devices, states, "room1", ["light"], ["motion"]);
    expect(result).toEqual([]);
  });

  it("filters by domain and device class together", () => {
    const result = areaEntityIdsFiltered(entities, devices, states, "room1", ["binary_sensor"], ["door"]);
    expect(result).toEqual(["binary_sensor.door"]);
  });
});

// --- buildEntitySelector ---

describe("buildEntitySelector", () => {
  it("returns bare entity selector for empty domains and no includeEntities", () => {
    expect(buildEntitySelector([])).toEqual({ entity: {} });
  });

  it("sets domain when uniqueDomains is provided", () => {
    expect(buildEntitySelector(["light", "switch"])).toEqual({ entity: { domain: ["light", "switch"] } });
  });

  it("sets include_entities when provided", () => {
    expect(buildEntitySelector([], ["light.one", "light.two"])).toEqual({
      entity: { include_entities: ["light.one", "light.two"] },
    });
  });

  it("merges extra fields into entity spec", () => {
    expect(buildEntitySelector(["light"], undefined, { multiple: true })).toEqual({
      entity: { domain: ["light"], multiple: true },
    });
  });

  it("extra fields do not override domain/include_entities", () => {
    const result = buildEntitySelector(["light"], ["light.one"], { domain: "overridden" });
    expect(result).toEqual({ entity: { domain: ["light"], include_entities: ["light.one"] } });
  });
});

// --- buildEntitySelectorFiltered ---

describe("buildEntitySelectorFiltered", () => {
  it("returns bare entity selector for empty inputs", () => {
    expect(buildEntitySelectorFiltered([])).toEqual({ entity: {} });
  });

  it("sets domain when domains provided", () => {
    expect(buildEntitySelectorFiltered(["binary_sensor"])).toEqual({ entity: { domain: ["binary_sensor"] } });
  });

  it("sets include_entities when provided (overrides deviceClasses branch)", () => {
    const result = buildEntitySelectorFiltered([], ["binary_sensor.motion"], ["motion"]);
    expect(result).toEqual({ entity: { include_entities: ["binary_sensor.motion"] } });
  });

  it("sets device_class as string when single class and no includeEntities", () => {
    const result = buildEntitySelectorFiltered([], undefined, ["motion"]);
    expect(result).toEqual({ entity: { device_class: "motion" } });
  });

  it("sets device_class as array when multiple classes and no includeEntities", () => {
    const result = buildEntitySelectorFiltered([], undefined, ["motion", "door"]);
    expect(result).toEqual({ entity: { device_class: ["motion", "door"] } });
  });
});
