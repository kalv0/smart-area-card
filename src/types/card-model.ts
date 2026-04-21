import type { ComputedDeviceModel, SmartRoomHeaderBadge } from "../helpers";

export interface RenderModel {
  devices: ComputedDeviceModel[];
  activeLightCount: number;
  activeMediaCount: number;
  activeRecCount: number;
  badgeCounts: Partial<Record<SmartRoomHeaderBadge, number>>;
  hasAlert: boolean;
  alertReasons: string[];
  climateItems: Array<{ key: string; icon: string; value: string; className: string }>;
  climateEntities: string[];
  roomBackground?: string;
  areaIcon?: string;
}

export interface ClimateAlert {
  key: "temperature" | "humidity" | "co2" | "voc" | "pm25" | "aqi";
  label: string;
  reason: string;
}

export interface ImageFitStyle {
  width: string;
  height: string;
}
