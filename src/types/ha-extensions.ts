import type { HomeAssistant } from "custom-card-helpers";

export interface EntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
}

export interface AreaRegistryEntry {
  name?: string;
  icon?: string;
}

export interface HomeAssistantExtended extends HomeAssistant {
  entities?: Record<string, EntityRegistryEntry>;
  areas?: Record<string, AreaRegistryEntry>;
}
