import type { SmartRoomDeviceConfig, SmartRoomNamedStateConfig, SmartRoomNamedAlertConfig } from "../helpers/types";

const DEFAULT_NAMED_STATE: SmartRoomNamedStateConfig = {
  name: "",
  enabled: true,
  text: "",
  outlined: false,
  border_color: "white",
  icon_active_color: "white",
  icon_inactive_color: "white",
  image_active: "",
  image_inactive: "",
  conditions: [],
  header_badge_active: "none",
  header_badge_inactive: "none",
  count_light: false,
  count_media: false,
  count_rec: false,
};

const DEFAULT_NAMED_ALERT: SmartRoomNamedAlertConfig = {
  enabled: true,
  message: "Device alert",
  conditions: [],
  outlined: true,
  border_color: "red",
  icon: "",
  icon_color: "red",
  header_badge: "none",
};

export function addNamedState(device: SmartRoomDeviceConfig): SmartRoomDeviceConfig {
  return {
    ...device,
    states: {
      ...(device.states ?? {}),
      states: [
        ...(device.states?.states ?? []),
        { ...DEFAULT_NAMED_STATE, header_badge_active: "none", header_badge_inactive: "none" },
      ],
    },
  };
}

export function removeNamedState(device: SmartRoomDeviceConfig, stateIndex: number): SmartRoomDeviceConfig {
  return {
    ...device,
    states: {
      ...(device.states ?? {}),
      states: (device.states?.states ?? []).filter((_, i) => i !== stateIndex),
    },
  };
}

export function updateNamedState(
  device: SmartRoomDeviceConfig,
  stateIndex: number,
  key: keyof SmartRoomNamedStateConfig,
  value: unknown,
): SmartRoomDeviceConfig {
  const current = [...(device.states?.states ?? [])];
  current[stateIndex] = { ...(current[stateIndex] ?? DEFAULT_NAMED_STATE), [key]: value };
  return { ...device, states: { ...(device.states ?? {}), states: current } };
}

/** Returns null when no reset is applicable (no preset_source or no matching preset). */
export function resetPresetState(
  device: SmartRoomDeviceConfig,
  stateIndex: number,
  resolvedPreset: SmartRoomDeviceConfig,
): SmartRoomDeviceConfig | null {
  const presetSource = device.states?.states?.[stateIndex]?.preset_source;
  if (!presetSource) return null;
  const replacement = resolvedPreset.states?.states?.find((item) => item.preset_source === presetSource);
  if (!replacement) return null;
  const nextStates = [...(device.states?.states ?? [])];
  nextStates[stateIndex] = replacement;
  return { ...device, states: { ...(device.states ?? {}), states: nextStates } };
}

/** Returns null when no reset is applicable (no preset_source, battery source, or no matching preset). */
export function resetPresetAlert(
  device: SmartRoomDeviceConfig,
  alertIndex: number,
  resolvedPreset: SmartRoomDeviceConfig,
): SmartRoomDeviceConfig | null {
  const presetSource = device.states?.alerts?.[alertIndex]?.preset_source;
  if (!presetSource || presetSource === "battery") return null;
  const replacement = resolvedPreset.states?.alerts?.find((item) => item.preset_source === presetSource);
  if (!replacement) return null;
  const nextAlerts = [...(device.states?.alerts ?? [])];
  nextAlerts[alertIndex] = replacement;
  return { ...device, states: { ...(device.states ?? {}), alerts: nextAlerts } };
}

export function resetPresetOffline(
  device: SmartRoomDeviceConfig,
  resolvedPreset: SmartRoomDeviceConfig,
): SmartRoomDeviceConfig {
  return { ...device, offline: resolvedPreset.offline };
}

/** Appends a blank alert (excluding existing battery alert — caller must re-derive it). */
export function addNamedAlert(device: SmartRoomDeviceConfig): SmartRoomDeviceConfig {
  const withoutBattery = (device.states?.alerts ?? []).filter((item) => item.preset_source !== "battery");
  return {
    ...device,
    states: {
      ...(device.states ?? {}),
      alerts: [
        ...withoutBattery,
        {
          enabled: true,
          message: "",
          conditions: [],
          outlined: true,
          border_color: "red",
          icon: "",
          icon_color: "red",
          header_badge: "alert_generic",
        },
      ],
    },
  };
}

export function removeNamedAlert(device: SmartRoomDeviceConfig, alertIndex: number): SmartRoomDeviceConfig {
  return {
    ...device,
    states: {
      ...(device.states ?? {}),
      alerts: (device.states?.alerts ?? []).filter((_, i) => i !== alertIndex),
    },
  };
}

export function updateNamedAlert(
  device: SmartRoomDeviceConfig,
  alertIndex: number,
  key: keyof SmartRoomNamedAlertConfig,
  value: unknown,
): SmartRoomDeviceConfig {
  const current = [...(device.states?.alerts ?? [])];
  current[alertIndex] = { ...(current[alertIndex] ?? DEFAULT_NAMED_ALERT), [key]: value };
  return { ...device, states: { ...(device.states ?? {}), alerts: current } };
}
