import { deepClone } from "../utils/clone";
import type {
  SmartRoomDeviceConfig,
  SmartRoomActionConfig,
  SmartRoomOfflineConfig,
  SmartRoomNamedStateConfig,
  SmartRoomNamedAlertConfig,
  ConditionConfig,
} from "../helpers";
import type { SmartRoomTypeDefinition } from "./editor-types";
import { DEVICE_ENTITY_PLACEHOLDER, EXTRA_FIELD_PLACEHOLDERS } from "./editor-types";

export function materializeTypeDefinition(
  definition: SmartRoomTypeDefinition,
  values: Partial<Record<"entity" | "privacy" | "battery", string>> & { variables?: Record<string, string> },
): SmartRoomDeviceConfig {
  const source = deepClone(definition.default_device);
  const replaceEntity = (entityId?: string): string | undefined => {
    if (!entityId?.trim()) return entityId;
    const trimmed = entityId.trim();
    if (trimmed === DEVICE_ENTITY_PLACEHOLDER) {
      return values.entity?.trim() ? values.entity : DEVICE_ENTITY_PLACEHOLDER;
    }
    if (trimmed === EXTRA_FIELD_PLACEHOLDERS.privacy) {
      return values.privacy?.trim() ? values.privacy : EXTRA_FIELD_PLACEHOLDERS.privacy;
    }
    if (trimmed === EXTRA_FIELD_PLACEHOLDERS.battery) {
      return values.battery?.trim() ? values.battery : EXTRA_FIELD_PLACEHOLDERS.battery;
    }
    if (trimmed.startsWith("field.")) {
      const key = trimmed.slice(6);
      return values.variables?.[key]?.trim() ? values.variables[key] : trimmed;
    }
    return trimmed;
  };
  const mapConditions = (conditions?: ConditionConfig[]) =>
    (conditions ?? []).map((condition) => ({ ...condition, entity: replaceEntity(condition.entity) ?? "" }));

  return {
    ...source,
    type: definition.id,
    restrict_to_room_area: definition.restrict_to_room_area ?? false,
    entity: values.entity ?? "",
    privacy: values.privacy ?? source.privacy,
    battery: values.battery ?? source.battery,
    variables: values.variables ?? source.variables,
    tap_action: source.tap_action ? { ...source.tap_action, entity: replaceEntity(source.tap_action.entity) } : undefined,
    hold_action: source.hold_action ? { ...source.hold_action, entity: replaceEntity(source.hold_action.entity) } : undefined,
    double_tap_action: source.double_tap_action ? { ...source.double_tap_action, entity: replaceEntity(source.double_tap_action.entity) } : undefined,
    offline: source.offline ? { ...source.offline, conditions: mapConditions(source.offline.conditions) } : undefined,
    states: source.states ? {
      ...source.states,
      on_conditions: mapConditions(source.states.on_conditions),
      alert_conditions: mapConditions(source.states.alert_conditions),
      states: (source.states.states ?? [])
        .map((item: SmartRoomNamedStateConfig) => ({
          ...item,
          text_entity: replaceEntity(item.text_entity),
          text_entity_active: replaceEntity(item.text_entity_active),
          text_entity_inactive: replaceEntity(item.text_entity_inactive),
          conditions: mapConditions(item.conditions),
        })),
      alerts: (source.states.alerts ?? [])
        .map((item: SmartRoomNamedAlertConfig) => ({
          ...item,
          conditions: mapConditions(item.conditions),
        })),
    } : undefined,
  };
}

export function mergePresetStates(
  current: SmartRoomNamedStateConfig[] | undefined,
  fallback: SmartRoomNamedStateConfig[] | undefined,
): SmartRoomNamedStateConfig[] {
  const currentItems = current ?? [];
  const fallbackItems = fallback ?? [];
  if (!currentItems.length) return fallbackItems;
  return currentItems.map((item) => {
    // Match by preset_source only — index-based fallback caused incorrect merges
    // when users manually reordered states in YAML.
    const fallbackItem = item.preset_source
      ? fallbackItems.find((candidate) => candidate.preset_source === item.preset_source)
      : undefined;
    if (!fallbackItem?.preset) return item;
    return {
      ...fallbackItem,
      ...item,
      preset: true,
      preset_source: fallbackItem.preset_source ?? item.preset_source ?? "type",
    };
  });
}

export function mergePresetAlerts(
  current: SmartRoomNamedAlertConfig[] | undefined,
  fallback: SmartRoomNamedAlertConfig[] | undefined,
): SmartRoomNamedAlertConfig[] {
  const currentItems = current ?? [];
  const fallbackItems = fallback ?? [];
  if (!currentItems.length) return fallbackItems;
  return currentItems.map((item) => {
    // Match by preset_source only — index-based fallback caused incorrect merges
    // when users manually reordered alerts in YAML.
    const fallbackItem = item.preset_source
      ? fallbackItems.find((candidate) => candidate.preset_source === item.preset_source)
      : undefined;
    if (!fallbackItem?.preset) return item;
    return {
      ...fallbackItem,
      ...item,
      preset: true,
      preset_source: fallbackItem.preset_source ?? item.preset_source ?? "type",
    };
  });
}

export function syncActionEntity(
  current: SmartRoomActionConfig | undefined,
  fallback: SmartRoomActionConfig | undefined,
  previousEntity: string,
  nextEntity: string,
  aliases: string[] = [],
): SmartRoomActionConfig | undefined {
  const base = current ?? fallback;
  if (!base) return undefined;
  return { ...base, entity: !base.entity || base.entity === previousEntity || aliases.includes(base.entity) ? nextEntity : base.entity };
}

export function syncOfflinePreset(
  current: SmartRoomOfflineConfig | undefined,
  fallback: SmartRoomOfflineConfig | undefined,
  previousEntity: string,
  nextEntity: string,
  aliases: string[] = [],
): SmartRoomOfflineConfig | undefined {
  const base = current ?? fallback;
  if (!base) return undefined;
  const conditions = (base.conditions ?? fallback?.conditions ?? []).map((condition) => ({
    ...condition,
    entity: !condition.entity || condition.entity === previousEntity || aliases.includes(condition.entity) ? nextEntity : condition.entity,
  }));
  return { ...base, conditions };
}

export function syncStatePreset(
  current: SmartRoomDeviceConfig["states"] | undefined,
  fallback: SmartRoomDeviceConfig["states"] | undefined,
  previousEntity: string,
  nextEntity: string,
  aliases: string[] = [],
): SmartRoomDeviceConfig["states"] {
  const base = current ?? fallback ?? {};
  const syncEntity = (entityId?: string) =>
    (!entityId || entityId === previousEntity || aliases.includes(entityId)) ? nextEntity : entityId;
  const syncConditions = (conditions: ConditionConfig[] | undefined) =>
    (conditions ?? []).map((condition) => ({ ...condition, entity: syncEntity(condition.entity) }));
  const states = mergePresetStates(base.states?.length ? base.states : fallback?.states, fallback?.states)
    .map((item) => ({
      ...item,
      text_entity: syncEntity(item.text_entity),
      text_entity_active: syncEntity(item.text_entity_active),
      text_entity_inactive: syncEntity(item.text_entity_inactive),
      conditions: syncConditions(item.conditions),
    }));
  const alerts = mergePresetAlerts(base.alerts?.length ? base.alerts : fallback?.alerts, fallback?.alerts)
    .map((item) => ({ ...item, conditions: syncConditions(item.conditions) }));
  return { ...base, states, alerts, on_conditions: syncConditions(base.on_conditions), alert_conditions: syncConditions(base.alert_conditions) };
}
