import { resolveBundledAsset } from "../bundled-assets";
import type { SmartRoomDeviceConfig, SmartRoomNamedStateConfig, SmartRoomCardConfig } from "./types";

export const normalizeAssetPath = (
  path?: string,
  _kind: "product" | "room" = "product",
): string | undefined => {
  if (!path?.trim()) {
    return undefined;
  }

  const trimmed = path.trim();
  if (
    trimmed.startsWith("/local/")
    || trimmed.startsWith("http://")
    || trimmed.startsWith("https://")
    || trimmed.startsWith("data:")
  ) {
    return trimmed;
  }

  return resolveBundledAsset(trimmed) ?? trimmed;
};

export const buildRoomBackgroundImage = (path?: string): string =>
  path
    ? `linear-gradient(to bottom, rgba(0, 0, 0, 0.72) 0px, rgba(0, 0, 0, 0.3) 40px, rgba(0, 0, 0, 0) 80px), url("${path}")`
    : "linear-gradient(to bottom, rgba(0, 0, 0, 0.72) 0px, rgba(0, 0, 0, 0.3) 40px, rgba(0, 0, 0, 0) 80px)";

export const shouldDimOffline = (config: SmartRoomDeviceConfig): boolean =>
  config.offline?.enabled === true;

export const shouldStrikeOffline = (config: SmartRoomDeviceConfig): boolean =>
  config.offline?.strike === true;

export const offlineOpacity = (config: SmartRoomDeviceConfig): number =>
  config.offline?.dim_opacity ?? 0.5;

export const resolveDeviceImage = (
  config: SmartRoomDeviceConfig,
  isOn: boolean,
  matchedState?: SmartRoomNamedStateConfig,
  imageState?: SmartRoomNamedStateConfig,
): string | undefined =>
  normalizeAssetPath(
    matchedState?.image_active
      ? matchedState.image_active
      : !matchedState && imageState?.image_inactive
        ? imageState.image_inactive
        : isOn && config.image_on
          ? config.image_on
          : !isOn && config.image_off
            ? config.image_off
            : config.image,
    "product",
  );

/** Stable storage key for a card instance. Prefers room_id over display name. */
export const storageKey = (config: SmartRoomCardConfig, suffix: string): string => {
  const id = config.room_id?.trim() || config.room;
  return `smart-area:${id}:${suffix}`;
};

/** @deprecated Use storageKey(config, "expanded") instead. */
export const storageKeyForConfig = (config: SmartRoomCardConfig): string =>
  storageKey(config, "expanded");
