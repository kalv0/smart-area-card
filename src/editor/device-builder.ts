/**
 * Pure device-config transformation functions used by the editor.
 * These have no DOM or LitElement dependency — they transform SmartRoomDeviceConfig
 * objects and are independently testable.
 */
import type {
  SmartRoomDeviceConfig,
  SmartRoomCardConfig,
  SmartRoomNamedAlertConfig,
  SmartRoomDeviceType,
} from "../helpers/types";
import type { SmartRoomTypeDefinition } from "./editor-types";
import { DEVICE_ENTITY_PLACEHOLDER } from "./editor-types";
import { materializeTypeDefinition, mergePresetStates, mergePresetAlerts, syncActionEntity, syncOfflinePreset, syncStatePreset } from "./preset-engine";

export function definitionForType(
  typeDefinitions: SmartRoomTypeDefinition[],
  type: SmartRoomDeviceType,
): SmartRoomTypeDefinition {
  return typeDefinitions.find((item) => item.id === type)
    ?? typeDefinitions.find((item) => item.id === "custom")!;
}

export function isEntityRequired(
  typeDefinitions: SmartRoomTypeDefinition[],
  device: SmartRoomDeviceConfig,
): boolean {
  return definitionForType(typeDefinitions, device.type ?? "custom").entity_required;
}

export function allowedMainEntities(
  typeDefinitions: SmartRoomTypeDefinition[],
  type?: SmartRoomDeviceType,
): string[] {
  return definitionForType(typeDefinitions, type ?? "custom").allowed_main_entities ?? ["*"];
}

export function buildPreset(
  typeDefinitions: SmartRoomTypeDefinition[],
  type: SmartRoomDeviceConfig["type"],
  entity: string,
  device?: SmartRoomDeviceConfig,
): SmartRoomDeviceConfig {
  const definition = definitionForType(typeDefinitions, type ?? "custom");
  return materializeTypeDefinition(definition, {
    entity,
    privacy: device?.privacy,
    battery: device?.battery,
    variables: device?.variables,
  });
}

export function applyDerivedBatteryAlertWithUi(
  device: SmartRoomDeviceConfig,
  threshold: number,
  ui: SmartRoomCardConfig["ui"],
): SmartRoomDeviceConfig {
  const batteryEntity = device.battery?.trim();
  const allAlerts = device.states?.alerts ?? [];
  const existingBatteryAlert = allAlerts.find((item) => item.preset_source === "battery");
  const currentAlerts = allAlerts.filter((item) => item.preset_source !== "battery");
  if (!batteryEntity || device.battery_alert_enabled === false) {
    return { ...device, states: { ...(device.states ?? {}), alerts: currentAlerts } };
  }
  const batteryAlert: SmartRoomNamedAlertConfig = {
    name: "Low battery",
    preset: true,
    preset_source: "battery",
    conditions: [{ entity: batteryEntity, operator: "lte", value: threshold }],
    enabled: existingBatteryAlert?.enabled !== false,
    message: existingBatteryAlert?.message ?? "",
    outlined: existingBatteryAlert?.outlined ?? (ui?.battery_alert_outlined !== false),
    border_color: existingBatteryAlert?.border_color ?? (ui?.battery_alert_border_color ?? "red"),
    header_badge: existingBatteryAlert?.header_badge ?? (ui?.battery_alert_header_badge ?? "low_battery"),
    header_border: existingBatteryAlert?.header_border ?? (ui?.battery_alert_header_border !== false),
    icon: existingBatteryAlert?.icon,
    icon_color: existingBatteryAlert?.icon_color,
  };
  return { ...device, states: { ...(device.states ?? {}), alerts: [...currentAlerts, batteryAlert] } };
}

export function applyTypePreset(
  typeDefinitions: SmartRoomTypeDefinition[],
  device: SmartRoomDeviceConfig,
  type: SmartRoomDeviceConfig["type"],
  entity: string,
): SmartRoomDeviceConfig {
  const preset = buildPreset(typeDefinitions, type ?? "custom", entity, device);
  return {
    ...device,
    ...preset,
    entity: device.entity,
    type: type ?? "custom",
  };
}

export function hydratePresetDefaults(
  typeDefinitions: SmartRoomTypeDefinition[],
  device: SmartRoomDeviceConfig,
  batteryThreshold: number,
  ui: SmartRoomCardConfig["ui"],
): SmartRoomDeviceConfig {
  const preset = buildPreset(typeDefinitions, device.type ?? "custom", device.entity ?? "", device);
  const mergedStates = mergePresetStates(device.states?.states, preset.states?.states);
  const mergedAlerts = mergePresetAlerts(device.states?.alerts, preset.states?.alerts);
  return applyDerivedBatteryAlertWithUi({
    ...device,
    image: device.image ?? preset.image,
    image_on: device.image_on ?? preset.image_on,
    image_off: device.image_off ?? preset.image_off,
    privacy: device.privacy ?? preset.privacy,
    tap_action: device.tap_action ?? preset.tap_action,
    hold_action: device.hold_action ?? preset.hold_action,
    double_tap_action: device.double_tap_action ?? preset.double_tap_action,
    offline: device.offline ?? preset.offline,
    states: {
      ...(preset.states ?? {}),
      ...(device.states ?? {}),
      states: mergedStates,
      alerts: mergedAlerts,
    },
  }, batteryThreshold, ui);
}

export function syncDeviceWithEntity(
  typeDefinitions: SmartRoomTypeDefinition[],
  device: SmartRoomDeviceConfig,
  previousEntity: string,
  nextEntity: string,
  batteryThreshold: number,
  ui: SmartRoomCardConfig["ui"],
): SmartRoomDeviceConfig {
  const preset = buildPreset(typeDefinitions, device.type ?? "custom", nextEntity, device);
  return applyDerivedBatteryAlertWithUi({
    ...device,
    entity: nextEntity,
    tap_action: syncActionEntity(device.tap_action, preset.tap_action, previousEntity, nextEntity, [DEVICE_ENTITY_PLACEHOLDER]),
    hold_action: syncActionEntity(device.hold_action, preset.hold_action, previousEntity, nextEntity, [DEVICE_ENTITY_PLACEHOLDER]),
    double_tap_action: syncActionEntity(device.double_tap_action, preset.double_tap_action, previousEntity, nextEntity, [DEVICE_ENTITY_PLACEHOLDER]),
    offline: syncOfflinePreset(device.offline, preset.offline, previousEntity, nextEntity, [DEVICE_ENTITY_PLACEHOLDER]),
    states: syncStatePreset(device.states, preset.states, previousEntity, nextEntity, [DEVICE_ENTITY_PLACEHOLDER]),
  }, batteryThreshold, ui);
}

export function buildResolvedPresetDevice(
  typeDefinitions: SmartRoomTypeDefinition[],
  device: SmartRoomDeviceConfig,
  batteryThreshold: number,
  ui: SmartRoomCardConfig["ui"],
): SmartRoomDeviceConfig {
  return applyDerivedBatteryAlertWithUi(
    applyTypePreset(typeDefinitions, { ...device, states: { on_conditions: [], alert_conditions: [] } }, device.type ?? "custom", device.entity ?? ""),
    batteryThreshold,
    ui,
  );
}
