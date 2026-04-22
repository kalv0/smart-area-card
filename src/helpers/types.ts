export type SmartRoomDeviceType = string;

export type SmartRoomActionType = "button" | "more-info" | "custom" | "none";
export type SmartRoomPopupSize = "normal" | "wide" | "fullscreen";
export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in";

export interface ConditionConfig {
  entity: string;
  operator: ConditionOperator;
  value: string | number | Array<string | number>;
  restrict_to_room_area?: boolean;
  selector_domains?: string[];
}

export interface SmartRoomEntitySelectorOverride {
  restrict_to_room_area?: boolean;
  domains?: string[];
}

export interface PopupConfig {
  title?: string;
  size?: SmartRoomPopupSize;
  card?: Record<string, unknown>;
  content?: Record<string, unknown>;
}

export interface SmartRoomActionConfig {
  action?: SmartRoomActionType;
  entity?: string;
  service?: string;
  data?: Record<string, unknown>;
  popup?: PopupConfig;
  preset?: boolean;
}

export interface SmartRoomOfflineConfig {
  enabled?: boolean;
  strike?: boolean;
  dim_opacity?: number;
  conditions?: ConditionConfig[];
  header_badge?: SmartRoomHeaderBadge;
}

export interface SmartRoomStateConfig {
  on_conditions?: ConditionConfig[];
  alert_conditions?: ConditionConfig[];
  states?: SmartRoomNamedStateConfig[];
  alerts?: SmartRoomNamedAlertConfig[];
}

export interface SmartRoomNamedAlertConfig {
  name?: string;
  enabled?: boolean;
  message?: string;
  conditions?: ConditionConfig[];
  preset?: boolean;
  preset_source?: "type" | "battery";
  outlined?: boolean;
  border_color?: SmartRoomPaletteColor;
  icon?: string;
  icon_color?: SmartRoomPaletteColor;
  header_badge?: SmartRoomHeaderBadge;
  header_border?: boolean;
}

export interface SmartRoomNamedStateConfig {
  name?: string;
  enabled?: boolean;
  text?: string;
  text_entity?: string;
  text_active?: string;
  text_entity_active?: string;
  text_inactive?: string;
  text_entity_inactive?: string;
  outlined?: boolean;
  border_color?: SmartRoomPaletteColor;
  icon_active?: string;
  icon_inactive?: string;
  icon_active_color?: SmartRoomPaletteColor;
  icon_inactive_color?: SmartRoomPaletteColor;
  image_active?: string;
  image_inactive?: string;
  conditions?: ConditionConfig[];
  count_light?: boolean;
  count_media?: boolean;
  count_rec?: boolean;
  header_badge?: SmartRoomHeaderBadge;
  header_badge_active?: SmartRoomHeaderBadge;
  header_badge_inactive?: SmartRoomHeaderBadge;
  preset?: boolean;
  preset_source?: "type" | "camera_privacy" | "camera_live" | "offline";
}

export type SmartRoomHeaderBadge =
  | "none"
  | "alert_generic"
  | "light"
  | "playing"
  | "rec"
  | "door_open"
  | "door_closed"
  | "lock_open"
  | "lock_closed"
  | "presence"
  | "fire"
  | "water"
  | "plug_off"
  | "low_battery"
  | "automation";

export type SmartRoomPaletteColor =
  | "white"
  | "green"
  | "red"
  | "yellow"
  | "blue"
  | "orange"
  | "cyan"
  | "purple"
  | "gray";

export interface SmartRoomDeviceConfig {
  entity: string;
  type?: SmartRoomDeviceType;
  restrict_to_room_area?: boolean;
  entity_selectors?: Record<string, SmartRoomEntitySelectorOverride>;
  name?: string;
  icon?: string;
  image?: string;
  image_on?: string;
  image_off?: string;
  battery?: string;
  show_battery?: boolean;
  battery_alert_enabled?: boolean;
  privacy?: string;
  variables?: Record<string, string>;
  offline?: SmartRoomOfflineConfig;
  states?: SmartRoomStateConfig;
  tap_action?: SmartRoomActionConfig;
  hold_action?: SmartRoomActionConfig;
  double_tap_action?: SmartRoomActionConfig;
}

export interface SmartRoomCardConfig {
  type: string;
  room: string;
  room_id?: string;
  devices?: SmartRoomDeviceConfig[];
  sensors?: {
    temperature?: string;
    humidity?: string;
    co2?: string;
    voc?: string;
    pm25?: string;
    aqi?: string;
    filters?: {
      temperature?: { restrict_to_room_area?: boolean };
      humidity?: { restrict_to_room_area?: boolean };
      co2?: { restrict_to_room_area?: boolean };
      voc?: { restrict_to_room_area?: boolean };
      pm25?: { restrict_to_room_area?: boolean };
      aqi?: { restrict_to_room_area?: boolean };
    };
    alerts?: {
      temperature?: { enabled?: boolean; min?: number; max?: number };
      humidity?: { enabled?: boolean; min?: number; max?: number };
      co2?: { enabled?: boolean; min?: number; max?: number };
      voc?: { enabled?: boolean; min?: number; max?: number };
      pm25?: { enabled?: boolean; min?: number; max?: number };
      aqi?: { enabled?: boolean; min?: number; max?: number };
    };
  };
  ui?: {
    blur?: boolean;
    glassmorphism?: boolean;
    battery_threshold?: number;
    header_climate_more_info?: boolean;
    show_entity_icons?: boolean;
    show_area_icon?: boolean;
    keep_background_on_until_sunset?: boolean;
    automation_badge_enabled?: boolean;
    automation_badge_tap_navigate?: boolean;
    battery_alerts_enabled?: boolean;
    battery_alert_outlined?: boolean;
    battery_alert_border_color?: SmartRoomPaletteColor;
    battery_alert_header_badge?: SmartRoomHeaderBadge;
    battery_alert_header_border?: boolean;
    colors?: {
      active?: string;
      alert?: string;
      surface?: string;
      text?: string;
      muted?: string;
      camera?: string;
    };
    images?: {
      background_on?: string;
      background_off?: string;
    };
  };
  expander?: {
    enabled?: boolean;
    persist_state?: boolean;
    initial_state?: "closed" | "open" | "conditional";
    condition?: ConditionConfig;
  };
}

export const DEVICE_TYPES: SmartRoomDeviceType[] = [
  "light",
  "camera",
  "media_player",
  "lock",
  "custom",
];

export const UNAVAILABLE_STATES = new Set(["unavailable", "unknown"]);
