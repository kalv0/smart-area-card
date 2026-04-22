import type { HassEntity } from "home-assistant-js-websocket";
import type { SmartRoomDeviceConfig, SmartRoomHeaderBadge, SmartRoomNamedStateConfig, SmartRoomPaletteColor } from "./types";
import { evaluateAllConditions } from "./conditions";
import { getPaletteColor } from "./color-helpers";
import {
  getEntity,
  getBatteryLevel,
  normalizeName,
  getDeviceIcon,
  resolveStateText,
} from "./entity-helpers";
import { shouldDimOffline, shouldStrikeOffline, offlineOpacity, resolveDeviceImage } from "./config-helpers";

export interface ComputedDeviceModel {
  key: string;
  config: SmartRoomDeviceConfig;
  entity?: HassEntity;
  batteryEntity?: HassEntity;
  isOn: boolean;
  isAlert: boolean;
  isOffline: boolean;
  offlineEnabled: boolean;
  strikeOffline: boolean;
  offlineOpacity: number;
  countsAsRoomActive: boolean;
  countsAsMediaActive: boolean;
  countsAsRecActive: boolean;
  headerBadges: SmartRoomHeaderBadge[];
  activeAccent: SmartRoomPaletteColor | "none";
  activeAccentCss?: string;
  outlined: boolean;
  label: string;
  stateText: string;
  statusIcon?: string;
  statusIconColor?: string;
  alertOutlined: boolean;
  alertAccentCss?: string;
  alertHeaderBorder: boolean;
  icon: string;
  image?: string;
  batteryLevel?: number;
  alertMessages: string[];
  alertsByBadge: Partial<Record<SmartRoomHeaderBadge, string[]>>;
}

export const computeDeviceModel = (
  states: Record<string, HassEntity>,
  config: SmartRoomDeviceConfig,
): ComputedDeviceModel => {
  const entity = getEntity(states, config.entity);
  const batteryEntity = getEntity(states, config.battery);
  const offline = config.offline?.enabled !== false && evaluateAllConditions(states, config.offline?.conditions);
  const customOn = evaluateAllConditions(states, config.states?.on_conditions);
  const customAlert = evaluateAllConditions(states, config.states?.alert_conditions);
  const evaluatedStates = (config.states?.states ?? [])
    .filter((item) => item.enabled !== false)
    .map((item) => ({
    item,
    active: evaluateAllConditions(states, item.conditions),
  }));
  const matchedStates = evaluatedStates.filter(({ active }) => active).map(({ item }) => item);
  const matchedState = matchedStates[0];
  const iconState = evaluatedStates.find(
    ({ item, active }) => (active ? Boolean(item.icon_active?.trim()) : Boolean(item.icon_inactive?.trim())),
  );
  const imageState = evaluatedStates.find(
    ({ item, active }) => (active ? Boolean(item.image_active?.trim()) : Boolean(item.image_inactive?.trim())),
  );
  const matchedAlerts =
    config.states?.alerts?.filter((item) => item.enabled !== false && evaluateAllConditions(states, item.conditions)) ?? [];
  const primaryAlert = matchedAlerts[0];
  const isOn = customOn || matchedStates.length > 0;
  const isAlert = customAlert || matchedAlerts.length > 0;
  const accent = matchedState?.border_color ?? "none";
  const outlined = matchedState?.outlined ?? (isOn && accent !== "none");
  const resolveActiveHeaderBadge = (state?: SmartRoomNamedStateConfig): SmartRoomHeaderBadge => {
    if (!state) return "none";
    if (state.header_badge_active) return state.header_badge_active;
    if (state.header_badge) return state.header_badge;
    if (state.count_light) return "light";
    if (state.count_media) return "playing";
    if (state.count_rec) return "rec";
    return "none";
  };
  const resolveInactiveHeaderBadge = (state?: SmartRoomNamedStateConfig): SmartRoomHeaderBadge =>
    state?.header_badge_inactive ?? "none";
  const headerBadges: SmartRoomHeaderBadge[] = [];
  evaluatedStates.forEach(({ item, active }) => {
    const badge = active ? resolveActiveHeaderBadge(item) : resolveInactiveHeaderBadge(item);
    if (badge !== "none") {
      headerBadges.push(badge);
    }
  });
  const offlineBadge = offline ? (config.offline?.header_badge ?? "none") : "none";
  if (offlineBadge !== "none") headerBadges.push(offlineBadge);
  matchedAlerts.forEach((alert) => {
    if (alert.header_badge && alert.header_badge !== "none") {
      headerBadges.push(alert.header_badge);
    }
  });
  const statusIcon = primaryAlert?.icon?.trim()
    || (iconState?.active ? iconState.item.icon_active?.trim() : iconState?.item.icon_inactive?.trim());
  const statusIconColor = primaryAlert?.icon?.trim()
    ? getPaletteColor(primaryAlert.icon_color ?? primaryAlert.border_color ?? "red")
    : iconState?.active
      ? getPaletteColor(iconState.item.icon_active_color ?? iconState.item.border_color ?? "white")
      : iconState?.item.icon_inactive_color
        ? getPaletteColor(iconState.item.icon_inactive_color)
        : "white";

  const deviceLabel = normalizeName(config, entity);
  const batteryLevelValue = getBatteryLevel(batteryEntity);
  const alertMessages: string[] = [];
  const alertsByBadge: Partial<Record<SmartRoomHeaderBadge, string[]>> = {};
  matchedAlerts.forEach((item) => {
    const message = item.preset_source === "battery"
      ? batteryLevelValue !== undefined
        ? `${deviceLabel} low battery (${batteryLevelValue}%)`
        : `${deviceLabel} low battery`
      : (item.message?.trim() || `${deviceLabel} alert`);
    alertMessages.push(message);
    const badge = (item.header_badge ?? "none") as SmartRoomHeaderBadge;
    if (badge !== "none") {
      if (!alertsByBadge[badge]) alertsByBadge[badge] = [];
      alertsByBadge[badge]!.push(message);
    }
  });

  return {
    key: config.entity,
    config,
    entity,
    batteryEntity,
    isOn,
    isAlert,
    isOffline: offline,
    offlineEnabled: shouldDimOffline(config),
    strikeOffline: shouldStrikeOffline(config),
    offlineOpacity: offlineOpacity(config),
    countsAsRoomActive: headerBadges.includes("light"),
    countsAsMediaActive: headerBadges.includes("playing"),
    countsAsRecActive: headerBadges.includes("rec"),
    headerBadges,
    activeAccent: accent,
    activeAccentCss: accent !== "none" ? getPaletteColor(accent) : undefined,
    outlined,
    label: deviceLabel,
    stateText: resolveStateText(states, config.states?.states, entity),
    statusIcon,
    statusIconColor,
    alertOutlined: primaryAlert?.outlined !== false && isAlert,
    alertAccentCss: isAlert ? getPaletteColor(primaryAlert?.border_color ?? "red") : undefined,
    alertHeaderBorder: primaryAlert?.header_border !== false && isAlert,
    icon: getDeviceIcon(config, entity),
    image: resolveDeviceImage(config, isOn, matchedState, imageState?.item),
    batteryLevel: batteryLevelValue,
    alertMessages,
    alertsByBadge,
  };
};
