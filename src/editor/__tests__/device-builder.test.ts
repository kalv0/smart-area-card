import { describe, it, expect } from "vitest";
import {
  definitionForType,
  isEntityRequired,
  allowedMainEntities,
  buildPreset,
  applyDerivedBatteryAlertWithUi,
  applyTypePreset,
  hydratePresetDefaults,
  syncDeviceWithEntity,
  buildResolvedPresetDevice,
} from "../device-builder";
import { BUILTIN_TYPE_DEFINITIONS } from "../builtin-types";
import type { SmartRoomDeviceConfig, SmartRoomCardConfig } from "../../helpers/types";

function makeDevice(overrides: Partial<SmartRoomDeviceConfig> = {}): SmartRoomDeviceConfig {
  return { entity: "light.test", type: "light", ...overrides };
}

const noUi: SmartRoomCardConfig["ui"] = {};

describe("definitionForType", () => {
  it("returns the correct type definition by id", () => {
    const def = definitionForType(BUILTIN_TYPE_DEFINITIONS, "light");
    expect(def.id).toBe("light");
    expect(def.label).toBe("Light");
  });

  it("falls back to custom for unknown types", () => {
    const def = definitionForType(BUILTIN_TYPE_DEFINITIONS, "unknown_type_xyz");
    expect(def.id).toBe("custom");
  });
});

describe("isEntityRequired", () => {
  it("returns true for types that require an entity", () => {
    expect(isEntityRequired(BUILTIN_TYPE_DEFINITIONS, makeDevice({ type: "light" }))).toBe(true);
  });
});

describe("allowedMainEntities", () => {
  it("returns allowed domains for light type", () => {
    const domains = allowedMainEntities(BUILTIN_TYPE_DEFINITIONS, "light");
    expect(domains).toContain("light.");
    expect(domains).toContain("switch.");
  });

  it("returns wildcard for custom type", () => {
    const domains = allowedMainEntities(BUILTIN_TYPE_DEFINITIONS, "custom");
    expect(domains).toContain("*");
  });
});

describe("buildPreset", () => {
  it("returns a materialized device config with entity filled in", () => {
    const preset = buildPreset(BUILTIN_TYPE_DEFINITIONS, "light", "light.living_room");
    expect(preset.entity).toBe("light.living_room");
    expect(preset.type).toBe("light");
  });

  it("propagates battery entity into conditions", () => {
    const preset = buildPreset(BUILTIN_TYPE_DEFINITIONS, "light", "light.x", {
      entity: "light.x",
      type: "light",
      battery: "sensor.battery",
    });
    expect(preset.battery).toBe("sensor.battery");
  });

  it("falls back to custom definition for unknown type", () => {
    const preset = buildPreset(BUILTIN_TYPE_DEFINITIONS, "nonexistent", "sensor.x");
    expect(preset.type).toBe("custom");
  });
});

describe("applyDerivedBatteryAlertWithUi", () => {
  it("adds a battery alert when battery entity and threshold are set", () => {
    const device = makeDevice({ battery: "sensor.battery", states: { on_conditions: [], alert_conditions: [] } });
    const result = applyDerivedBatteryAlertWithUi(device, 20, noUi);
    const batteryAlert = result.states?.alerts?.find((a) => a.preset_source === "battery");
    expect(batteryAlert).toBeDefined();
    expect(batteryAlert?.name).toBe("Low battery");
    expect(batteryAlert?.conditions?.[0].value).toBe(20);
  });

  it("removes battery alert when battery_alert_enabled is false", () => {
    const device = makeDevice({
      battery: "sensor.battery",
      battery_alert_enabled: false,
      states: {
        on_conditions: [],
        alert_conditions: [],
        alerts: [{ preset_source: "battery", conditions: [] }],
      },
    });
    const result = applyDerivedBatteryAlertWithUi(device, 20, noUi);
    expect(result.states?.alerts?.find((a) => a.preset_source === "battery")).toBeUndefined();
  });

  it("removes battery alert when no battery entity", () => {
    const device = makeDevice({ battery: undefined });
    const result = applyDerivedBatteryAlertWithUi(device, 20, noUi);
    expect(result.states?.alerts?.find((a) => a.preset_source === "battery")).toBeUndefined();
  });

  it("preserves existing non-battery alerts", () => {
    const device = makeDevice({
      battery: "sensor.battery",
      states: {
        on_conditions: [],
        alert_conditions: [],
        alerts: [{ name: "Custom Alert", conditions: [] }],
      },
    });
    const result = applyDerivedBatteryAlertWithUi(device, 20, noUi);
    expect(result.states?.alerts?.find((a) => a.name === "Custom Alert")).toBeDefined();
    expect(result.states?.alerts?.find((a) => a.preset_source === "battery")).toBeDefined();
  });

  it("uses ui battery alert settings for the generated alert", () => {
    const device = makeDevice({ battery: "sensor.battery" });
    const ui: SmartRoomCardConfig["ui"] = { battery_alert_border_color: "orange", battery_alert_outlined: false };
    const result = applyDerivedBatteryAlertWithUi(device, 15, ui);
    const alert = result.states?.alerts?.find((a) => a.preset_source === "battery");
    expect(alert?.border_color).toBe("orange");
    expect(alert?.conditions?.[0].value).toBe(15);
  });
});

describe("applyTypePreset", () => {
  it("merges preset onto device while preserving the original entity", () => {
    const device = makeDevice({ entity: "light.living", type: "light" });
    const result = applyTypePreset(BUILTIN_TYPE_DEFINITIONS, device, "light", "light.living");
    expect(result.entity).toBe("light.living");
    expect(result.type).toBe("light");
  });
});

describe("hydratePresetDefaults", () => {
  it("returns device with preset defaults merged in", () => {
    const device = makeDevice({ entity: "light.x", type: "light" });
    const result = hydratePresetDefaults(BUILTIN_TYPE_DEFINITIONS, device, 20, noUi);
    expect(result.entity).toBe("light.x");
    expect(result.type).toBe("light");
    expect(result.states).toBeDefined();
  });

  it("preserves custom named state text over preset default", () => {
    const customText = "My Custom State";
    const device = makeDevice({
      entity: "light.x",
      type: "light",
      states: {
        on_conditions: [],
        alert_conditions: [],
        states: [{ preset: true, preset_source: "type", text: customText, conditions: [] }],
      },
    });
    const result = hydratePresetDefaults(BUILTIN_TYPE_DEFINITIONS, device, 20, noUi);
    const typeState = result.states?.states?.find((s) => s.preset_source === "type");
    expect(typeState?.text).toBe(customText);
  });
});

describe("syncDeviceWithEntity", () => {
  it("updates entity and syncs entity references in conditions", () => {
    const device = makeDevice({
      entity: "light.old",
      type: "light",
      offline: {
        enabled: true,
        conditions: [{ entity: "light.old", operator: "eq", value: "unavailable" }],
      },
    });
    const result = syncDeviceWithEntity(BUILTIN_TYPE_DEFINITIONS, device, "light.old", "light.new", 20, noUi);
    expect(result.entity).toBe("light.new");
    expect(result.offline?.conditions?.[0].entity).toBe("light.new");
  });
});

describe("buildResolvedPresetDevice", () => {
  it("returns a fresh preset device with cleared states", () => {
    const device = makeDevice({ entity: "light.x", type: "light" });
    const result = buildResolvedPresetDevice(BUILTIN_TYPE_DEFINITIONS, device, 20, noUi);
    expect(result.entity).toBe("light.x");
    expect(result.type).toBe("light");
  });
});
