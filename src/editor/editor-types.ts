import type { SmartRoomDeviceConfig } from "../helpers";

export interface SmartRoomTypeExtraField {
  key: string;
  label: string;
  hint: string;
  selector_domains?: string[];
}

export interface SmartRoomTypeDefinition {
  id: string;
  label: string;
  icon?: string;
  editor_color: string;
  entity_required: boolean;
  allowed_main_entities?: string[];
  restrict_to_room_area?: boolean;
  extra_fields?: SmartRoomTypeExtraField[];
  default_device: SmartRoomDeviceConfig;
}

export const DEVICE_ENTITY_PLACEHOLDER = "field.device";
export const EXTRA_FIELD_PLACEHOLDERS: Record<string, string> = {
  privacy: "field.privacy",
  battery: "field.battery",
};
