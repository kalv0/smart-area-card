import { deepClone } from "../utils/clone";
import type { SmartRoomDeviceConfig, SmartRoomNamedStateConfig, SmartRoomNamedAlertConfig } from "../helpers";
import { MAIN_ENTITY_DOMAIN_OPTIONS, DOMAIN_MULTISELECT_OPTIONS } from "./editor-constants";

export function foregroundFor(color: string): string {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) return "#111827";
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
  return luminance > 160 ? "#111827" : "#ffffff";
}

export function slugifyDeviceTypeId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "custom";
}

export function conditionValueToText(value: unknown): string {
  return Array.isArray(value) ? value.join(",") : String(value);
}

export function parseConditionValue(raw: string): string | number | (string | number)[] {
  const value = raw.trim();
  if (value.includes(",")) {
    return value.split(",").map((item) => {
      const trimmed = item.trim();
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) && trimmed !== "" ? numeric : trimmed;
    });
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && value !== "" ? numeric : value;
}

export function toNumberOrUndefined(raw: string): number | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function allowedMainEntitiesSummary(values?: string[]): string {
  const selected = values?.length ? values : ["*"];
  if (selected.includes("*")) return "Any entity";
  return selected.map((value) => MAIN_ENTITY_DOMAIN_OPTIONS.find((item) => item.value === value)?.label ?? value.replace(/\.$/, "")).join(", ");
}

export function domainSummary(values?: string[]): string {
  const selected = values?.length ? values : ["*"];
  if (selected.includes("*")) return "Any domains";
  return selected.map((value) => DOMAIN_MULTISELECT_OPTIONS.find((item) => item.value === value)?.label ?? value.replace(/\.$/, "")).join(", ");
}

export function valueFromEvent(event: Event): string {
  return (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

export function normalizeTypeDefaultDevice(defaultDevice: SmartRoomDeviceConfig, entityRequired: boolean): SmartRoomDeviceConfig {
  const clone = deepClone(defaultDevice);
  const sourceStates = clone.states ?? { on_conditions: [], alert_conditions: [], states: [], alerts: [] };
  return {
    ...clone,
    offline: clone.offline
      ? {
          ...clone.offline,
          ...(entityRequired ? { conditions: clone.offline.conditions ?? [] } : {}),
        }
      : clone.offline,
    states: {
      ...sourceStates,
      states: (sourceStates.states ?? []).map((item: SmartRoomNamedStateConfig) => ({
        ...item,
        preset: true,
        preset_source: item.preset_source ?? "type",
      })),
      alerts: (sourceStates.alerts ?? []).map((item: SmartRoomNamedAlertConfig) => ({
        ...item,
        preset: true,
        preset_source: item.preset_source ?? "type",
      })),
    },
  };
}
