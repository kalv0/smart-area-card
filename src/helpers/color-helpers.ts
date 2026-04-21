import type { SmartRoomPaletteColor } from "./types";

export const getPaletteColor = (color?: SmartRoomPaletteColor): string => {
  switch (color) {
    case "green":
      return "#34c759";
    case "red":
      return "#ff3b30";
    case "yellow":
      return "#ffd700";
    case "blue":
      return "#3b82f6";
    case "orange":
      return "#ff9f43";
    case "cyan":
      return "#4cc9f0";
    case "purple":
      return "#8b5cf6";
    case "gray":
      return "#94a3b8";
    case "white":
    default:
      return "rgba(255, 255, 255, 0.82)";
  }
};
