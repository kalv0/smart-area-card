import { describe, it, expect } from "vitest";
import {
  patchSensor,
  patchSensorIcon,
  patchSensorFilter,
  patchSensorAlert,
  addCustomSensor,
  removeCustomSensor,
  updateCustomSensor,
  updateCustomSensorAlert,
} from "../sensor-config";
import type { SmartRoomCardConfig } from "../../helpers/types";

type Sensors = SmartRoomCardConfig["sensors"];

const base = (): Sensors => ({
  temperature: "sensor.temp",
  icons: { temperature: "mdi:thermometer" },
  filters: { temperature: { restrict_to_room_area: true } },
  alerts: { temperature: { enabled: true, min: 18, max: 26 } },
  custom: [{ name: "CO2", icon: "mdi:molecule-co2", entity: "sensor.co2" }],
});

// --- patchSensor ---

describe("patchSensor", () => {
  it("sets a sensor entity", () => {
    const result = patchSensor(base(), "humidity", "sensor.hum");
    expect(result?.humidity).toBe("sensor.hum");
  });

  it("removes sensor when value is empty string", () => {
    const result = patchSensor(base(), "temperature", "");
    expect(result?.temperature).toBeUndefined();
  });

  it("works on undefined sensors", () => {
    const result = patchSensor(undefined, "temperature", "sensor.temp");
    expect(result?.temperature).toBe("sensor.temp");
  });

  it("does not mutate input", () => {
    const sensors = base();
    patchSensor(sensors, "humidity", "sensor.hum");
    expect(sensors?.humidity).toBeUndefined();
  });
});

// --- patchSensorIcon ---

describe("patchSensorIcon", () => {
  it("sets an icon", () => {
    const result = patchSensorIcon(base(), "humidity", "mdi:water-percent");
    expect(result?.icons?.humidity).toBe("mdi:water-percent");
  });

  it("removes icon when value is empty string", () => {
    const result = patchSensorIcon(base(), "temperature", "");
    expect(result?.icons?.temperature).toBeUndefined();
  });

  it("preserves other icons", () => {
    const result = patchSensorIcon(base(), "humidity", "mdi:water-percent");
    expect(result?.icons?.temperature).toBe("mdi:thermometer");
  });

  it("works on undefined sensors", () => {
    const result = patchSensorIcon(undefined, "temperature", "mdi:thermometer");
    expect(result?.icons?.temperature).toBe("mdi:thermometer");
  });
});

// --- patchSensorFilter ---

describe("patchSensorFilter", () => {
  it("sets restrict_to_room_area on a known key", () => {
    const result = patchSensorFilter(base(), "humidity", "restrict_to_room_area", true);
    expect(result?.filters?.humidity?.restrict_to_room_area).toBe(true);
  });

  it("updates existing filter without touching others", () => {
    const result = patchSensorFilter(base(), "temperature", "restrict_to_room_area", false);
    expect(result?.filters?.temperature?.restrict_to_room_area).toBe(false);
  });

  it("works on undefined sensors", () => {
    const result = patchSensorFilter(undefined, "co2", "restrict_to_room_area", true);
    expect(result?.filters?.co2?.restrict_to_room_area).toBe(true);
  });
});

// --- patchSensorAlert ---

describe("patchSensorAlert", () => {
  it("sets an alert field", () => {
    const result = patchSensorAlert(base(), "temperature", "max", 30);
    expect(result?.alerts?.temperature?.max).toBe(30);
  });

  it("adds alert for a key that had none", () => {
    const result = patchSensorAlert(base(), "humidity", "enabled", true);
    expect(result?.alerts?.humidity?.enabled).toBe(true);
  });

  it("sets enabled to false", () => {
    const result = patchSensorAlert(base(), "temperature", "enabled", false);
    expect(result?.alerts?.temperature?.enabled).toBe(false);
  });

  it("preserves other alert fields", () => {
    const result = patchSensorAlert(base(), "temperature", "max", 30);
    expect(result?.alerts?.temperature?.min).toBe(18);
    expect(result?.alerts?.temperature?.enabled).toBe(true);
  });

  it("works on undefined sensors", () => {
    const result = patchSensorAlert(undefined, "co2", "min", 800);
    expect(result?.alerts?.co2?.min).toBe(800);
  });
});

// --- addCustomSensor ---

describe("addCustomSensor", () => {
  it("appends a blank custom sensor", () => {
    const result = addCustomSensor(base());
    expect(result?.custom).toHaveLength(2);
    expect(result?.custom?.[1]).toEqual({ name: "", icon: "mdi:gauge", entity: "" });
  });

  it("works on undefined sensors", () => {
    const result = addCustomSensor(undefined);
    expect(result?.custom).toHaveLength(1);
  });

  it("does not mutate input array", () => {
    const sensors = base();
    addCustomSensor(sensors);
    expect(sensors?.custom).toHaveLength(1);
  });
});

// --- removeCustomSensor ---

describe("removeCustomSensor", () => {
  it("removes the sensor at given index", () => {
    const sensors: Sensors = { custom: [{ name: "A", entity: "sensor.a" }, { name: "B", entity: "sensor.b" }] };
    const result = removeCustomSensor(sensors, 0);
    expect(result?.custom).toHaveLength(1);
    expect(result?.custom?.[0]?.name).toBe("B");
  });

  it("works on undefined sensors (no-op)", () => {
    const result = removeCustomSensor(undefined, 0);
    expect(result?.custom).toHaveLength(0);
  });
});

// --- updateCustomSensor ---

describe("updateCustomSensor", () => {
  it("patches fields on the sensor at given index", () => {
    const result = updateCustomSensor(base(), 0, { name: "CO2 Updated", icon: "mdi:fire" });
    expect(result?.custom?.[0]?.name).toBe("CO2 Updated");
    expect(result?.custom?.[0]?.icon).toBe("mdi:fire");
    expect(result?.custom?.[0]?.entity).toBe("sensor.co2");
  });

  it("does not mutate the input array", () => {
    const sensors = base();
    updateCustomSensor(sensors, 0, { name: "Changed" });
    expect(sensors?.custom?.[0]?.name).toBe("CO2");
  });
});

// --- updateCustomSensorAlert ---

describe("updateCustomSensorAlert", () => {
  it("sets an alert field on the custom sensor", () => {
    const result = updateCustomSensorAlert(base(), 0, "min", 400);
    expect(result?.custom?.[0]?.alert?.min).toBe(400);
  });

  it("sets enabled", () => {
    const result = updateCustomSensorAlert(base(), 0, "enabled", true);
    expect(result?.custom?.[0]?.alert?.enabled).toBe(true);
  });

  it("preserves existing alert fields", () => {
    const sensors: Sensors = { custom: [{ name: "A", entity: "sensor.a", alert: { enabled: true, min: 100 } }] };
    const result = updateCustomSensorAlert(sensors, 0, "max", 500);
    expect(result?.custom?.[0]?.alert?.min).toBe(100);
    expect(result?.custom?.[0]?.alert?.max).toBe(500);
  });
});
