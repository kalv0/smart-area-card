import { describe, it, expect } from "vitest";
import { storageKey, storageKeyForConfig, shouldDimOffline, shouldStrikeOffline, offlineOpacity } from "../config-helpers";
import type { SmartRoomCardConfig, SmartRoomDeviceConfig } from "../types";

function makeCardConfig(overrides: Partial<SmartRoomCardConfig> = {}): SmartRoomCardConfig {
  return { type: "custom:smart-area-card", room: "Living Room", ...overrides };
}

function makeDeviceConfig(overrides: Partial<SmartRoomDeviceConfig> = {}): SmartRoomDeviceConfig {
  return { entity: "light.test", type: "light", ...overrides };
}

describe("storageKey", () => {
  it("uses room_id when available", () => {
    const config = makeCardConfig({ room_id: "living_room", room: "Living Room" });
    expect(storageKey(config, "expanded")).toBe("smart-area:living_room:expanded");
  });

  it("falls back to room display name when room_id is absent", () => {
    const config = makeCardConfig({ room: "Living Room" });
    expect(storageKey(config, "expanded")).toBe("smart-area:Living Room:expanded");
  });

  it("falls back to room name when room_id is whitespace", () => {
    const config = makeCardConfig({ room_id: "   ", room: "Kitchen" });
    expect(storageKey(config, "alerts-closed")).toBe("smart-area:Kitchen:alerts-closed");
  });

  it("appends suffix correctly", () => {
    const config = makeCardConfig({ room_id: "bedroom" });
    expect(storageKey(config, "automation-panel")).toBe("smart-area:bedroom:automation-panel");
  });
});

describe("storageKeyForConfig (deprecated alias)", () => {
  it("returns the expanded key", () => {
    const config = makeCardConfig({ room_id: "bathroom" });
    expect(storageKeyForConfig(config)).toBe("smart-area:bathroom:expanded");
  });
});

describe("shouldDimOffline", () => {
  it("returns true only when offline.enabled is true", () => {
    expect(shouldDimOffline(makeDeviceConfig({ offline: { enabled: true } }))).toBe(true);
    expect(shouldDimOffline(makeDeviceConfig({ offline: { enabled: false } }))).toBe(false);
    expect(shouldDimOffline(makeDeviceConfig({}))).toBe(false);
  });
});

describe("shouldStrikeOffline", () => {
  it("returns true only when offline.strike is true", () => {
    expect(shouldStrikeOffline(makeDeviceConfig({ offline: { enabled: true, strike: true } }))).toBe(true);
    expect(shouldStrikeOffline(makeDeviceConfig({ offline: { enabled: true } }))).toBe(false);
    expect(shouldStrikeOffline(makeDeviceConfig({}))).toBe(false);
  });
});

describe("offlineOpacity", () => {
  it("returns configured dim_opacity", () => {
    expect(offlineOpacity(makeDeviceConfig({ offline: { enabled: true, dim_opacity: 0.3 } }))).toBe(0.3);
  });

  it("returns 0.5 as default when dim_opacity is absent", () => {
    expect(offlineOpacity(makeDeviceConfig({ offline: { enabled: true } }))).toBe(0.5);
    expect(offlineOpacity(makeDeviceConfig({}))).toBe(0.5);
  });
});
