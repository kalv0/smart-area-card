import cameraDefault from "./assets/camera_default.png";
import customDefault from "./assets/custom_default.png";
import lightOff from "./assets/light_off.png";
import lightOn from "./assets/light_on.png";
import lockDefault from "./assets/lock_default.png";
import mediaPlayerDefault from "./assets/media_player_default.png";

export const BUNDLED_ASSET_MAP: Record<string, string> = {
  "camera_default.png": cameraDefault,
  "custom_default.png": customDefault,
  "light_off.png": lightOff,
  "light_on.png": lightOn,
  "lock_default.png": lockDefault,
  "media_player_default.png": mediaPlayerDefault,
};

export const resolveBundledAsset = (path?: string): string | undefined => {
  const trimmed = path?.trim();
  if (!trimmed) return undefined;
  return BUNDLED_ASSET_MAP[trimmed];
};
