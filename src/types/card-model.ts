import type { ComputedDeviceModel, SmartRoomHeaderBadge } from "../helpers";

export interface AreaAutomation {
  name: string;
  enabled: boolean;
  lastTriggered?: string | null;
}

export interface RenderModel {
  devices: ComputedDeviceModel[];
  activeLightCount: number;
  activeMediaCount: number;
  activeRecCount: number;
  badgeCounts: Partial<Record<SmartRoomHeaderBadge, number>>;
  hasAlert: boolean;
  alertReasons: string[];
  alertsByBadge: Partial<Record<SmartRoomHeaderBadge, string[]>>;
  climateAlertBadges: ClimateAlertBadge[];
  climateItems: Array<{ key: string; icon: string; value: string; className: string }>;
  climateEntities: string[];
  areaAutomations: AreaAutomation[];
  roomBackground?: string;
  areaIcon?: string;
}

export interface ClimateAlert {
  key: "temperature" | "humidity" | "co2" | "voc" | "pm25" | "aqi" | "presence" | "noise";
  label: string;
  reason: string;
  icon: string;
}

export interface ClimateAlertBadge {
  key: string;
  icon: string;
  messages: string[];
}

export interface ImageFitStyle {
  width: string;
  height: string;
}
