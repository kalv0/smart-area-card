import type { HomeAssistant } from "custom-card-helpers";
import { computeDeviceModel } from "./device-model";
import { getEntity, isUnavailable } from "./entity-helpers";
import { normalizeAssetPath } from "./config-helpers";
import { getClimateEntities, evaluateClimateAlert, buildClimateItems, countHeaderBadges, CLIMATE_DEFAULT_ICONS } from "./room-model";
import type { SmartRoomCardConfig } from "./types";
import type { RenderModel, ClimateAlert } from "../types/card-model";
import type { HomeAssistantExtended } from "../types/ha-extensions";

export function computeRenderModel(
  config: SmartRoomCardConfig,
  hass: HomeAssistant,
): RenderModel {
  const states = hass.states;
  const hassExt = hass as HomeAssistantExtended;
  const devices = (config.devices ?? []).map((device) => computeDeviceModel(states, device));
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
  const aqi = getEntity(states, config.sensors?.aqi);
  const sun = getEntity(states, "sun.sun");
  const keepOnUntilSunset = config.ui?.keep_background_on_until_sunset === true;
  const useDaylightOnBackground = keepOnUntilSunset && sun && !isUnavailable(sun) && sun.state === "above_horizon";
  const roomIsActive = devices.some((device) => device.countsAsRoomActive) || useDaylightOnBackground;
  const alertsConfig = config.sensors?.alerts;
  const customIcons = config.sensors?.icons ?? {};
  const resolveIcon = (key: string) => customIcons[key as keyof typeof customIcons] || CLIMATE_DEFAULT_ICONS[key] || "mdi:gauge";
  const climateAlerts = [
    evaluateClimateAlert("temperature", temp, alertsConfig?.temperature, "Temperature", resolveIcon("temperature")),
    evaluateClimateAlert("humidity", humidity, alertsConfig?.humidity, "Humidity", resolveIcon("humidity")),
    evaluateClimateAlert("co2", co2, alertsConfig?.co2, "CO2", resolveIcon("co2")),
    evaluateClimateAlert("voc", voc, alertsConfig?.voc, "VOC", resolveIcon("voc")),
    evaluateClimateAlert("pm25", pm25, alertsConfig?.pm25, "PM2.5", resolveIcon("pm25")),
    evaluateClimateAlert("aqi", aqi, alertsConfig?.aqi, "AQI", resolveIcon("aqi")),
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
    const value = Number(entity.state);
    if (!Number.isFinite(value)) return;
    const { min, max, eq } = sc.alert;
    if (
      (min !== undefined && value < min) ||
      (max !== undefined && value > max) ||
      (eq !== undefined && value === eq)
    ) {
      const unit = entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : "";
      climateAlertBadges.push({
        key: `custom_${i}`,
        icon: sc.icon || "mdi:gauge",
        messages: [`${sc.name}: ${entity.state}${unit}`],
      });
    }
  });
  const areaEntry = resolveAreaEntry(hassExt, config.room_id);
  const automationCount = config.ui?.automation_badge_enabled && areaEntry
    ? countEnabledRoomAutomations(hass, hassExt, config.room_id!)
    : 0;
  const badgeCounts = countHeaderBadges(devices, automationCount);

  return {
    devices,
    activeLightCount: devices.filter((d) => d.countsAsRoomActive).length,
    activeMediaCount: devices.filter((d) => d.countsAsMediaActive).length,
    activeRecCount: devices.filter((d) => d.countsAsRecActive).length,
    badgeCounts,
    hasAlert: deviceAlerts.some((d) => d.alertHeaderBorder) || climateAlerts.length > 0 || climateAlertBadges.some((b) => b.key.startsWith("custom_")),
    alertsByBadge,
    climateAlertBadges,
    alertReasons: [
      ...deviceAlerts.flatMap((device) =>
        device.alertMessages.length ? device.alertMessages : [`${device.label} alert`],
      ),
      ...climateAlerts.map((item) => item.reason),
    ],
    climateItems: buildClimateItems(
      { temp, humidity, co2, voc, pm25, aqi },
      customIcons,
      customSensorEntries.map(({ config: sc, entity }) => ({ name: sc.name, icon: sc.icon, entity })),
    ),
    climateEntities: getClimateEntities(config.sensors),
    areaIcon: areaEntry?.icon || "mdi:home-outline",
    roomBackground: normalizeAssetPath(
      roomIsActive
        ? config.ui?.images?.background_on
        : config.ui?.images?.background_off,
      "room",
    ),
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

function countEnabledRoomAutomations(
  hass: HomeAssistant,
  hassExt: HomeAssistantExtended,
  roomId: string,
): number {
  const normalized = roomId.trim();
  if (!normalized) return 0;
  const entityRegistry = hassExt.entities ?? {};
  return Object.values(hass.states).filter((entity) => {
    const [domain] = entity.entity_id.split(".");
    if (domain !== "automation") return false;
    if (isUnavailable(entity) || entity.state !== "on") return false;
    return entityRegistry[entity.entity_id]?.area_id === normalized;
  }).length;
}
