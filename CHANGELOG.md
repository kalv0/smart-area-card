# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- GitHub Actions CI: typecheck + unit tests + build on every push and PR
- `warnOnInvalidConfig` — `console.warn` on invalid/incomplete config (unreplaced placeholders, missing `room_id` when automation badge enabled, offline with no conditions, etc.)
- Vitest unit test infrastructure — 95 tests across condition engine, config helpers, climate alerts, room model, preset engine, device builder

### Changed
- Extracted pure device-config transform functions from editor class to `src/editor/device-builder.ts` — independently testable, no LitElement dependency
- Named sensor alert interfaces: `SmartRoomNumericSensorAlert`, `SmartRoomPresenceSensorAlert` replacing inline object types
- `SmartRoomDeviceType` documented: kept as `string` alias for extensibility

### Fixed
- TypeScript strict errors in editor: sensor alert `.min`/`.max` union access narrowed via `SmartRoomNumericSensorAlert`; unsafe `device as Record<string, unknown>` cast corrected

### Removed
- Dead `DEVICE_TYPES` constant (defined but never used outside `types.ts`)
- Dead editor imports: `allowedMainEntitiesSummary`, `normalizeTypeDefaultDevice`

---

## [1.1.0] — Architecture refactor

### Added
- `AreaAutomation` interface and `areaAutomations: AreaAutomation[]` in `RenderModel`
- `SmartRoomClimateAlert.key` union now includes `"presence"` and `"noise"` (was missing)
- `storageKey(config, suffix)` — stable storage key using `room_id` over display `room` name
- `resolveStateTextFromEvaluated` — eliminates double condition evaluation per device per render
- `resolveAreaAutomationIds` — pre-filters automation IDs once; no full registry scan on every hass update
- `getAreaAutomations` — moved from card into `room-model.ts`, ordered enabled-first

### Fixed
- **BUG-01** Alert panels auto-clean stale dismissed keys when an alert resolves and re-triggers
- **BUG-02** Device `key` is now `"${index}:${entity_id}"` — no collision when two tiles share the same entity; `_executeAction` reads `device.config.entity` for service calls
- **BUG-05** `statusIconColor` uses `isAlert` as branch condition — alert color applies even when the alert has no icon

### Changed
- `createCardSignature` accepts pre-filtered `automationEntityIds[]` instead of full entity registry
- `mergePresetStates` / `mergePresetAlerts` match by `preset_source` identity only — index-based fallback removed (caused wrong defaults after YAML reorder)
- All localStorage keys migrated to `room_id`-based keys via `storageKey()`
- `_refreshRegistries` removed from editor `setConfig` — registry fetched once in `firstUpdated`

### Removed
- `automation_badge_tap_navigate` — was defined but never read at runtime

---

## [1.0.0] — Initial release

- Room overview card with climate sensors, device tiles, header badges, automation panel
- Visual Lovelace editor with preset device types: light, camera, media player, lock, custom
- Per-sensor climate alerts (temperature, humidity, CO₂, VOC, PM2.5, AQI, presence, noise)
- Alert panels with dismiss state persistence
- Drag-and-drop device reordering
- Battery level display and low-battery alerts
- Area-scoped entity pickers with device-class filtering
