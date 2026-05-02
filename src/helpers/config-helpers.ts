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

export const buildRoomBackgroundImage = (path?: string, darken = false): string => {
  const topShadow = "linear-gradient(to bottom, rgba(0, 0, 0, 0.78) 0px, rgba(0, 0, 0, 0.56) 48px, rgba(0, 0, 0, 0.34) 112px, rgba(0, 0, 0, 0.12) 180px, rgba(0, 0, 0, 0) 240px)";
  if (!path) return topShadow;

  const layers = [topShadow];
  if (darken) {
    layers.push("linear-gradient(rgba(0, 0, 0, 0.48), rgba(0, 0, 0, 0.48))");
  }
  layers.push(`url("${path}")`);
  return layers.join(", ");
};

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
        : config.image
          ? config.image
          : isOn && config.image_on
            ? config.image_on
            : !isOn && config.image_off
              ? config.image_off
              : undefined,
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
