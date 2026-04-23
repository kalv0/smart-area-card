import { describe, it, expect } from "vitest";
import { mergePresetStates, mergePresetAlerts, materializeTypeDefinition } from "../preset-engine";
import type { SmartRoomNamedStateConfig, SmartRoomNamedAlertConfig } from "../../helpers/types";
import type { SmartRoomTypeDefinition } from "../editor-types";
import { DEVICE_ENTITY_PLACEHOLDER } from "../editor-types";

describe("mergePresetStates", () => {
  it("returns fallback when current is empty", () => {
    const fallback: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "type", text: "Default", conditions: [] },
    ];
    expect(mergePresetStates([], fallback)).toEqual(fallback);
    expect(mergePresetStates(undefined, fallback)).toEqual(fallback);
  });

  it("returns current items unmodified when they have no preset_source", () => {
    const current: SmartRoomNamedStateConfig[] = [{ text: "Custom", conditions: [] }];
    const fallback: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "type", text: "Default", conditions: [] },
    ];
    const result = mergePresetStates(current, fallback);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Custom");
  });

  it("merges preset items by preset_source identity, not index", () => {
    const current: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "offline", text: "Custom Offline", conditions: [] },
      { preset: true, preset_source: "type", text: "Custom On", conditions: [] },
    ];
    const fallback: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "type", text: "Preset On", conditions: [], icon_active: "mdi:lightbulb" },
      { preset: true, preset_source: "offline", text: "Preset Offline", conditions: [], icon_active: "mdi:alert" },
    ];
    const result = mergePresetStates(current, fallback);
    const offlineItem = result.find((r) => r.preset_source === "offline");
    expect(offlineItem?.text).toBe("Custom Offline");
    expect(offlineItem?.icon_active).toBe("mdi:alert");
    const typeItem = result.find((r) => r.preset_source === "type");
    expect(typeItem?.text).toBe("Custom On");
    expect(typeItem?.icon_active).toBe("mdi:lightbulb");
  });

  it("does not merge when fallback item has no preset flag", () => {
    const current: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "type", text: "Custom", conditions: [] },
    ];
    const fallback: SmartRoomNamedStateConfig[] = [
      { preset_source: "type", text: "Not a preset", conditions: [] },
    ];
    const result = mergePresetStates(current, fallback);
    expect(result[0].text).toBe("Custom");
  });

  it("does not fall back by index when preset_source changes order", () => {
    const current: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "offline", text: "Offline state", conditions: [] },
      { preset: true, preset_source: "type", text: "Type state", conditions: [] },
    ];
    const fallback: SmartRoomNamedStateConfig[] = [
      { preset: true, preset_source: "type", text: "Preset Type", conditions: [] },
      { preset: true, preset_source: "offline", text: "Preset Offline", conditions: [] },
    ];
    const result = mergePresetStates(current, fallback);
    expect(result[0].preset_source).toBe("offline");
    expect(result[1].preset_source).toBe("type");
  });
});

describe("mergePresetAlerts", () => {
  it("returns fallback when current is empty", () => {
    const fallback: SmartRoomNamedAlertConfig[] = [
      { preset: true, preset_source: "type", name: "Alert", conditions: [] },
    ];
    expect(mergePresetAlerts([], fallback)).toEqual(fallback);
  });

  it("merges by preset_source, not index position", () => {
    const current: SmartRoomNamedAlertConfig[] = [
      { preset: true, preset_source: "battery", name: "Custom Battery", conditions: [] },
    ];
    const fallback: SmartRoomNamedAlertConfig[] = [
      { preset: true, preset_source: "battery", name: "Low Battery", border_color: "red", conditions: [] },
    ];
    const result = mergePresetAlerts(current, fallback);
    expect(result[0].name).toBe("Custom Battery");
    expect(result[0].border_color).toBe("red");
  });

  it("returns item as-is when it has no preset_source", () => {
    const current: SmartRoomNamedAlertConfig[] = [{ name: "Manual Alert", conditions: [] }];
    const result = mergePresetAlerts(current, []);
    expect(result[0].name).toBe("Manual Alert");
  });
});

describe("materializeTypeDefinition", () => {
  const definition: SmartRoomTypeDefinition = {
    id: "light",
    label: "Light",
    editor_color: "#ffcc00",
    entity_required: true,
    default_device: {
      entity: DEVICE_ENTITY_PLACEHOLDER,
      type: "light",
      states: {
        on_conditions: [{ entity: DEVICE_ENTITY_PLACEHOLDER, operator: "eq", value: "on" }],
        alert_conditions: [],
        states: [],
        alerts: [],
      },
    },
  };

  it("replaces DEVICE_ENTITY_PLACEHOLDER with provided entity", () => {
    const result = materializeTypeDefinition(definition, { entity: "light.living_room" });
    expect(result.entity).toBe("light.living_room");
    expect(result.states?.on_conditions?.[0].entity).toBe("light.living_room");
  });

  it("keeps placeholder when entity is empty", () => {
    const result = materializeTypeDefinition(definition, { entity: "" });
    expect(result.entity).toBe("");
    expect(result.states?.on_conditions?.[0].entity).toBe(DEVICE_ENTITY_PLACEHOLDER);
  });

  it("replaces field.* variables from variables map", () => {
    const defWithVar: SmartRoomTypeDefinition = {
      id: "camera",
      label: "Camera",
      editor_color: "#888",
      entity_required: true,
      default_device: {
        entity: DEVICE_ENTITY_PLACEHOLDER,
        type: "camera",
        states: {
          on_conditions: [{ entity: "field.motion", operator: "eq", value: "on" }],
          alert_conditions: [],
          states: [],
          alerts: [],
        },
      },
    };
    const result = materializeTypeDefinition(defWithVar, {
      entity: "camera.front_door",
      variables: { motion: "binary_sensor.motion" },
    });
    expect(result.states?.on_conditions?.[0].entity).toBe("binary_sensor.motion");
  });

  it("sets type from definition id", () => {
    const result = materializeTypeDefinition(definition, { entity: "light.x" });
    expect(result.type).toBe("light");
  });

  it("keeps field.* placeholder when variable is not provided", () => {
    const defWithVar: SmartRoomTypeDefinition = {
      id: "camera",
      label: "Camera",
      editor_color: "#888",
      entity_required: true,
      default_device: {
        entity: DEVICE_ENTITY_PLACEHOLDER,
        type: "camera",
        states: {
          on_conditions: [{ entity: "field.motion", operator: "eq", value: "on" }],
          alert_conditions: [],
          states: [],
          alerts: [],
        },
      },
    };
    const result = materializeTypeDefinition(defWithVar, { entity: "camera.x" });
    expect(result.states?.on_conditions?.[0].entity).toBe("field.motion");
  });
});
