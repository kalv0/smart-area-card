import { describe, it, expect, vi, beforeEach } from "vitest";
import { warnOnInvalidConfig } from "../validate-config";
import type { SmartRoomCardConfig } from "../types";

function makeConfig(overrides: Partial<SmartRoomCardConfig> = {}): SmartRoomCardConfig {
  return { type: "custom:smart-area-card", room: "Living Room", room_id: "living_room", ...overrides };
}

describe("warnOnInvalidConfig", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("emits no warnings for a clean config", () => {
    warnOnInvalidConfig(makeConfig());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when room is missing", () => {
    warnOnInvalidConfig({ type: "custom:smart-area-card", room: "" });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Missing required field: room"));
  });

  it("warns when automation_badge_enabled is true without room_id", () => {
    warnOnInvalidConfig(makeConfig({ room_id: undefined, ui: { automation_badge_enabled: true } }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("automation_badge_enabled"));
  });

  it("does not warn about automation badge when room_id is present", () => {
    warnOnInvalidConfig(makeConfig({ room_id: "living_room", ui: { automation_badge_enabled: true } }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when device entity is a placeholder", () => {
    warnOnInvalidConfig(makeConfig({
      devices: [{ entity: "field.device", type: "light" }],
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("placeholder"));
  });

  it("warns when device entity is empty", () => {
    warnOnInvalidConfig(makeConfig({
      devices: [{ entity: "", type: "light" }],
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("entity is empty"));
  });

  it("warns when battery entity is a placeholder", () => {
    warnOnInvalidConfig(makeConfig({
      devices: [{ entity: "light.test", type: "light", battery: "field.battery" }],
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("battery entity is still a placeholder"));
  });

  it("warns when offline.enabled is true but conditions is empty", () => {
    warnOnInvalidConfig(makeConfig({
      devices: [{ entity: "light.test", type: "light", offline: { enabled: true, conditions: [] } }],
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("offline.enabled is true but offline.conditions is empty"));
  });

  it("does not warn for offline with conditions", () => {
    warnOnInvalidConfig(makeConfig({
      devices: [{
        entity: "light.test",
        type: "light",
        offline: { enabled: true, conditions: [{ entity: "sensor.x", operator: "eq", value: "off" }] },
      }],
    }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when alert has no conditions", () => {
    warnOnInvalidConfig(makeConfig({
      devices: [{
        entity: "light.test",
        type: "light",
        states: {
          on_conditions: [],
          alert_conditions: [],
          states: [],
          alerts: [{ conditions: [] }],
        },
      }],
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("alert has no conditions"));
  });

  it("warns when sensor alert is enabled but entity is missing", () => {
    warnOnInvalidConfig(makeConfig({
      sensors: { alerts: { temperature: { enabled: true } } },
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("sensors.temperature"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("alert is enabled but no entity"));
  });

  it("warns when custom sensor entity is empty", () => {
    warnOnInvalidConfig(makeConfig({
      sensors: { custom: [{ name: "CO2", entity: "" }] },
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("sensors.custom[0]"));
  });
});
