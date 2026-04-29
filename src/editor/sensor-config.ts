import type { SmartRoomCardConfig, SmartRoomCustomSensor } from "../helpers/types";

type Sensors = SmartRoomCardConfig["sensors"];
type SensorAlertKey = "temperature" | "humidity" | "co2" | "voc" | "pm25" | "pm10" | "aqi" | "presence" | "noise" | "illuminance" | "power" | "energy" | "carbon_monoxide" | "radon" | "moisture";
type SensorFilterKey = SensorAlertKey;
type AlertField = "enabled" | "min" | "max" | "eq" | "neq" | "text_eq" | "text_neq";

export const DEFAULT_SENSOR_ORDER: string[] = ["temperature", "humidity", "presence", "co2", "illuminance", "voc", "pm25", "pm10", "aqi", "noise", "power", "energy", "carbon_monoxide", "radon", "moisture"];

export function getNormalizedSensorOrder(sensors: Sensors, customCount = 0): string[] {
  const stored = sensors?.sensor_order ?? [];
  const result = [...stored];
  for (const key of DEFAULT_SENSOR_ORDER) {
    if (!result.includes(key)) result.push(key);
  }
  for (let i = 0; i < customCount; i++) {
    const key = `custom_${i}`;
    if (!result.includes(key)) result.push(key);
  }
  return result;
}

export function moveSensorInOrder(sensors: Sensors, idx: number, dir: -1 | 1, customCount = 0): Sensors {
  const order = getNormalizedSensorOrder(sensors, customCount);
  const nextIdx = idx + dir;
  if (nextIdx < 0 || nextIdx >= order.length) return sensors ?? {};
  const next = [...order];
  [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
  return { ...(sensors ?? {}), sensor_order: next };
}

export function reorderSensorsInOrder(sensors: Sensors, fromIdx: number, toIdx: number, customCount = 0): Sensors {
  if (fromIdx === toIdx) return sensors ?? {};
  const order = getNormalizedSensorOrder(sensors, customCount);
  const next = [...order];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return { ...(sensors ?? {}), sensor_order: next };
}

export function bubbleSensorAboveEmpty(sensors: Sensors, key: string): Sensors {
  const hasEntity = (k: string): boolean => {
    if (k.startsWith("custom_")) {
      const i = Number(k.slice(7));
      return Boolean(sensors?.custom?.[i]?.entity);
    }
    return Boolean((sensors as Record<string, unknown>)?.[k]);
  };

  const customCount = sensors?.custom?.length ?? 0;
  const order = getNormalizedSensorOrder(sensors, customCount);
  const currentIdx = order.indexOf(key);
  if (currentIdx < 0) return sensors ?? {};

  let insertAt = 0;
  for (let i = 0; i < order.length; i++) {
    if (i === currentIdx) continue;
    if (hasEntity(order[i])) insertAt = i + 1;
  }

  if (insertAt > currentIdx) insertAt = currentIdx;
  if (insertAt === currentIdx) return sensors ?? {};

  const next = [...order];
  next.splice(currentIdx, 1);
  next.splice(insertAt, 0, key);
  return { ...(sensors ?? {}), sensor_order: next };
}

export function sinkSensorBelowFilled(sensors: Sensors, key: string): Sensors {
  const hasEntity = (k: string): boolean => {
    if (k === key) return false;
    if (k.startsWith("custom_")) {
      const i = Number(k.slice(7));
      return Boolean(sensors?.custom?.[i]?.entity);
    }
    return Boolean((sensors as Record<string, unknown>)?.[k]);
  };

  const customCount = sensors?.custom?.length ?? 0;
  const order = getNormalizedSensorOrder(sensors, customCount);
  const currentIdx = order.indexOf(key);
  if (currentIdx < 0) return sensors ?? {};

  let lastFilledIdx = -1;
  for (let i = 0; i < order.length; i++) {
    if (i === currentIdx) continue;
    if (hasEntity(order[i])) lastFilledIdx = i;
  }

  const insertAt = lastFilledIdx + 1;
  if (currentIdx >= insertAt) return sensors ?? {};

  const next = [...order];
  next.splice(currentIdx, 1);
  next.splice(insertAt - 1, 0, key);
  return { ...(sensors ?? {}), sensor_order: next };
}

export function patchSensor(sensors: Sensors, key: string, value: string): Sensors {
  return { ...(sensors ?? {}), [key]: value || undefined };
}

export function patchSensorIcon(sensors: Sensors, key: string, value: string): Sensors {
  return { ...(sensors ?? {}), icons: { ...(sensors?.icons ?? {}), [key]: value || undefined } };
}

export function patchSensorFilter(
  sensors: Sensors,
  key: SensorFilterKey,
  field: "restrict_to_room_area",
  value: boolean,
): Sensors {
  return {
    ...(sensors ?? {}),
    filters: {
      ...(sensors?.filters ?? {}),
      [key]: { ...(sensors?.filters?.[key] ?? {}), [field]: value },
    },
  };
}

export function patchSensorAlert(
  sensors: Sensors,
  key: SensorAlertKey,
  field: AlertField,
  value: boolean | number | string | undefined,
): Sensors {
  return {
    ...(sensors ?? {}),
    alerts: {
      ...(sensors?.alerts ?? {}),
      [key]: { ...(sensors?.alerts?.[key] ?? {}), [field]: value },
    },
  };
}

export function addCustomSensor(sensors: Sensors): Sensors {
  return {
    ...(sensors ?? {}),
    custom: [...(sensors?.custom ?? []), { name: "", icon: "mdi:gauge", entity: "" }],
  };
}

export function removeCustomSensor(sensors: Sensors, i: number): Sensors {
  return {
    ...(sensors ?? {}),
    custom: (sensors?.custom ?? []).filter((_, idx) => idx !== i),
  };
}

export function updateCustomSensor(sensors: Sensors, i: number, patch: Partial<SmartRoomCustomSensor>): Sensors {
  const custom = [...(sensors?.custom ?? [])];
  custom[i] = { ...custom[i], ...patch };
  return { ...(sensors ?? {}), custom };
}

export function updateCustomSensorAlert(
  sensors: Sensors,
  i: number,
  field: AlertField,
  value: boolean | number | string | undefined,
): Sensors {
  const custom = [...(sensors?.custom ?? [])];
  custom[i] = { ...custom[i], alert: { ...(custom[i]?.alert ?? {}), [field]: value } };
  return { ...(sensors ?? {}), custom };
}
