import type { SmartRoomCardConfig } from "./types";

const ENTITY_PLACEHOLDERS = new Set(["field.device", "field.privacy", "field.battery"]);

function isPlaceholder(entityId?: string): boolean {
  if (!entityId) return false;
  const trimmed = entityId.trim();
  return ENTITY_PLACEHOLDERS.has(trimmed) || trimmed.startsWith("field.");
}

function warn(tag: string, message: string): void {
  console.warn(`[smart-area-card] ${tag}: ${message}`);
}

/**
 * Validates card config and emits console.warn for problems that would cause
 * silent runtime failures or misleading UI. Call once in setConfig — dev only.
 */
export function warnOnInvalidConfig(config: SmartRoomCardConfig): void {
  if (!config.room?.trim()) {
    warn("CONFIG", "Missing required field: room");
  }

  if (config.ui?.automation_badge_enabled && !config.room_id?.trim()) {
    warn("CONFIG", "automation_badge_enabled is true but room_id is missing — automation badge will always be empty");
  }

  (config.devices ?? []).forEach((device, i) => {
    const prefix = `device[${i}]`;

    if (!device.entity?.trim()) {
      warn(prefix, "entity is empty — tile will not render correctly");
    } else if (isPlaceholder(device.entity)) {
      warn(prefix, `entity is still a placeholder: "${device.entity}"`);
    }

    if (device.battery && isPlaceholder(device.battery)) {
      warn(prefix, `battery entity is still a placeholder: "${device.battery}"`);
    }

    if (device.offline?.enabled && !device.offline.conditions?.length) {
      warn(prefix, "offline.enabled is true but offline.conditions is empty — tile will always appear offline");
    }

    (device.states?.alerts ?? []).forEach((alert, j) => {
      if (alert.enabled !== false && !alert.conditions?.length) {
        warn(`${prefix}.alerts[${j}]`, "alert has no conditions — will never trigger");
      }
    });
  });

  const sensors = config.sensors;
  if (sensors) {
    const presetKeys = ["temperature", "humidity", "co2", "voc", "pm25", "aqi", "presence", "noise"] as const;
    presetKeys.forEach((key) => {
      const entityId = sensors[key];
      if (entityId && isPlaceholder(entityId)) {
        warn(`sensors.${key}`, `entity is still a placeholder: "${entityId}"`);
      }
      const alert = sensors.alerts?.[key];
      if (alert?.enabled && !entityId?.trim()) {
        warn(`sensors.${key}`, `alert is enabled but no entity is configured`);
      }
    });

    (sensors.custom ?? []).forEach((sensor, i) => {
      if (!sensor.entity?.trim()) {
        warn(`sensors.custom[${i}]`, `entity is empty for sensor "${sensor.name ?? i}"`);
      }
    });
  }
}
