import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "custom-card-helpers";
import { isUnavailable } from "./entity-helpers";
import type { ComputedDeviceModel } from "./device-model";
import type { SmartRoomHeaderBadge, SmartRoomCardConfig } from "./types";
import type { ClimateAlert, AreaAutomation } from "../types/card-model";
import type { HomeAssistantExtended } from "../types/ha-extensions";

/**
 * Builds the card signature from the states of all tracked entities.
 * Accepts pre-filtered automation entity IDs to avoid iterating the full
 * entity registry on every hass update.
 */
export function createCardSignature(
  config: SmartRoomCardConfig,
  states: Record<string, HassEntity>,
  automationEntityIds: string[] = [],
): string {
  const ids = new Set<string>();
  (config.devices ?? []).forEach((device) => {
    ids.add(device.entity);
    if (device.battery) ids.add(device.battery);
    if (device.privacy) ids.add(device.privacy);
    device.offline?.conditions?.forEach((condition) => ids.add(condition.entity));
    device.states?.on_conditions?.forEach((condition) => ids.add(condition.entity));
    device.states?.alert_conditions?.forEach((condition) => ids.add(condition.entity));
    device.states?.states?.forEach((namedState) => {
      namedState.conditions?.forEach((condition) => ids.add(condition.entity));
    });
    device.states?.alerts?.forEach((alert) => {
      alert.conditions?.forEach((condition) => ids.add(condition.entity));
    });
  });
  getClimateEntities(config.sensors).forEach((entityId) => ids.add(entityId));
  if (config.expander?.condition?.entity) ids.add(config.expander.condition.entity);
  automationEntityIds.forEach((id) => ids.add(id));

  return [...ids]
    .sort()
    .map((entityId) => {
      const entity = states[entityId];
      return entity ? `${entityId}:${entity.state}` : `${entityId}:missing`;
    })
    .join("|");
}

/**
 * Returns automation entity IDs that belong to the given area.
 * Call once when config or entity registry changes; cache the result.
 */
export function resolveAreaAutomationIds(
  entityRegistry: Record<string, { entity_id: string; area_id?: string | null }>,
  roomId: string,
): string[] {
  const normalized = roomId.trim();
  if (!normalized) return [];
  return Object.values(entityRegistry)
    .filter((entry) => entry.area_id === normalized && entry.entity_id.startsWith("automation."))
    .map((entry) => entry.entity_id);
}

/**
 * Returns the full list of area automations with name, enabled state and
 * last-triggered timestamp, ordered enabled-first.
 */
export function getAreaAutomations(
  hass: HomeAssistant,
  entityRegistry: Record<string, { entity_id: string; area_id?: string | null }>,
  roomId: string,
): AreaAutomation[] {
  const normalized = roomId.trim();
  if (!normalized) return [];

  const automations = Object.values(hass.states).filter((entity) => {
    if (!entity.entity_id.startsWith("automation.")) return false;
    return entityRegistry[entity.entity_id]?.area_id === normalized;
  });

  const toItem = (e: (typeof automations)[0]): AreaAutomation => ({
    name: String(e.attributes.friendly_name ?? e.entity_id),
    enabled: e.state === "on",
    lastTriggered: e.attributes.last_triggered as string | null | undefined,
  });

  const enabled = automations.filter((e) => e.state === "on").map(toItem);
  const disabled = automations.filter((e) => e.state !== "on").map(toItem);
  return [...enabled, ...disabled];
}

export function getClimateEntities(sensors: SmartRoomCardConfig["sensors"]): string[] {
  if (!sensors) return [];
  const presets = [
    sensors.temperature, sensors.humidity, sensors.co2, sensors.voc,
    sensors.pm25, sensors.aqi, sensors.presence, sensors.noise,
  ].filter((value): value is string => Boolean(value));
  const custom = (sensors.custom ?? []).map((s) => s.entity).filter(Boolean);
  return [...presets, ...custom];
}

export function evaluateClimateAlert(
  key: "temperature" | "humidity" | "co2" | "voc" | "pm25" | "aqi" | "presence" | "noise",
  entity: HassEntity | undefined,
  alertConfig: { enabled?: boolean; min?: number; max?: number; eq?: number | string } | undefined,
  label: string,
  icon: string,
  roomName?: string,
): ClimateAlert | undefined {
  if (!alertConfig?.enabled || !entity || isUnavailable(entity)) {
    return undefined;
  }

  const unit = entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : "";
  const stateStr = `${entity.state}${unit}`;
  const message = roomName
    ? `${roomName} ${label.toLowerCase()}: ${stateStr}`
    : `${label}: ${stateStr}`;

  if (alertConfig.eq !== undefined && typeof alertConfig.eq === "string") {
    return entity.state === alertConfig.eq ? { key, label, reason: message, icon } : undefined;
  }

  const value = Number(entity.state);
  if (!Number.isFinite(value)) return undefined;

  if (alertConfig.min !== undefined && value < alertConfig.min) return { key, label, reason: message, icon };
  if (alertConfig.max !== undefined && value > alertConfig.max) return { key, label, reason: message, icon };
  if (alertConfig.eq !== undefined && typeof alertConfig.eq === "number" && value === alertConfig.eq) {
    return { key, label, reason: message, icon };
  }

  return undefined;
}

export function countHeaderBadges(
  devices: ComputedDeviceModel[],
  automationCount = 0,
): Partial<Record<SmartRoomHeaderBadge, number>> {
  const counts: Partial<Record<SmartRoomHeaderBadge, number>> = {};
  devices.forEach((device) => {
    device.headerBadges.forEach((badge) => {
      if (badge === "none") return;
      counts[badge] = (counts[badge] ?? 0) + 1;
    });
  });
  if (automationCount > 0) counts.automation = automationCount;
  return counts;
}

export const CLIMATE_DEFAULT_ICONS: Record<string, string> = {
  temperature: "mdi:thermometer",
  humidity: "mdi:water-percent",
  co2: "mdi:molecule-co2",
  voc: "mdi:flask-outline",
  pm25: "mdi:blur",
  aqi: "mdi:gauge",
  presence: "mdi:motion-sensor",
  noise: "mdi:volume-high",
};

export function buildClimateItems(
  entities: {
    temp?: HassEntity;
    humidity?: HassEntity;
    co2?: HassEntity;
    voc?: HassEntity;
    pm25?: HassEntity;
    aqi?: HassEntity;
    presence?: HassEntity;
    noise?: HassEntity;
  },
  customIcons?: Record<string, string | undefined>,
  customSensors?: Array<{ name: string; icon?: string; entity?: HassEntity }>,
): Array<{ key: string; icon: string; value: string; className: string }> {
  const items: Array<{ key: string; icon: string; value: string; className: string }> = [];
  const resolveIcon = (key: string) => customIcons?.[key] || CLIMATE_DEFAULT_ICONS[key] || "mdi:gauge";
  const pushItem = (
    key: string,
    className: string,
    entity?: HassEntity,
    icon?: string,
    formatter?: (value: string, unit?: string) => string,
  ) => {
    if (!entity || isUnavailable(entity)) return;
    const unit = entity.attributes.unit_of_measurement ? String(entity.attributes.unit_of_measurement) : undefined;
    const raw = String(entity.state);
    const value = formatter ? formatter(raw, unit) : `${raw}${unit ? ` ${unit}` : ""}`;
    items.push({ key, icon: icon ?? resolveIcon(key), value, className });
  };

  pushItem("temperature", "temp", entities.temp, undefined, (value, unit) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(1)}${unit ?? " deg"}` : `${value}${unit ? ` ${unit}` : ""}`;
  });
  pushItem("humidity", "humidity", entities.humidity, undefined, (value, unit) => `${value}${unit ?? "%"}`);
  pushItem("co2", "co2", entities.co2);
  pushItem("voc", "voc", entities.voc);
  pushItem("pm25", "pm25", entities.pm25);
  pushItem("aqi", "aqi", entities.aqi);
  pushItem("presence", "presence", entities.presence);
  pushItem("noise", "noise", entities.noise);

  (customSensors ?? []).forEach((sensor, i) => {
    pushItem(`custom_${i}`, "custom", sensor.entity, sensor.icon || "mdi:gauge");
  });

  return items;
}
