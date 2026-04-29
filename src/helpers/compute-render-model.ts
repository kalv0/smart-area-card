import type { HomeAssistant } from "custom-card-helpers";
import { computeDeviceModel } from "./device-model";
import { getEntity, isUnavailable } from "./entity-helpers";
import { normalizeAssetPath } from "./config-helpers";
import {
  getClimateEntities,
  evaluateClimateAlert,
  buildClimateItems,
  countHeaderBadges,
  CLIMATE_DEFAULT_ICONS,
  getAreaAutomations,
} from "./room-model";
import type { SmartRoomCardConfig } from "./types";
import type { RenderModel, ClimateAlert } from "../types/card-model";
import type { HomeAssistantExtended } from "../types/ha-extensions";

export function computeRenderModel(
  config: SmartRoomCardConfig,
  hass: HomeAssistant,
  automationEntityIds: string[] = [],
): RenderModel {
  const states = hass.states;
  const hassExt = hass as HomeAssistantExtended;

  const devices = (config.devices ?? []).map((device, i) => computeDeviceModel(states, device, i));

  const deviceAlerts = devices.filter((device) => device.isAlert);
  const alertsByBadge: Partial<Record<import("./types").SmartRoomHeaderBadge, string[]>> = {};
  deviceAlerts.forEach((device) => {
    (Object.entries(device.alertsByBadge) as [import("./types").SmartRoomHeaderBadge, string[]][]).forEach(([badge, messages]) => {
      if (!alertsByBadge[badge]) alertsByBadge[badge] = [];
      alertsByBadge[badge]!.push(...messages);
    });
  });

  const temp = getEntity(states, config.sensors?.temperature);
  const humidity = getEntity(states, config.sensors?.humidity);
  const co2 = getEntity(states, config.sensors?.co2);
  const voc = getEntity(states, config.sensors?.voc);
  const pm25 = getEntity(states, config.sensors?.pm25);
  const pm10 = getEntity(states, config.sensors?.pm10);
  const aqi = getEntity(states, config.sensors?.aqi);
  const presence = getEntity(states, config.sensors?.presence);
  const noise = getEntity(states, config.sensors?.noise);
  const illuminance = getEntity(states, config.sensors?.illuminance);
  const power = getEntity(states, config.sensors?.power);
  const energy = getEntity(states, config.sensors?.energy);
  const carbon_monoxide = getEntity(states, config.sensors?.carbon_monoxide);
  const radon = getEntity(states, config.sensors?.radon);
  const moisture = getEntity(states, config.sensors?.moisture);
  const sun = getEntity(states, "sun.sun");

  const devicesActive = devices.some((device) => device.countsAsRoomActive);
  const keepOnUntilSunset = config.ui?.keep_background_on_until_sunset === true;
  const useDaylightOnBackground = keepOnUntilSunset && sun && !isUnavailable(sun) && sun.state === "above_horizon";
  const roomIsActive = devicesActive || useDaylightOnBackground;

  const darkModeEnabled = config.ui?.images?.dark_mode_enabled === true;
  let roomImageDark = false;
  if (darkModeEnabled) {
    const cond = config.ui?.images?.dark_mode_condition ?? "always";
    if (cond === "always") {
      roomImageDark = !devicesActive;
    } else if (cond === "daytime") {
      roomImageDark = !devicesActive && sun?.state === "above_horizon";
    } else if (cond === "lux") {
      const luxId = config.ui?.images?.dark_mode_lux_entity;
      const luxThreshold = config.ui?.images?.dark_mode_lux_threshold ?? 50;
      const luxVal = luxId ? Number(states[luxId]?.state) : NaN;
      roomImageDark = Number.isFinite(luxVal) && luxVal < luxThreshold;
    }
  }

  const alertsConfig = config.sensors?.alerts;
  const customIcons = config.sensors?.icons ?? {};
  const resolveIcon = (key: string) => customIcons[key as keyof typeof customIcons] || CLIMATE_DEFAULT_ICONS[key] || "mdi:gauge";
  const roomName = config.room || undefined;

  const climateAlerts = [
    evaluateClimateAlert("temperature", temp, alertsConfig?.temperature, "Temperature", resolveIcon("temperature"), roomName),
    evaluateClimateAlert("humidity", humidity, alertsConfig?.humidity, "Humidity", resolveIcon("humidity"), roomName),
    evaluateClimateAlert("co2", co2, alertsConfig?.co2, "CO₂", resolveIcon("co2"), roomName),
    evaluateClimateAlert("voc", voc, alertsConfig?.voc, "VOC", resolveIcon("voc"), roomName),
    evaluateClimateAlert("pm25", pm25, alertsConfig?.pm25, "PM2.5", resolveIcon("pm25"), roomName),
    evaluateClimateAlert("pm10", pm10, alertsConfig?.pm10, "PM10", resolveIcon("pm10"), roomName),
    evaluateClimateAlert("aqi", aqi, alertsConfig?.aqi, "AQI", resolveIcon("aqi"), roomName),
    evaluateClimateAlert("presence", presence, alertsConfig?.presence, "Presence", resolveIcon("presence"), roomName),
    evaluateClimateAlert("noise", noise, alertsConfig?.noise, "Noise", resolveIcon("noise"), roomName),
    evaluateClimateAlert("illuminance", illuminance, alertsConfig?.illuminance, "Illuminance", resolveIcon("illuminance"), roomName),
    evaluateClimateAlert("power", power, alertsConfig?.power, "Power", resolveIcon("power"), roomName),
    evaluateClimateAlert("energy", energy, alertsConfig?.energy, "Energy", resolveIcon("energy"), roomName),
    evaluateClimateAlert("carbon_monoxide", carbon_monoxide, alertsConfig?.carbon_monoxide, "CO", resolveIcon("carbon_monoxide"), roomName),
    evaluateClimateAlert("radon", radon, alertsConfig?.radon, "Radon", resolveIcon("radon"), roomName),
    evaluateClimateAlert("moisture", moisture, alertsConfig?.moisture, "Moisture", resolveIcon("moisture"), roomName),
  ].filter((item): item is ClimateAlert => Boolean(item));

  const climateAlertBadges = climateAlerts.map((alert) => ({
    key: `climate_${alert.key}`,
    icon: alert.icon,
    messages: [alert.reason],
  }));

  const customSensorEntries = (config.sensors?.custom ?? []).map((sc) => ({
    config: sc,
    entity: getEntity(states, sc.entity),
  }));
  customSensorEntries.forEach(({ config: sc, entity }, i) => {
    if (!sc.alert?.enabled || !entity || isUnavailable(entity)) return;
    const { min, max, text_eq, text_neq } = sc.alert;
    const state = entity.state;
    let triggered = false;
    if (text_eq !== undefined && state === text_eq) triggered = true;
    if (!triggered && text_neq !== undefined && state !== text_neq) triggered = true;
    if (!triggered && (min !== undefined || max !== undefined)) {
      const value = Number(state);
      if (Number.isFinite(value)) {
        if (min !== undefined && value < min) triggered = true;
        if (max !== undefined && value > max) triggered = true;
      }
    }
    if (triggered) {
      const unit = entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : "";
      const stateStr = `${state}${unit}`;
      climateAlertBadges.push({
        key: `custom_${i}`,
        icon: sc.icon || "mdi:gauge",
        messages: [roomName ? `${roomName} ${sc.name.toLowerCase()}: ${stateStr}` : `${sc.name}: ${stateStr}`],
      });
    }
  });

  const areaEntry = resolveAreaEntry(hassExt, config.room_id);
  const automationCount = config.ui?.automation_badge_enabled && areaEntry
    ? automationEntityIds.filter((id) => {
        const entity = states[id];
        return entity && !isUnavailable(entity) && entity.state === "on";
      }).length
    : 0;

  const badgeCounts = countHeaderBadges(devices, automationCount);

  // Automations list — computed from the same filtered IDs to avoid divergence
  const areaAutomations = config.ui?.automation_badge_enabled && config.room_id?.trim()
    ? getAreaAutomations(hass, hassExt.entities ?? {}, config.room_id)
    : [];

  return {
    devices,
    activeLightCount: devices.filter((d) => d.countsAsRoomActive).length,
    activeMediaCount: devices.filter((d) => d.countsAsMediaActive).length,
    activeRecCount: devices.filter((d) => d.countsAsRecActive).length,
    badgeCounts,
    // hasAlert drives the red border on the collapsed card.
    // Device alerts respect their per-alert header_border config.
    // Climate/custom sensor alerts always activate the border (no per-sensor border config yet).
    hasAlert: deviceAlerts.some((d) => d.alertHeaderBorder) || climateAlertBadges.some((b) => b.messages.length > 0),
    alertsByBadge,
    climateAlertBadges,
    alertReasons: [
      ...deviceAlerts.flatMap((device) =>
        device.alertMessages.length ? device.alertMessages : [`${device.label} alert`],
      ),
      ...climateAlerts.map((item) => item.reason),
    ],
    climateItems: buildClimateItems(
      { temp, humidity, co2, voc, pm25, pm10, aqi, presence, noise, illuminance, power, energy, carbon_monoxide, radon, moisture },
      customIcons,
      customSensorEntries.map(({ config: sc, entity }) => ({ name: sc.name, icon: sc.icon, entity })),
      config.sensors?.sensor_order,
    ),
    climateEntities: getClimateEntities(config.sensors),
    areaAutomations,
    areaIcon: areaEntry?.icon || "mdi:home-outline",
    roomBackground: darkModeEnabled
      ? undefined
      : normalizeAssetPath(config.ui?.images?.background_on, "room"),
    roomImageUrl: darkModeEnabled
      ? normalizeAssetPath(config.ui?.images?.background_on, "room")
      : undefined,
    roomImageDark,
  };
}

function resolveAreaEntry(
  hassExt: HomeAssistantExtended,
  roomId?: string,
): { name?: string; icon?: string } | undefined {
  const areas = hassExt.areas ?? {};
  const normalized = (roomId ?? "").trim();
  if (!normalized) return undefined;
  return areas[normalized];
}
