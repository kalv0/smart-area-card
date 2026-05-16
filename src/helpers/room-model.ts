import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "custom-card-helpers";
import { isUnavailable } from "./entity-helpers";
import { getDeviceTrackedEntityIds, type ComputedDeviceModel } from "./device-model";
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
  return createCardSignatureFromIds(createTrackedEntityIds(config, automationEntityIds), states);
}

/**
 * Builds the stable list of entity IDs that can affect this card.
 * Keep this cached on the element; rebuilding it for every global hass update
 * becomes expensive on dashboards with many cards.
 */
export function createTrackedEntityIds(
  config: SmartRoomCardConfig,
  automationEntityIds: string[] = [],
): string[] {
  const ids = new Set<string>();
  (config.devices ?? []).forEach((device) => {
    getDeviceTrackedEntityIds(device).forEach((id) => ids.add(id));
  });
  getClimateEntities(config.sensors).forEach((entityId) => ids.add(entityId));
  if (config.expander?.condition?.entity) ids.add(config.expander.condition.entity);
  automationEntityIds.forEach((id) => ids.add(id));

  return [...ids].sort();
}

export function createCardSignatureFromIds(
  entityIds: readonly string[],
  states: Record<string, HassEntity>,
): string {
  return entityIds
    .map((entityId) => {
      const entity = states[entityId];
      if (!entity) return `${entityId}:missing`;
      const attrs = entity.attributes;
      return [
        entityId,
        entity.state,
        attrs.friendly_name ?? "",
        attrs.icon ?? "",
        attrs.unit_of_measurement ?? "",
        attrs.battery_level ?? attrs.battery ?? "",
        attrs.last_triggered ?? "",
      ].join(":");
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
    entityId: e.entity_id,
    name: String(e.attributes.friendly_name ?? e.entity_id),
    enabled: e.state === "on",
    lastTriggered: e.attributes.last_triggered as string | null | undefined,
  });

  const enabled = automations.filter((e) => e.state === "on").map(toItem);
  const disabled = automations.filter((e) => e.state !== "on").map(toItem);
  return [...enabled, ...disabled];
}

export function getAreaAutomationsByIds(
  states: Record<string, HassEntity>,
  automationEntityIds: readonly string[],
): AreaAutomation[] {
  const enabled: AreaAutomation[] = [];
  const disabled: AreaAutomation[] = [];

  for (const entityId of automationEntityIds) {
    const entity = states[entityId];
    if (!entity || isUnavailable(entity)) continue;
    const item: AreaAutomation = {
      entityId,
      name: String(entity.attributes.friendly_name ?? entityId),
      enabled: entity.state === "on",
      lastTriggered: entity.attributes.last_triggered as string | null | undefined,
    };
    (item.enabled ? enabled : disabled).push(item);
  }

  return [...enabled, ...disabled];
}

export function getClimateEntities(sensors: SmartRoomCardConfig["sensors"]): string[] {
  if (!sensors) return [];
  const presets = [
    sensors.temperature, sensors.humidity, sensors.co2, sensors.voc,
    sensors.pm25, sensors.pm10, sensors.aqi, sensors.presence, sensors.noise,
    sensors.illuminance, sensors.power, sensors.energy,
    sensors.carbon_monoxide, sensors.radon, sensors.moisture,
  ].filter((value): value is string => Boolean(value));
  const presetBatteries = Object.values(sensors.batteries ?? {})
    .map((battery) => battery?.entity)
    .filter((value): value is string => Boolean(value));
  const custom = (sensors.custom ?? []).map((s) => s.entity).filter(Boolean);
  const customBatteries = (sensors.custom ?? []).map((s) => s.battery).filter((value): value is string => Boolean(value));
  return [...presets, ...presetBatteries, ...custom, ...customBatteries];
}

export function formatSensorAlertReason(label: string, entity: HassEntity): string {
  const unit = entity.attributes["unit_of_measurement"] as string | undefined;
  const value = unit ? `${entity.state} ${unit}` : entity.state;
  return `${label}: ${value}`;
}

export function evaluateClimateAlert(
  key: string,
  entity: HassEntity | undefined,
  alertConfig: { enabled?: boolean; min?: number; max?: number; eq?: number | string; neq?: string; text_eq?: string; text_neq?: string } | undefined,
  label: string,
  icon: string,
): ClimateAlert | undefined {
  const hasCondition = alertConfig
    && (alertConfig.min !== undefined
      || alertConfig.max !== undefined
      || alertConfig.eq !== undefined
      || alertConfig.neq !== undefined
      || alertConfig.text_eq !== undefined
      || alertConfig.text_neq !== undefined);
  if (!hasCondition || !entity || isUnavailable(entity)) {
    return undefined;
  }

  const message = formatSensorAlertReason(label, entity);

  const state = entity.state;

  if (alertConfig.eq !== undefined && typeof alertConfig.eq === "string" && state === alertConfig.eq) return { key, label, reason: message, icon };
  if (alertConfig.neq !== undefined && state !== alertConfig.neq) return { key, label, reason: message, icon };
  if (alertConfig.text_eq !== undefined && state === alertConfig.text_eq) return { key, label, reason: message, icon };
  if (alertConfig.text_neq !== undefined && state !== alertConfig.text_neq) return { key, label, reason: message, icon };

  const value = Number(state);
  if (!Number.isFinite(value)) return undefined;

  if (alertConfig.min !== undefined && value < alertConfig.min) return { key, label, reason: message, icon };
  if (alertConfig.max !== undefined && value > alertConfig.max) return { key, label, reason: message, icon };

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
  pm10: "mdi:blur-linear",
  aqi: "mdi:gauge",
  presence: "mdi:motion-sensor",
  noise: "mdi:volume-high",
  illuminance: "mdi:brightness-5",
  power: "mdi:lightning-bolt",
  energy: "mdi:flash",
  carbon_monoxide: "mdi:molecule-co",
  radon: "mdi:radioactive",
  moisture: "mdi:water-alert",
};

export function buildClimateItems(
  entities: {
    temp?: HassEntity;
    humidity?: HassEntity;
    co2?: HassEntity;
    voc?: HassEntity;
    pm25?: HassEntity;
    pm10?: HassEntity;
    aqi?: HassEntity;
    presence?: HassEntity;
    noise?: HassEntity;
    illuminance?: HassEntity;
    power?: HassEntity;
    energy?: HassEntity;
    carbon_monoxide?: HassEntity;
    radon?: HassEntity;
    moisture?: HassEntity;
  },
  customIcons?: Record<string, string | undefined>,
  customSensors?: Array<{ name: string; icon?: string; entity?: HassEntity }>,
  sensorOrder?: string[],
  alertKeys: ReadonlySet<string> = new Set(),
): Array<{ key: string; icon: string; value: string; className: string }> {
  const resolveIcon = (key: string) => customIcons?.[key] || CLIMATE_DEFAULT_ICONS[key] || "mdi:gauge";

  type ItemDef = { entity?: HassEntity; formatter?: (v: string, u?: string) => string };
  const presetMap: Record<string, ItemDef> = {
    temperature: { entity: entities.temp, formatter: (v, u) => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(1)}${u ?? " deg"}` : `${v}${u ? ` ${u}` : ""}`; } },
    humidity: { entity: entities.humidity, formatter: (v, u) => `${v}${u ?? "%"}` },
    co2: { entity: entities.co2 },
    voc: { entity: entities.voc },
    pm25: { entity: entities.pm25 },
    pm10: { entity: entities.pm10 },
    aqi: { entity: entities.aqi },
    presence: { entity: entities.presence },
    noise: { entity: entities.noise },
    illuminance: { entity: entities.illuminance },
    power: { entity: entities.power },
    energy: { entity: entities.energy },
    carbon_monoxide: { entity: entities.carbon_monoxide },
    radon: { entity: entities.radon },
    moisture: { entity: entities.moisture },
  };

  const DEFAULT_ORDER = ["temperature", "humidity", "presence", "co2", "illuminance", "voc", "pm25", "pm10", "aqi", "noise", "power", "energy", "carbon_monoxide", "radon", "moisture"];
  const customCount = customSensors?.length ?? 0;
  const order: string[] = [...(sensorOrder ?? DEFAULT_ORDER)];
  for (const key of DEFAULT_ORDER) {
    if (!order.includes(key)) order.push(key);
  }
  for (let i = 0; i < customCount; i++) {
    const key = `custom_${i}`;
    if (!order.includes(key)) order.push(key);
  }

  const items: Array<{ key: string; icon: string; value: string; className: string }> = [];

  for (const key of order) {
    const posClass = items.length === 0 ? " primary" : items.length === 1 ? " secondary" : "";
    if (key.startsWith("custom_")) {
      const i = Number(key.slice(7));
      const sensor = customSensors?.[i];
      if (!sensor?.entity || isUnavailable(sensor.entity)) continue;
      const unit = sensor.entity.attributes.unit_of_measurement ? String(sensor.entity.attributes.unit_of_measurement) : undefined;
      const alertClass = alertKeys.has(key) ? " alert" : "";
      items.push({ key, icon: sensor.icon || "mdi:gauge", value: `${sensor.entity.state}${unit ? ` ${unit}` : ""}`, className: `custom${posClass}${alertClass}` });
    } else {
      const def = presetMap[key];
      if (!def?.entity || isUnavailable(def.entity)) continue;
      const unit = def.entity.attributes.unit_of_measurement ? String(def.entity.attributes.unit_of_measurement) : undefined;
      const raw = String(def.entity.state);
      const value = def.formatter ? def.formatter(raw, unit) : `${raw}${unit ? ` ${unit}` : ""}`;
      const alertClass = alertKeys.has(key) ? " alert" : "";
      items.push({ key, icon: resolveIcon(key), value, className: `${key}${posClass}${alertClass}` });
    }
  }

  return items;
}
