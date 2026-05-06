import { describe, expect, it } from "vitest";
import type { HomeAssistant } from "custom-card-helpers";
import type { HassEntity } from "home-assistant-js-websocket";
import { computeRenderModel } from "../compute-render-model";
import type { SmartRoomCardConfig } from "../types";

function makeEntity(entityId: string, state: string): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: {},
    last_changed: "",
    last_updated: "",
    context: { id: "" },
  } as HassEntity;
}

function makeHass(states: Record<string, HassEntity>): HomeAssistant {
  return { states } as unknown as HomeAssistant;
}

describe("computeRenderModel", () => {
  it("reuses unchanged device models when only another device entity changes", () => {
    const config: SmartRoomCardConfig = {
      type: "custom:smart-area-card",
      devices: [
        { entity: "light.a", type: "light" },
        { entity: "light.b", type: "light" },
      ],
    };

    const first = computeRenderModel(config, makeHass({
      "light.a": makeEntity("light.a", "off"),
      "light.b": makeEntity("light.b", "off"),
    }));
    const second = computeRenderModel(
      config,
      makeHass({
        "light.a": makeEntity("light.a", "on"),
        "light.b": makeEntity("light.b", "off"),
      }),
      [],
      { previous: first, changedEntityIds: new Set(["light.a"]) },
    );

    expect(second.devices[0]).not.toBe(first.devices[0]);
    expect(second.devices[1]).toBe(first.devices[1]);
  });
});
