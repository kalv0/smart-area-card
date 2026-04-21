import type { HassEntity } from "home-assistant-js-websocket";
import type { SmartRoomDeviceConfig, SmartRoomNamedStateConfig } from "./types";
import { UNAVAILABLE_STATES } from "./types";
import { evaluateAllConditions } from "./conditions";

export const getEntity = (
  states: Record<string, HassEntity>,
  entityId?: string,
): HassEntity | undefined => (entityId ? states[entityId] : undefined);

export const isUnavailable = (entity?: HassEntity): boolean =>
  !entity || UNAVAILABLE_STATES.has(entity.state);

export const getBatteryLevel = (entity?: HassEntity): number | undefined => {
  if (!entity || isUnavailable(entity)) {
    return undefined;
  }

  const raw = entity.attributes.battery_level ?? entity.attributes.battery ?? entity.state;
  const numeric =
    typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace("%", ""));

  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : undefined;
};

export const getBatteryColor = (battery?: number): string => {
  if (battery === undefined) return "var(--smart-room-muted)";
  if (battery <= 20) return "var(--smart-room-alert)";
  if (battery <= 40) return "#ffd166";
  return "#34c759";
};

export const getBatteryIcon = (battery?: number): string => {
  if (battery === undefined) return "mdi:battery-unknown";
  if (battery <= 5) return "mdi:battery-alert-variant-outline";
  if (battery <= 10) return "mdi:battery-10";
  if (battery <= 20) return "mdi:battery-20";
  if (battery <= 30) return "mdi:battery-30";
  if (battery <= 40) return "mdi:battery-40";
  if (battery <= 50) return "mdi:battery-50";
  if (battery <= 60) return "mdi:battery-60";
  if (battery <= 70) return "mdi:battery-70";
  if (battery <= 80) return "mdi:battery-80";
  if (battery <= 90) return "mdi:battery-90";
  return "mdi:battery";
};

export const friendlyState = (entity?: HassEntity): string => {
  if (!entity) return "Not configured";
  if (isUnavailable(entity)) return "Offline";

  const [domain] = entity.entity_id.split(".");
  if (domain === "lock") return entity.state === "locked" ? "Locked" : "Unlocked";
  if (domain === "binary_sensor") return entity.state === "on" ? "Open" : "Closed";
  return String(entity.state).replace(/_/g, " ");
};

export const resolveStateText = (
  states: Record<string, HassEntity>,
  allStates: SmartRoomNamedStateConfig[] | undefined,
  fallbackEntity?: HassEntity,
): string => {
  const items = (allStates ?? [])
    .filter((item) => item.enabled !== false)
    .flatMap((item) => {
      const values: string[] = [];
      const active = Boolean(item.conditions?.length) ? evaluateAllConditions(states, item.conditions) : false;
      const activeText = item.text_active ?? item.text;
      const activeEntity = item.text_entity_active ?? item.text_entity;
      const inactiveText = item.text_inactive;
      const inactiveEntity = item.text_entity_inactive;
      if (active) {
        if (activeText?.trim()) {
          values.push(activeText.trim());
        }
        if (activeEntity?.trim()) {
          values.push(friendlyState(states[activeEntity.trim()]));
        }
      } else {
        if (inactiveText?.trim()) {
          values.push(inactiveText.trim());
        }
        if (inactiveEntity?.trim()) {
          values.push(friendlyState(states[inactiveEntity.trim()]));
        }
      }
      return values.filter(Boolean);
    })
    .filter(Boolean);

  if (!items.length) {
    return friendlyState(fallbackEntity);
  }
  return items.join(", ");
};

export const normalizeName = (
  config: SmartRoomDeviceConfig,
  entity?: HassEntity,
): string => config.name ?? String(entity?.attributes.friendly_name ?? config.entity);

export const getDeviceIcon = (
  config: SmartRoomDeviceConfig,
  entity?: HassEntity,
): string => {
  if (config.icon) return config.icon;
  if (entity?.attributes.icon) return entity.attributes.icon;
  return "mdi:devices";
};

export const canToggle = (entity?: HassEntity): boolean => {
  if (!entity || isUnavailable(entity)) {
    return false;
  }

  const [domain] = entity.entity_id.split(".");
  return ["light", "switch", "fan", "input_boolean"].includes(domain);
};
