import type { HassEntity } from "home-assistant-js-websocket";
import { isUnavailable } from "./entity-helpers";
import type { ComputedDeviceModel } from "./device-model";
import type { SmartRoomHeaderBadge, SmartRoomCardConfig } from "./types";
import type { ClimateAlert } from "../types/card-model";

export function createCardSignature(
  config: SmartRoomCardConfig,
  states: Record<string, HassEntity>,
  entityRegistry?: Record<string, { entity_id: string; area_id?: string }>,
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

  if (config.ui?.automation_badge_enabled && config.room_id?.trim() && entityRegistry) {
    const roomId = config.room_id.trim();
    Object.values(entityRegistry).forEach((entry) => {
      if (entry.area_id === roomId && entry.entity_id.startsWith("automation.")) {
        ids.add(entry.entity_id);
      }
    });
  }

  return [...ids]
    .sort()
    .map((entityId) => {
      const entity = states[entityId];
      return entity ? `${entityId}:${entity.state}` : `${entityId}:missing`;
    })
    .join("|");
}

export function getClimateEntities(sensors: SmartRoomCardConfig["sensors"]): string[] {
  if (!sensors) return [];
  return [sensors.temperature, sensors.humidity, sensors.co2, sensors.voc, sensors.pm25, sensors.aqi].filter(
    (value): value is string => Boolean(value),
  );
}

export function evaluateClimateAlert(
  key: "temperature" | "humidity" | "co2" | "voc" | "pm25" | "aqi",
  entity: HassEntity | undefined,
  alertConfig: { enabled?: boolean; min?: number; max?: number } | undefined,
  label: string,
  icon: string,
): ClimateAlert | undefined {
  if (!alertConfig?.enabled || !entity || isUnavailable(entity)) {
    return undefined;
  }

  const value = Number(entity.state);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const unit = entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : "";
  const message = `${label}: ${entity.state}${unit}`;

  if (alertConfig.min !== undefined && value < alertConfig.min) {
    return { key, label, reason: message, icon };
  }

  if (alertConfig.max !== undefined && value > alertConfig.max) {
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
  if (automationCount > 0) {
    counts.automation = automationCount;
  }
  return counts;
}

export const CLIMATE_DEFAULT_ICONS: Record<string, string> = {
  temperature: "mdi:thermometer",
  humidity: "mdi:water-percent",
  co2: "mdi:molecule-co2",
  voc: "mdi:flask-outline",
  pm25: "mdi:blur",
  aqi: "mdi:gauge",
};

export function buildClimateItems(
  entities: {
    temp?: HassEntity;
    humidity?: HassEntity;
    co2?: HassEntity;
    voc?: HassEntity;
    pm25?: HassEntity;
    aqi?: HassEntity;
  },
  customIcons?: Record<string, string | undefined>,
): Array<{ key: string; icon: string; value: string; className: string }> {
  const items: Array<{ key: string; icon: string; value: string; className: string }> = [];
  const resolveIcon = (key: string) => customIcons?.[key] || CLIMATE_DEFAULT_ICONS[key] || "mdi:gauge";
  const pushItem = (
    key: string,
    className: string,
    entity?: HassEntity,
    formatter?: (value: string, unit?: string) => string,
  ) => {
    if (!entity || isUnavailable(entity)) return;
    const unit = entity.attributes.unit_of_measurement ? String(entity.attributes.unit_of_measurement) : undefined;
    const raw = String(entity.state);
    const value = formatter ? formatter(raw, unit) : `${raw}${unit ? ` ${unit}` : ""}`;
    items.push({ key, icon: resolveIcon(key), value, className });
  };

  pushItem("temperature", "temp", entities.temp, (value, unit) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(1)}${unit ?? " deg"}` : `${value}${unit ? ` ${unit}` : ""}`;
  });
  pushItem("humidity", "humidity", entities.humidity, (value, unit) => `${value}${unit ?? "%"}`);
  pushItem("co2", "co2", entities.co2);
  pushItem("voc", "voc", entities.voc);
  pushItem("pm25", "pm25", entities.pm25);
  pushItem("aqi", "aqi", entities.aqi);

  return items;
}
