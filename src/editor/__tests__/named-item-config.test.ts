import { describe, it, expect } from "vitest";
import {
  addNamedState,
  removeNamedState,
  updateNamedState,
  resetPresetState,
  resetPresetAlert,
  resetPresetOffline,
  addNamedAlert,
  removeNamedAlert,
  updateNamedAlert,
} from "../named-item-config";
import type { SmartRoomDeviceConfig } from "../../helpers/types";

const device = (): SmartRoomDeviceConfig => ({
  entity: "light.living",
  states: {
    states: [
      { name: "On", enabled: true, conditions: [], preset_source: "type" },
      { name: "Off", enabled: false, conditions: [] },
    ],
    alerts: [
      { message: "Too hot", enabled: true, conditions: [], preset_source: "type" },
      { message: "Battery low", enabled: true, conditions: [], preset_source: "battery" },
    ],
  },
  offline: { enabled: true, conditions: [{ entity: "sensor.x", operator: "eq", value: "off" }] },
});

// --- addNamedState ---

describe("addNamedState", () => {
  it("appends a blank state", () => {
    const result = addNamedState(device());
    expect(result.states?.states).toHaveLength(3);
    expect(result.states?.states?.[2]?.name).toBe("");
    expect(result.states?.states?.[2]?.enabled).toBe(true);
  });

  it("works on device with no states", () => {
    const result = addNamedState({ entity: "light.x" });
    expect(result.states?.states).toHaveLength(1);
  });

  it("does not mutate input", () => {
    const d = device();
    addNamedState(d);
    expect(d.states?.states).toHaveLength(2);
  });
});

// --- removeNamedState ---

describe("removeNamedState", () => {
  it("removes state at given index", () => {
    const result = removeNamedState(device(), 0);
    expect(result.states?.states).toHaveLength(1);
    expect(result.states?.states?.[0]?.name).toBe("Off");
  });

  it("works on device with no states (no-op)", () => {
    const result = removeNamedState({ entity: "light.x" }, 0);
    expect(result.states?.states).toHaveLength(0);
  });
});

// --- updateNamedState ---

describe("updateNamedState", () => {
  it("updates a field on the target state", () => {
    const result = updateNamedState(device(), 0, "name", "Active");
    expect(result.states?.states?.[0]?.name).toBe("Active");
  });

  it("does not affect other states", () => {
    const result = updateNamedState(device(), 0, "name", "Active");
    expect(result.states?.states?.[1]?.name).toBe("Off");
  });

  it("uses default state when index is out of bounds", () => {
    const result = updateNamedState(device(), 5, "name", "New");
    expect(result.states?.states?.[5]?.name).toBe("New");
    expect(result.states?.states?.[5]?.enabled).toBe(true);
  });
});

// --- resetPresetState ---

describe("resetPresetState", () => {
  const preset: SmartRoomDeviceConfig = {
    entity: "light.living",
    states: {
      states: [{ name: "On (preset)", enabled: true, conditions: [], preset_source: "type" }],
    },
  };

  it("replaces the state with the matching preset state", () => {
    const result = resetPresetState(device(), 0, preset);
    expect(result?.states?.states?.[0]?.name).toBe("On (preset)");
  });

  it("returns null when state has no preset_source", () => {
    expect(resetPresetState(device(), 1, preset)).toBeNull();
  });

  it("returns null when preset has no matching preset_source", () => {
    const noMatch: SmartRoomDeviceConfig = { entity: "light.x", states: { states: [] } };
    expect(resetPresetState(device(), 0, noMatch)).toBeNull();
  });

  it("does not mutate input states array", () => {
    const d = device();
    resetPresetState(d, 0, preset);
    expect(d.states?.states?.[0]?.name).toBe("On");
  });
});

// --- resetPresetAlert ---

describe("resetPresetAlert", () => {
  const preset: SmartRoomDeviceConfig = {
    entity: "light.living",
    states: {
      alerts: [{ message: "Too hot (preset)", enabled: true, conditions: [], preset_source: "type" }],
    },
  };

  it("replaces the alert with the matching preset alert", () => {
    const result = resetPresetAlert(device(), 0, preset);
    expect(result?.states?.alerts?.[0]?.message).toBe("Too hot (preset)");
  });

  it("returns null when alert has no preset_source", () => {
    const d: SmartRoomDeviceConfig = { entity: "light.x", states: { alerts: [{ message: "plain", conditions: [] }] } };
    expect(resetPresetAlert(d, 0, preset)).toBeNull();
  });

  it("returns null when preset_source is battery", () => {
    expect(resetPresetAlert(device(), 1, preset)).toBeNull();
  });

  it("returns null when preset has no matching source", () => {
    const noMatch: SmartRoomDeviceConfig = { entity: "light.x", states: { alerts: [] } };
    expect(resetPresetAlert(device(), 0, noMatch)).toBeNull();
  });
});

// --- resetPresetOffline ---

describe("resetPresetOffline", () => {
  it("replaces offline config with preset offline config", () => {
    const preset: SmartRoomDeviceConfig = {
      entity: "light.living",
      offline: { enabled: false, conditions: [] },
    };
    const result = resetPresetOffline(device(), preset);
    expect(result.offline?.enabled).toBe(false);
    expect(result.offline?.conditions).toEqual([]);
  });

  it("preserves other device fields", () => {
    const preset: SmartRoomDeviceConfig = { entity: "light.x", offline: undefined };
    const result = resetPresetOffline(device(), preset);
    expect(result.entity).toBe("light.living");
    expect(result.offline).toBeUndefined();
  });
});

// --- addNamedAlert ---

describe("addNamedAlert", () => {
  it("appends a blank alert (excluding battery alert)", () => {
    const result = addNamedAlert(device());
    // battery alert removed + new blank appended = 1 original type alert + 1 blank
    expect(result.states?.alerts).toHaveLength(2);
    const alerts = result.states?.alerts ?? [];
    const last = alerts[alerts.length - 1];
    expect(last?.message).toBe("");
    expect(last?.preset_source).toBeUndefined();
  });

  it("battery alert is removed from the list before appending", () => {
    const result = addNamedAlert(device());
    const hasBattery = result.states?.alerts?.some((a) => a.preset_source === "battery");
    expect(hasBattery).toBe(false);
  });

  it("works on device with no alerts", () => {
    const result = addNamedAlert({ entity: "light.x" });
    expect(result.states?.alerts).toHaveLength(1);
  });
});

// --- removeNamedAlert ---

describe("removeNamedAlert", () => {
  it("removes alert at given index", () => {
    const result = removeNamedAlert(device(), 0);
    expect(result.states?.alerts).toHaveLength(1);
    expect(result.states?.alerts?.[0]?.preset_source).toBe("battery");
  });

  it("works on device with no alerts (no-op)", () => {
    const result = removeNamedAlert({ entity: "light.x" }, 0);
    expect(result.states?.alerts).toHaveLength(0);
  });
});

// --- updateNamedAlert ---

describe("updateNamedAlert", () => {
  it("updates a field on the target alert", () => {
    const result = updateNamedAlert(device(), 0, "message", "Updated");
    expect(result.states?.alerts?.[0]?.message).toBe("Updated");
  });

  it("does not affect other alerts", () => {
    const result = updateNamedAlert(device(), 0, "message", "Updated");
    expect(result.states?.alerts?.[1]?.message).toBe("Battery low");
  });

  it("uses default alert when index is out of bounds", () => {
    const result = updateNamedAlert(device(), 9, "message", "New");
    expect(result.states?.alerts?.[9]?.message).toBe("New");
    expect(result.states?.alerts?.[9]?.enabled).toBe(true);
  });
});
