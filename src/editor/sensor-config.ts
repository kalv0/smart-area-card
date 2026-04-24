import type { SmartRoomCardConfig, SmartRoomCustomSensor } from "../helpers/types";

type Sensors = SmartRoomCardConfig["sensors"];
type SensorAlertKey = "temperature" | "humidity" | "co2" | "voc" | "pm25" | "aqi" | "presence" | "noise";
type SensorFilterKey = SensorAlertKey;
type AlertField = "enabled" | "min" | "max" | "eq";

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
  value: boolean | number | undefined,
): Sensors {
  const custom = [...(sensors?.custom ?? [])];
  custom[i] = { ...custom[i], alert: { ...(custom[i]?.alert ?? {}), [field]: value } };
  return { ...(sensors ?? {}), custom };
}
