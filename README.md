# smart-area-card

A professional Home Assistant Lovelace custom card that renders a room overview: climate sensors, device tiles with state/alert/offline logic, header badges, and automation panels.

Built with Lit 3 + TypeScript. No custom integration required — works entirely through the standard entity and area registry.

---

## Features

- **Device tiles** — configurable tap/hold actions, named states, alert badges, offline detection, battery levels
- **Climate panel** — temperature, humidity, CO₂, VOC, PM2.5, AQI, presence, noise sensors with per-sensor alerts
- **Header badges** — motion, window, door, lock, media, alert, automation, battery, and custom badge types
- **Automation panel** — expandable list of area automations with enabled/last-triggered state
- **Visual editor** — full YAML-free setup via the Lovelace UI editor with drag-and-drop device ordering
- **Preset system** — built-in type definitions for light, camera, media player, lock, custom

---

## Installation

Copy `dist/smart-area-card.js` to your Home Assistant `www/` folder and add the resource:

```yaml
resources:
  - url: /local/smart-area-card.js
    type: module
```

Then add the card to your dashboard via the UI or YAML.

---

## Development

### Requirements

- Node.js 22+
- npm 10+

### Setup

```sh
npm install --include=dev
```

### Scripts

| Command | Description |
|---|---|
| `npm run build` | Bundle to `dist/smart-area-card.js` |
| `npm run check` | TypeScript strict type check (no emit) |
| `npm run test:run` | Run all unit tests (Vitest) |
| `npm test` | Run tests in watch mode |

### Project structure

```
src/
├── smart-area-card.ts          # Card LitElement — rendering, hass integration
├── smart-area-card-editor.ts   # Editor LitElement — Lovelace visual editor
├── styles.ts                   # Card CSS
├── bundled-assets.ts           # Static asset imports (PNGs)
├── helpers/
│   ├── types.ts                # All public config interfaces
│   ├── conditions.ts           # Condition evaluation engine (eq/neq/gt/gte/lt/lte/in/not_in)
│   ├── device-model.ts         # ComputedDeviceModel: per-device state/alert/offline/battery logic
│   ├── room-model.ts           # RenderModel helpers: signatures, automations, climate alerts
│   ├── compute-render-model.ts # computeRenderModel() — assembles the full RenderModel
│   ├── config-helpers.ts       # storageKey, normalizeAssetPath, offline dim/strike helpers
│   ├── entity-helpers.ts       # resolveStateText, friendlyState, isUnavailable, getBatteryLevel
│   ├── color-helpers.ts        # getPaletteColor
│   ├── validate-config.ts      # warnOnInvalidConfig — console.warn on misconfiguration
│   └── index.ts                # Re-exports all helpers
├── editor/
│   ├── editor-types.ts         # SmartRoomTypeDefinition, field placeholders
│   ├── editor-constants.ts     # Operator labels, color options, badge options
│   ├── editor-styles.ts        # Editor CSS
│   ├── editor-utils.ts         # Pure UI utility functions
│   ├── builtin-types.ts        # BUILTIN_TYPE_DEFINITIONS (light, camera, lock, media, custom)
│   ├── preset-engine.ts        # materializeTypeDefinition, mergePresetStates/Alerts, sync* helpers
│   └── device-builder.ts       # Pure device config transforms (buildPreset, hydratePresetDefaults, …)
├── controllers/
│   ├── press-controller.ts     # Reactive tap/hold controller (420ms threshold)
│   └── image-fit-controller.ts # Image aspect-ratio cache
├── types/
│   ├── card-model.ts           # RenderModel, ComputedDeviceModel, ClimateAlert, AreaAutomation
│   └── ha-extensions.ts        # Extended HomeAssistant types (entity/device registry)
└── utils/
    └── clone.ts                # deepClone via structuredClone
```

### Architecture notes

- **Pure render model**: `computeRenderModel(config, hass, automationIds) → RenderModel` is a side-effect-free function. The card component calls it in `willUpdate` and renders from the result.
- **Signature-based render gating**: `createCardSignature` hashes all tracked entity states. `shouldUpdate` skips re-renders when nothing tracked has changed.
- **Preset system**: Device types define default configs with `field.*` placeholders. `materializeTypeDefinition` replaces them with real entity IDs. `mergePresetStates/Alerts` merges user overrides onto preset defaults using `preset_source` identity (not index).
- **Storage keys**: All localStorage keys use `room_id` (stable) over the display `room` name (mutable). Use `storageKey(config, suffix)` for all persistence.

### Testing

Tests live in `src/**/__tests__/`. Run with:

```sh
npm run test:run
```

Coverage: condition engine, config helpers, climate alerts, room model, preset engine, device builder (95 tests).

### CI

GitHub Actions runs on every push and PR to `main`:
1. `tsc --noEmit` — strict typecheck
2. `vitest run` — unit tests
3. `esbuild` — bundle

The compiled bundle is uploaded as a workflow artifact on `main` pushes.

---

## Contributing

1. Fork and create a feature branch
2. `npm install --include=dev`
3. Make changes — keep the build and tests clean: `npm run check && npm run test:run && npm run build`
4. Commit with a clear message following the existing convention (`feat:`, `fix:`, `refactor:`, `test:`, `ci:`)
5. Open a PR against `main`

**Do not touch:**
- The image system (`image_on`, `image_off`, background images, asset management) — strategy not yet defined
- The `double_tap_action` UI — kept in types for future use, not exposed in the editor

---

## License

MIT
