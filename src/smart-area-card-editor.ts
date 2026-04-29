import { LitElement, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { property, state } from "lit/decorators.js";
import { fireEvent, type HomeAssistant } from "custom-card-helpers";
import { parse } from "yaml";
import { deepClone } from "./utils/clone";
import { calvoRoomCardEditorStyles } from "./editor/editor-styles";
import type {
  ConditionConfig,
  SmartRoomActionConfig,
  SmartRoomCardConfig,
  SmartRoomDeviceConfig,
  SmartRoomDeviceType,
  SmartRoomEntitySelectorOverride,
  SmartRoomHeaderBadge,
  SmartRoomNamedAlertConfig,
  SmartRoomNamedStateConfig,
  SmartRoomNumericSensorAlert,
} from "./helpers";
import type { HomeAssistantExtended, EntityRegistryEntry, DeviceRegistryEntry } from "./types/ha-extensions";
import type { SmartRoomTypeDefinition } from "./editor/editor-types";
import { DEVICE_ENTITY_PLACEHOLDER, EXTRA_FIELD_PLACEHOLDERS } from "./editor/editor-types";
import { BUILTIN_TYPE_DEFINITIONS } from "./editor/builtin-types";
import { INITIAL_STATES, OPERATORS, COLOR_OPTIONS, HEADER_BADGE_OPTIONS, ALERT_HEADER_BADGE_OPTIONS } from "./editor/editor-constants";
import { foregroundFor, conditionValueToText, parseConditionValue, toNumberOrUndefined, valueFromEvent } from "./editor/editor-utils";
import { syncActionEntity, syncOfflinePreset, syncStatePreset } from "./editor/preset-engine";
import { definitionForType, isEntityRequired, allowedMainEntities, buildPreset, applyDerivedBatteryAlertWithUi, applyTypePreset, hydratePresetDefaults, syncDeviceWithEntity, buildResolvedPresetDevice } from "./editor/device-builder";
import { normalizeDomains, areaEntityIds, areaEntityIdsFiltered, buildEntitySelector, buildEntitySelectorFiltered } from "./editor/registry-helpers";
import { patchSensor, patchSensorIcon, patchSensorFilter, patchSensorAlert, addCustomSensor, removeCustomSensor, updateCustomSensor, updateCustomSensorAlert, getNormalizedSensorOrder, moveSensorInOrder, reorderSensorsInOrder, bubbleSensorAboveEmpty, sinkSensorBelowFilled } from "./editor/sensor-config";
import { addNamedState, removeNamedState, updateNamedState, resetPresetState, resetPresetAlert, resetPresetOffline, addNamedAlert, removeNamedAlert, updateNamedAlert } from "./editor/named-item-config";

const SENSOR_DEVICE_CLASSES: Partial<Record<string, string[]>> = {
  temperature: ["temperature"],
  humidity: ["humidity"],
  co2: ["carbon_dioxide"],
  voc: ["volatile_organic_compounds"],
  pm25: ["pm25"],
  pm10: ["pm10"],
  aqi: ["aqi"],
  noise: ["sound_pressure"],
  presence: ["presence", "motion", "occupancy", "moving"],
  illuminance: ["illuminance"],
  power: ["power"],
  energy: ["energy"],
  carbon_monoxide: ["carbon_monoxide"],
  radon: ["radon"],
  moisture: ["moisture"],
};

const SENSOR_ACCENT: Record<string, string> = {
  temperature: "#f59e0b",
  humidity: "#3b82f6",
  presence: "#f97316",
  co2: "#10b981",
  illuminance: "#eab308",
  voc: "#8b5cf6",
  pm25: "#ec4899",
  pm10: "#db2777",
  aqi: "#14b8a6",
  noise: "#64748b",
  power: "#fb923c",
  energy: "#16a34a",
  carbon_monoxide: "#dc2626",
  radon: "#7c3aed",
  moisture: "#0ea5e9",
};

const CUSTOM_SENSOR_COLORS = ["#6366f1", "#22d3ee", "#f43f5e", "#84cc16", "#d946ef", "#fb923c", "#2dd4bf", "#a78bfa"];

export class SmartAreaCardEditor extends LitElement {
  static styles = calvoRoomCardEditorStyles;

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SmartRoomCardConfig;
  @state() private _expandedDevices: number[] = [];
  @state() private _advancedDevices: number[] = [];
  @state() private _dragIndex?: number;
  @state() private _dropIndex?: number;
  @state() private _sensorDragIndex?: number;
  @state() private _sensorDropIndex?: number;
  @state() private _showAddTypePicker = false;
  @state() private _showAdvancedCardSetup = false;
  @state() private _showAdvancedBattery = false;
  @state() private _showMoreSensors = false;
  @state() private _entityRegistry: EntityRegistryEntry[] = [];
  @state() private _deviceRegistry: DeviceRegistryEntry[] = [];
  @state() private _bgPreviewValid = false;
  @state() private _bgPreviewError = false;
  @state() private _cardSetupCollapsed = false;
  @state() private _headerCollapsed = false;

  private readonly _typeDefinitions: SmartRoomTypeDefinition[] = [...BUILTIN_TYPE_DEFINITIONS];
  private _touchDragPointerId?: number;
  private _touchSensorDragPointerId?: number;
  private _sectionsInitialized = false;

  protected firstUpdated(): void {
    this._refreshRegistries();
  }

  public setConfig(config: SmartRoomCardConfig): void {
    const fallback: SmartRoomCardConfig = { type: "custom:smart-area-card", room: "", room_id: "", devices: [], sensors: { alerts: {} }, ui: { header_climate_more_info: true, battery_threshold: 20, battery_alerts_enabled: true, show_entity_icons: false, show_area_icon: false, keep_background_on_until_sunset: false, automation_badge_enabled: false }, expander: { enabled: true, initial_state: "closed", persist_state: true } };
    try {
      const clone = deepClone(config);
      const nextConfig: SmartRoomCardConfig = { ...fallback, ...clone, ui: { ...fallback.ui, ...(clone.ui ?? {}) }, expander: { ...fallback.expander, ...(clone.expander ?? {}) } };
      nextConfig.devices = (nextConfig.devices ?? []).map((device) => this._hydratePresetDefaults(device));
      this._config = nextConfig;
    } catch {
      this._config = fallback;
    }
    const deviceCount = this._config?.devices?.length ?? 0;
    this._expandedDevices = this._expandedDevices.filter((index) => index < deviceCount);
    if (!this._sectionsInitialized) {
      this._sectionsInitialized = true;
      const hasDevices = deviceCount > 0;
      this._cardSetupCollapsed = hasDevices;
      this._headerCollapsed = hasDevices;
    }
    // Registry is loaded once in firstUpdated. Do not re-fetch on every config change.
  }

  protected render() {
    try {
      const config = this._config;
      if (!config) return nothing;
      const hasArea = this._isRoomIdValid(config.room_id);
      const areaName = this._areaName(config.room_id);
      const roomNameEmpty = hasArea && !(config.room ?? areaName ?? "").trim();
      const canShowAll = hasArea && !roomNameEmpty;
      return html`<div class="editor-shell"><div class="stack">
        ${this._renderGeneral(config, hasArea)}
        ${hasArea ? this._renderHeaderSection(config, roomNameEmpty) : nothing}
        ${canShowAll ? this._renderDevices(config) : nothing}
      </div></div>`;
    } catch {
      return html`<div class="section"><div class="section-title">Editor fallback</div><div class="section-subtitle">The visual editor recovered from an invalid configuration state.</div></div>`;
    }
  }

  private _isDeviceAdvanced(index: number): boolean {
    return this._advancedDevices.includes(index);
  }

  private _setDeviceAdvanced(index: number, advanced: boolean): void {
    this._advancedDevices = advanced
      ? [...new Set([...this._advancedDevices, index])]
      : this._advancedDevices.filter((item) => item !== index);
  }

  private _toneClass(type?: string): string {
    return `panel-type-${type ?? "custom"}`;
  }

  private _typeRestrictsToRoomArea(type?: SmartRoomDeviceType): boolean {
    return this._definitionForType(type ?? "custom").restrict_to_room_area ?? false;
  }

  private _deviceRestrictsToRoomArea(device: SmartRoomDeviceConfig): boolean {
    return device.restrict_to_room_area ?? this._typeRestrictsToRoomArea(device.type);
  }

  /* ─── Reusable required / validation helpers ─────────────────────── */

  private _reqBadge() {
    return html`<span class="req-badge">Required</span>`;
  }

  private _reqError(msg: string, autofillLabel?: string, onAutofill?: () => void) {
    return html`<div class="req-error">${msg}${autofillLabel ? html`<button type="button" class="req-autofill-btn" @click=${onAutofill}>${autofillLabel}</button>` : nothing}</div>`;
  }

  /* ──────────────────────────────────────────────────────────────────── */

  private _renderGeneral(config: SmartRoomCardConfig, hasArea: boolean) {
    const areaName = this._areaName(config.room_id);
    const images = config.ui?.images ?? {};
    const darkEnabled = images.dark_mode_enabled !== false;
    const darkCond = images.dark_mode_condition ?? "always";
    const bgOn = images.background_on ?? "";

    return html`
      <section class="section">
        <div class="section-header ${this._cardSetupCollapsed ? "section-header--collapsed" : ""}"
             @click=${() => { if (this._cardSetupCollapsed) this._cardSetupCollapsed = false; }}>
          <div>
            <div class="section-title">Card setup</div>
            <div class="section-subtitle">Area, background and card behaviour.</div>
          </div>
          <button class="section-collapse-btn" @click=${(e: Event) => { e.stopPropagation(); this._cardSetupCollapsed = !this._cardSetupCollapsed; }}>
            <ha-icon icon=${this._cardSetupCollapsed ? "mdi:chevron-down" : "mdi:chevron-up"}></ha-icon>
          </button>
        </div>
        <div class="section-collapsible ${this._cardSetupCollapsed ? "section-collapsible--collapsed" : ""}">
        <div class="section-collapsible-inner">

        <div class="area-picker-block">
          <div class="area-picker-label req-label ${hasArea ? "" : "req-label--invalid"}">
            Area${!hasArea ? this._reqBadge() : nothing}
          </div>
          <ha-area-picker
            class=${!hasArea ? "req-outline" : ""}
            .hass=${this.hass}
            .value=${config.room_id ?? ""}
            @value-changed=${(e: CustomEvent) => this._setAreaId(String(e.detail?.value ?? ""))}
          ></ha-area-picker>
        </div>

        ${!hasArea ? nothing : html`

        <div class="panel">
          <div class="panel-title">Background</div>
          <div class="row single">
            <label>
              Area image
              <span class="hint">We recommend a horizontal photo of the nicest corner of ${areaName || "your area"}.</span>
              <input type="text" .value=${bgOn} placeholder="/local/img/areas/bedroom.png"
                @input=${(e: InputEvent) => {
                  const val = valueFromEvent(e);
                  this._bgPreviewValid = false;
                  this._bgPreviewError = false;
                  if (val && !bgOn && images.dark_mode_enabled === undefined) {
                    this._setImageKey("dark_mode_enabled", true);
                  }
                  this._setRoomImage("background_on", val);
                }}
              />
            </label>
          </div>
          ${bgOn && this._bgPreviewError ? this._reqError("Image not valid or not found.") : nothing}
          ${bgOn ? html`
            <div class="bg-preview bg-preview--${darkEnabled ? "split" : "banner"}"
                 style=${this._bgPreviewValid ? "" : "display:none"}>
              <img class="bg-preview-img" src=${bgOn} alt=""
                @load=${() => { this._bgPreviewValid = true; this._bgPreviewError = false; }}
                @error=${() => { this._bgPreviewValid = false; this._bgPreviewError = true; }}
              />
              ${darkEnabled ? html`
                <img class="bg-preview-img bg-preview-img--dark" src=${bgOn} alt="" />
                <span class="bg-preview-tag bg-preview-tag--left">ON</span>
                <span class="bg-preview-tag bg-preview-tag--right">OFF</span>
              ` : nothing}
            </div>
            ${!this._bgPreviewValid ? html`
              <img style="display:none;position:absolute" src=${bgOn} alt=""
                @load=${() => { this._bgPreviewValid = true; this._bgPreviewError = false; }}
              />
            ` : nothing}
          ` : nothing}
          ${this._bgPreviewValid ? html`
            <div class="row single">
              ${this._renderToggleField("Dark version when lights are off", "Applies a dark filter to the same image when all devices are inactive.", darkEnabled, (checked) => this._setImageKey("dark_mode_enabled", checked))}
            </div>
            ${darkEnabled ? html`
              <div class="row single">
                <label>Switch to dark when
                  <select .value=${darkCond} @change=${(e: Event) => this._setImageKey("dark_mode_condition", valueFromEvent(e))}>
                    <option value="always">Always (devices off)</option>
                    <option value="daytime">Daytime (devices off + sun above horizon)</option>
                    <option value="lux">Lux sensor below threshold</option>
                  </select>
                </label>
              </div>
              ${darkCond === "lux" ? html`
                <div class="row single">
                  <label>Lux sensor</label>
                  <ha-selector .hass=${this.hass}
                    .selector=${{ entity: { domain: "sensor", device_class: "illuminance" } }}
                    .value=${images.dark_mode_lux_entity ?? ""}
                    @value-changed=${(e: CustomEvent) => this._setImageKey("dark_mode_lux_entity", e.detail?.value || undefined)}
                  ></ha-selector>
                </div>
                <div class="row single">
                  <label>Threshold (lux)
                    <input type="number" min="0"
                      .value=${String(images.dark_mode_lux_threshold ?? 50)}
                      @input=${(e: InputEvent) => this._setImageKey("dark_mode_lux_threshold", Number(valueFromEvent(e)) || undefined)}
                    />
                  </label>
                </div>
              ` : nothing}
            ` : nothing}
          ` : nothing}
        </div>

        <div class="panel">
          <div class="panel-title">Expanded state</div>
          <div class="row single">
            <label>Default state
              <select .value=${config.expander?.initial_state === "open" ? "open" : "closed"}
                      @change=${(e: Event) => this._setExpander("initial_state", valueFromEvent(e))}>
                <option value="closed">Closed</option>
                <option value="open">Open</option>
              </select>
            </label>
          </div>
          <div class="row single">
            ${this._renderCompactCheckField("Remember state", "Restores the last open or closed state from the browser.", config.expander?.persist_state ?? true, (checked) => this._setExpander("persist_state", checked))}
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">Battery alerts</div>
          <div class="row single">
            <label>Threshold %
              <span class="hint">Alert fires when battery level falls below this value.</span>
              <input type="number" min="0" max="100"
                .value=${String(config.ui?.battery_threshold ?? 20)}
                @input=${(e: InputEvent) => this._setUi("battery_threshold", Number(valueFromEvent(e)))}
              />
            </label>
          </div>
        </div>

        <div class="row single">
          <button type="button" class="autofill-button autofill-button--full" ?disabled=${!hasArea} @click=${this._handleRoomAutofill}>Autofill devices from area</button>
        </div>

        `}
        </div></div>
      </section>
    `;
  }

  private _renderSensors(config: SmartRoomCardConfig) {
    const customSensors = config.sensors?.custom ?? [];
    const customCount = customSensors.length;
    const sensorOrder = getNormalizedSensorOrder(config.sensors, customCount);

    const PRESET_META: Record<string, { label: string; icon: string; domains: string[] }> = {
      temperature:    { label: "Temperature", icon: "mdi:thermometer",    domains: ["sensor"] },
      humidity:       { label: "Humidity",    icon: "mdi:water-percent",  domains: ["sensor"] },
      presence:       { label: "Presence",    icon: "mdi:motion-sensor",  domains: ["binary_sensor", "sensor"] },
      co2:            { label: "CO₂",         icon: "mdi:molecule-co2",   domains: ["sensor"] },
      illuminance:    { label: "Illuminance", icon: "mdi:brightness-5",   domains: ["sensor"] },
      voc:            { label: "VOC",         icon: "mdi:flask-outline",  domains: ["sensor"] },
      pm25:           { label: "PM2.5",       icon: "mdi:blur",           domains: ["sensor"] },
      pm10:           { label: "PM10",        icon: "mdi:blur-linear",    domains: ["sensor"] },
      aqi:            { label: "AQI",         icon: "mdi:gauge",          domains: ["sensor"] },
      noise:          { label: "Noise",       icon: "mdi:volume-high",    domains: ["sensor"] },
      power:          { label: "Power",       icon: "mdi:lightning-bolt", domains: ["sensor"] },
      energy:         { label: "Energy",      icon: "mdi:flash",          domains: ["sensor"] },
      carbon_monoxide:{ label: "CO",          icon: "mdi:molecule-co",    domains: ["sensor"] },
      radon:          { label: "Radon",       icon: "mdi:radioactive",    domains: ["sensor"] },
      moisture:       { label: "Moisture",    icon: "mdi:water-alert",    domains: ["binary_sensor", "sensor"] },
    };

    const hasEntityForKey = (k: string) => k.startsWith("custom_")
      ? Boolean(customSensors[Number(k.slice(7))]?.entity)
      : Boolean((config.sensors as Record<string, unknown>)?.[k]);
    const anyHasEntity = sensorOrder.some(k => hasEntityForKey(k));
    const alwaysVisible = (k: string) => anyHasEntity ? hasEntityForKey(k) : k === "temperature";
    const visibleKeys = sensorOrder.filter(alwaysVisible);
    const hiddenKeys = sensorOrder.filter(k => !alwaysVisible(k));

    const renderSensorRow = (key: string, idx: number, isFirstVisible: boolean) => {
      const filledIdx = visibleKeys.indexOf(key);
      const isFirstFilled = filledIdx === 0;
      const isLastFilled = filledIdx === visibleKeys.length - 1;
      const isDragging = this._sensorDragIndex === idx;
      const isDropTarget = this._sensorDropIndex === idx && this._sensorDragIndex !== idx;
      const canReorder = hasEntityForKey(key);
      const accent = key.startsWith("custom_")
        ? CUSTOM_SENSOR_COLORS[Number(key.slice(7)) % CUSTOM_SENSOR_COLORS.length]
        : (SENSOR_ACCENT[key] ?? "#9aa7b6");
      const orderControls = html`
        <div class="sensor-row-order">
          ${isFirstFilled && canReorder ? html`<span class="sensor-primary-badge" title="Primary sensor — displayed largest in the card">★</span>` : nothing}
          <button class="secondary icon-button" type="button" ?disabled=${isFirstFilled || !canReorder} @click=${() => this._moveSensorKey(idx, -1)} aria-label="Move up">↑</button>
          <button class="drag-handle" type="button" .draggable=${canReorder} title="Drag to reorder" aria-label="Drag to reorder"
            ?disabled=${!canReorder}
            @dragstart=${canReorder ? () => this._sensorDragStart(idx) : nothing}
            @dragend=${canReorder ? this._handleSensorDragEnd : nothing}
            @pointerdown=${canReorder ? (e: PointerEvent) => this._handleSensorTouchDragStart(e, idx) : nothing}
            @pointermove=${canReorder ? this._handleSensorTouchDragMove : nothing}
            @pointerup=${canReorder ? this._handleSensorTouchDragEnd : nothing}
            @pointercancel=${canReorder ? this._handleSensorTouchDragCancel : nothing}>⋮⋮</button>
          <button class="secondary icon-button" type="button" ?disabled=${isLastFilled || !canReorder} @click=${() => this._moveSensorKey(idx, 1)} aria-label="Move down">↓</button>
        </div>
      `;
      const tip = isFirstVisible ? html`<div class="sensor-primary-tip">★ The top sensor is displayed largest in the card.</div>` : nothing;
      if (key.startsWith("custom_")) {
        const i = Number(key.slice(7));
        const sensor = customSensors[i];
        if (!sensor) return nothing;
        return html`
          ${tip}
          <div class="sensor-row-wrapper ${isFirstFilled ? "sensor-row-wrapper--primary" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}"
               data-sensor-index=${String(idx)} data-sensor-key=${key}
               @dragover=${this._handleSensorDragOver} @drop=${() => this._handleSensorDropTarget(idx)}>
            ${orderControls}${this._renderCustomSensor(sensor, i, config, accent)}
          </div>`;
      }
      const meta = PRESET_META[key];
      if (!meta) return nothing;
      return html`
        ${tip}
        <div class="sensor-row-wrapper ${isFirstFilled ? "sensor-row-wrapper--primary" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}"
             data-sensor-index=${String(idx)} data-sensor-key=${key}
             @dragover=${this._handleSensorDragOver} @drop=${() => this._handleSensorDropTarget(idx)}>
          ${orderControls}${this._renderPresetSensor(key as string & keyof typeof SENSOR_ACCENT, meta.label, meta.icon, config, meta.domains, accent)}
        </div>`;
    };

    return html`
      <div class="panel">
        <div class="panel-title">Sensors</div>

        <div class="sensor-ordered-list">
          ${repeat(visibleKeys, k => k, (k, vi) => renderSensorRow(k, sensorOrder.indexOf(k), vi === 0))}
        </div>
        ${!this._showMoreSensors ? html`
          <button type="button" class="secondary sensor-more-btn" @click=${() => { this._showMoreSensors = true; }}>More sensors ▾</button>
        ` : html`
          ${hiddenKeys.length ? html`
            <div class="sensor-ordered-list">
              ${repeat(hiddenKeys, k => k, k => renderSensorRow(k, sensorOrder.indexOf(k), false))}
            </div>
          ` : nothing}
          <button type="button" class="sensor-add-row" @click=${this._addCustomSensor.bind(this)}>+ Add custom sensor</button>
          <button type="button" class="secondary sensor-more-btn" @click=${() => { this._showMoreSensors = false; }}>Hide sensors ▴</button>
        `}

        <div class="row single">
          ${this._renderToggleField("Click opens details", "Tapping the climate strip opens a popup with sensor history.", config.ui?.header_climate_more_info ?? true, (checked) => this._setUi("header_climate_more_info", checked))}
        </div>
      </div>
    `;
  }

  private _renderHeaderSection(config: SmartRoomCardConfig, roomNameEmpty: boolean) {
    const areaName = this._areaName(config.room_id);
    const roomName = config.room ?? areaName ?? "";
    const showAreaIcon = config.ui?.show_area_icon ?? false;
    const areaIcon = (this.hass as import("./types/ha-extensions").HomeAssistantExtended)?.areas?.[config.room_id ?? ""]?.icon ?? "mdi:home-outline";
    const automationEnabled = config.ui?.automation_badge_enabled ?? false;
    const images = config.ui?.images ?? {};
    const bgOn = images.background_on ?? "";

    const _SENSOR_ICONS: Record<string, string> = {
      temperature: "mdi:thermometer", humidity: "mdi:water-percent", co2: "mdi:molecule-co2",
      voc: "mdi:flask-outline", pm25: "mdi:blur", aqi: "mdi:gauge", presence: "mdi:motion-sensor",
      noise: "mdi:volume-high", illuminance: "mdi:brightness-5", power: "mdi:lightning-bolt",
      energy: "mdi:flash", carbon_monoxide: "mdi:molecule-co", radon: "mdi:radioactive", moisture: "mdi:water-alert",
    };
    const _previewSensorOrder = getNormalizedSensorOrder(config.sensors, config.sensors?.custom?.length ?? 0);
    const _previewSensors: Array<{ icon: string; value: string }> = [];
    for (const _key of _previewSensorOrder) {
      if (_previewSensors.length >= 6) break;
      if (_key.startsWith("custom_")) {
        const _ci = Number(_key.slice(7));
        const _sc = config.sensors?.custom?.[_ci];
        if (_sc?.entity) {
          const _e = this.hass?.states[_sc.entity];
          if (_e && _e.state !== "unavailable" && _e.state !== "unknown") {
            const _u = _e.attributes["unit_of_measurement"] as string | undefined ?? "";
            _previewSensors.push({ icon: _sc.icon || "mdi:gauge", value: `${_e.state}${_u ? ` ${_u}` : ""}` });
          }
        }
      } else {
        const _eid = (config.sensors as Record<string, unknown> | undefined)?.[_key] as string | undefined;
        if (_eid) {
          const _e = this.hass?.states[_eid];
          if (_e && _e.state !== "unavailable" && _e.state !== "unknown") {
            const _u = _e.attributes["unit_of_measurement"] as string | undefined ?? "";
            const _raw = _e.state;
            const _val = _key === "temperature" && Number.isFinite(Number(_raw))
              ? `${Number(_raw).toFixed(1)}${_u || "°"}`
              : `${_raw}${_u ? ` ${_u}` : ""}`;
            const _icon = (config.sensors?.icons as Record<string, string> | undefined)?.[_key] || _SENSOR_ICONS[_key] || "mdi:gauge";
            _previewSensors.push({ icon: _icon, value: _val });
          }
        }
      }
    }

    return html`
      <section class="section">
        <div class="section-header ${this._headerCollapsed ? "section-header--collapsed" : ""}"
             @click=${() => { if (this._headerCollapsed) this._headerCollapsed = false; }}>
          <div>
            <div class="section-title">Header</div>
            <div class="section-subtitle">Name, icon and sensor strip.</div>
          </div>
          <button class="section-collapse-btn" @click=${(e: Event) => { e.stopPropagation(); this._headerCollapsed = !this._headerCollapsed; }}>
            <ha-icon icon=${this._headerCollapsed ? "mdi:chevron-down" : "mdi:chevron-up"}></ha-icon>
          </button>
        </div>
        <div class="section-collapsible ${this._headerCollapsed ? "section-collapsible--collapsed" : ""}">
        <div class="section-collapsible-inner">

        <div class="editor-header-preview ${bgOn && this._bgPreviewValid ? "editor-header-preview--has-bg" : ""}"
             style=${bgOn && this._bgPreviewValid ? `background-image: url('${bgOn}')` : ""}>
          <div class="ehp-overlay"></div>
          <div class="ehp-top">
            <div class="ehp-title ${roomNameEmpty ? "ehp-title--empty" : ""}">
              ${showAreaIcon ? html`<ha-icon icon=${areaIcon}></ha-icon>` : nothing}
              <span>${roomNameEmpty ? "Area name" : roomName}</span>
            </div>
            ${_previewSensors.length ? html`
              <div class="ehp-sensors">
                ${_previewSensors.map((s, i) => html`
                  <div class="ehp-sensor-item ${i === 0 ? "ehp-sensor-item--primary" : ""}">
                    <ha-icon icon=${s.icon}></ha-icon>
                    <span>${s.value}</span>
                  </div>
                `)}
              </div>
            ` : nothing}
          </div>
        </div>

        <div class="row single">
          <label class="${roomNameEmpty ? "req-input-wrap" : ""}">
            Area name
            <span class="hint">Header label displayed on the card.</span>
            <input .value=${config.room ?? areaName ?? ""} @input=${(e: InputEvent) => this._setRoot("room", valueFromEvent(e))} />
          </label>
          ${roomNameEmpty ? this._reqError("Area name is required.", "Use area name", () => { this._patch({ room: areaName }); }) : nothing}
        </div>

        ${roomNameEmpty ? nothing : html`
        <div class="row single">
          ${this._renderCompactCheckField("Show area icon", "Shows the area icon next to the name in the header.", showAreaIcon, (checked) => this._setUi("show_area_icon", checked))}
        </div>

        ${this._renderSensors(config)}

        <div class="panel">
          <div class="panel-title">Automations badge</div>
          <div class="row single">
            ${this._renderToggleField("Show automation count", "Shows a badge with the count of enabled automations in this area.", automationEnabled, (checked) => this._setUi("automation_badge_enabled", checked), !this._isRoomIdValid(config.room_id))}
          </div>
        </div>
        `}
        </div></div>
      </section>
    `;
  }

  private _renderPresetSensor(
    key: string,
    label: string,
    icon: string,
    config: SmartRoomCardConfig,
    domains: string[] = ["sensor"],
    accent = "#9aa7b6",
  ) {
    const alertConfig = config.sensors?.alerts?.[key as keyof typeof config.sensors.alerts];
    const alertEnabled = alertConfig?.enabled === true;
    const entityId = (config.sensors as Record<string, string | undefined>)?.[key] ?? "";
    const hasRoomId = Boolean(this._config?.room_id?.trim());
    const filtersKey = key as keyof NonNullable<typeof config.sensors>["filters"] & string;
    const restrictToRoom = hasRoomId && config.sensors?.filters?.[filtersKey]?.restrict_to_room_area !== false;
    const isPresence = key === "presence";
    const numericAlertConfig = !isPresence ? (alertConfig as SmartRoomNumericSensorAlert | undefined) : undefined;
    const deviceClasses = SENSOR_DEVICE_CLASSES[key];
    const sAlertKey = key as "temperature";
    const sFilterKey = key as "temperature";
    return html`
      <div class="sensor-row">
        <div class="sensor-row-header">
          <div class="sensor-chip" style="--chip-color:${accent}">
            <ha-icon icon=${icon}></ha-icon>
            <span>${label}</span>
          </div>
          <label class="sensor-row-alert-toggle">${this._renderInlineToggle(alertEnabled, (v) => this._setSensorAlert(sAlertKey, "enabled", v))}<span>Alert</span></label>
        </div>
        <div class="sensor-row-body">
          ${this._renderSmartEntityPicker(entityId, (v) => this._setSensor(key, v), domains, deviceClasses, restrictToRoom, this._config?.room_id, (showAll) => this._setSensorFilter(sFilterKey, "restrict_to_room_area", !showAll), false, () => this._setSensor(key, ""))}
        </div>
        ${alertEnabled ? html`
          <div class="sensor-alert-row">
            ${isPresence ? html`
              <label class="sensor-alert-full">When equal to<input type="text" .value=${typeof alertConfig?.eq === "string" ? alertConfig.eq : ""} placeholder="e.g. on" @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "eq", (e.target as HTMLInputElement).value || undefined)} /></label>
            ` : html`
              <label>Min<input type="number" .value=${typeof numericAlertConfig?.min === "number" ? String(numericAlertConfig.min) : ""} @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "min", toNumberOrUndefined(valueFromEvent(e)))} /></label>
              <label>Max<input type="number" .value=${typeof numericAlertConfig?.max === "number" ? String(numericAlertConfig.max) : ""} @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "max", toNumberOrUndefined(valueFromEvent(e)))} /></label>
              <label>Eq<input type="number" .value=${typeof numericAlertConfig?.eq === "number" ? String(numericAlertConfig.eq) : ""} @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "eq", toNumberOrUndefined(valueFromEvent(e)))} /></label>
            `}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderCustomSensor(sensor: import("./helpers").SmartRoomCustomSensor, i: number, _config: SmartRoomCardConfig, accent = "#9aa7b6") {
    const alertEnabled = sensor.alert?.enabled === true;
    const hasRoomId = Boolean(this._config?.room_id?.trim());
    const restrictToRoom = hasRoomId && sensor.restrict_to_room_area === true;
    return html`
      <div class="sensor-row sensor-row-custom">
        <div class="sensor-row-header">
          <div class="sensor-chip" style="--chip-color:${accent}">
            <ha-icon icon=${sensor.icon || "mdi:gauge"}></ha-icon>
            <input class="sensor-name-input sensor-chip-input" .value=${sensor.name} placeholder="Sensor name" @input=${(e: InputEvent) => this._updateCustomSensor(i, { name: valueFromEvent(e) })} />
          </div>
          <label class="sensor-row-alert-toggle">${this._renderInlineToggle(alertEnabled, (v) => this._updateCustomSensorAlert(i, "enabled", v))}<span>Alert</span></label>
          <button type="button" class="sensor-remove-btn" @click=${() => this._removeCustomSensor(i)}>✕</button>
        </div>
        <div class="sensor-row-body">
          ${this._renderSmartEntityPicker(sensor.entity ?? "", (v) => this._setCustomSensorEntity(i, v), ["sensor"], undefined, restrictToRoom, this._config?.room_id, (showAll) => this._updateCustomSensor(i, { restrict_to_room_area: !showAll }), false, () => this._setCustomSensorEntity(i, ""))}
          ${this._renderIconPicker(sensor.icon ?? "", false, (v) => this._updateCustomSensor(i, { icon: v || undefined }))}
        </div>
        ${alertEnabled ? html`
          <div class="sensor-alert-row">
            <label>Min<input type="number" .value=${sensor.alert?.min !== undefined ? String(sensor.alert.min) : ""} @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "min", toNumberOrUndefined(valueFromEvent(e)))} /></label>
            <label>Max<input type="number" .value=${sensor.alert?.max !== undefined ? String(sensor.alert.max) : ""} @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "max", toNumberOrUndefined(valueFromEvent(e)))} /></label>
            <label>Eq<input type="number" .value=${sensor.alert?.eq !== undefined ? String(sensor.alert.eq) : ""} @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "eq", toNumberOrUndefined(valueFromEvent(e)))} /></label>
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderDevices(config: SmartRoomCardConfig) {
    return html`<section class="section"><div class="devices-header"><div><div class="section-title">Devices grid</div><div class="section-subtitle">Reorder, collapse and edit each tile.</div></div><button id="add-device-trigger" type="button" @click=${() => { this._showAddTypePicker = true; }}>Add device</button></div>${this._showAddTypePicker ? this._renderAddTypePicker() : nothing}<div class="devices-list">${(config.devices ?? []).map((device, index) => this._renderDevice(device, index))}</div></section>`;
  }

  private _renderAddTypePicker() {
    return html`
      <div class="panel add-picker">
        <div class="panel-title">Choose a device type</div>
        <div class="panel-subtitle">Types are presets for default device values. They do not change the runtime logic of the card.</div>
        <div class="type-picker-grid">
          ${this._typeDefinitions.map((type) => html`
            <div class="panel type-card" style=${`border-color:${type.editor_color};background:${type.editor_color};color:${foregroundFor(type.editor_color)};`}>
              <button type="button" class="type-select" style=${`color:${foregroundFor(type.editor_color)};`} @click=${() => this._addDevice(type.id)}>
                <span class="type-select-icon"><ha-icon icon=${this._typeIcon(type.id)}></ha-icon></span>
                <span class="type-select-label">${type.label}</span>
              </button>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private _renderDevice(device: SmartRoomDeviceConfig, index: number) {
    const expanded = this._expandedDevices.includes(index);
    const isFirst = index === 0;
    const isLast = index === (this._config?.devices?.length ?? 1) - 1;
    const entityRequired = this._isEntityRequired(device);
    const roomReady = this._isRoomIdValid(this._config?.room_id);
    const entityValid = this._isEntityValid(device.entity) && this._isEntityAllowedForDevice(device, device.entity);
    const configBlocked = !roomReady || (entityRequired && !entityValid);
    return html`
      <section class="device-card ${this._dragIndex === index ? "dragging" : ""} ${this._dropIndex === index && this._dragIndex !== index ? "drop-target" : ""}"
               data-type=${device.type ?? "custom"} data-device-index=${String(index)}
               @dragover=${this._handleDragOver} @drop=${() => this._handleDrop(index)}>
        <div class="device-order-col">
          <button class="secondary icon-button" type="button" ?disabled=${isFirst} @click=${() => this._moveDevice(index, -1)} aria-label="Move up">↑</button>
          <button class="drag-handle" type="button" draggable="true" title="Drag to reorder" aria-label="Drag to reorder"
            @dragstart=${() => this._handleDragStart(index)} @dragend=${this._handleDragEnd}
            @pointerdown=${(e: PointerEvent) => this._handleTouchDragStart(e, index)}
            @pointermove=${this._handleTouchDragMove} @pointerup=${this._handleTouchDragEnd}
            @pointercancel=${this._handleTouchDragCancel}>⋮⋮</button>
          <button class="secondary icon-button" type="button" ?disabled=${isLast} @click=${() => this._moveDevice(index, 1)} aria-label="Move down">↓</button>
        </div>
        <div class="device-body">
          <div class="device-header">
            <div class="device-header-main">
              <div class="device-header-copy">
                <div class="device-title">${device.name || device.entity || `Device ${index + 1}`}</div>
                <div class="device-subtitle">${device.entity || "Configure the entity and behavior for this tile."}</div>
                <div class="pill device-type-pill">${this._renderTypePill(device.type ?? "custom")}</div>
                <div class="device-header-actions">
                  <button class="secondary icon-button" type="button" @click=${() => this._toggleDeviceExpanded(index)}>${expanded ? "Hide" : "Edit"}</button>
                </div>
              </div>
              <div class="device-tools">
                <button class="danger device-remove" type="button" @click=${() => this._confirmRemoveDevice(index)}>Remove</button>
                <button class="secondary device-duplicate" type="button" @click=${() => this._duplicateDevice(index)}>Duplicate</button>
              </div>
            </div>
          </div>
          ${expanded ? html`
            ${this._renderIdentityPanel(device, index, entityRequired, entityValid)}
            ${configBlocked ? html`<div class="panel locked-panel"><div class="panel-title">${!roomReady ? "Area ID required" : "Entity required"}</div><div class="required-note">${!roomReady ? "Set a valid Area ID first. Then this type can limit the main entity selector to entities from that room." : "Enter a valid Home Assistant entity to unlock visuals, offline behavior, state rules and actions for this device type."}</div></div>` : html`
              ${this._renderVisualsPanel(device, index)}
              ${this._renderActionsPanel(device, index)}
              ${!this._isDeviceAdvanced(index) ? html`<div class="row single"><button type="button" class="secondary" @click=${() => this._setDeviceAdvanced(index, true)}>Advanced settings</button></div>` : html`
                ${this._renderStatesPanel(device, index)}
                <div class="row single"><button type="button" class="secondary" @click=${() => this._setDeviceAdvanced(index, false)}>Back to simple device setup</button></div>
              `}
            `}
          ` : nothing}
        </div>
      </section>`;
  }

  private _renderIdentityPanel(device: SmartRoomDeviceConfig, index: number, entityRequired: boolean, entityValid: boolean) {
    const definition = this._definitionForType(device.type ?? "custom");
    const hasRoom = this._isRoomIdValid(this._config?.room_id);
    const roomId = this._config?.room_id;
    const entityDomains = this._allowedMainEntities(device.type).filter((d) => d !== "*");
    const entityRestrict = hasRoom && device.entity_selectors?.["entity"]?.restrict_to_room_area !== false;
    const batteryRestrict = hasRoom && device.entity_selectors?.["battery"]?.restrict_to_room_area !== false;
    return html`<div class="panel ${this._toneClass(device.type)}">
      <div class="panel-title">Identity</div>
      <div class="row">
        <div>
          <label>Name<span class="hint">Tile label.</span><input .value=${device.name ?? ""} @input=${(e: InputEvent) => this._setDevice(index, "name", valueFromEvent(e))} /></label>
          ${this._renderCompactCheckField("Show entity icon", "Shows the entity icon next to the device name on the tile.", device.show_entity_icons ?? false, (checked) => this._setDevice(index, "show_entity_icons", checked || undefined))}
        </div>
        <div class="field-card">
          ${!hasRoom ? html`<div class="error-chip">Area ID required</div>` : nothing}
          <div class="field-title">Entity</div>
          <span class="hint">Main device entity.</span>
          ${this._renderSmartEntityPicker(device.entity ?? "", (value) => this._setDevice(index, "entity", value), entityDomains.length ? entityDomains : undefined, undefined, entityRestrict, roomId, (showAll) => this._setDeviceSelector(index, "entity", { ...(device.entity_selectors?.["entity"] ?? {}), restrict_to_room_area: !showAll, domains: entityDomains.length ? entityDomains : ["*"] }))}
        </div>
      </div>
      <div class="row">
        <div class="field-card">
          <div class="field-title">Battery entity</div>
          <span class="hint">Battery source.</span>
          ${this._renderSmartEntityPicker(device.battery ?? "", (value) => this._setDevice(index, "battery", value), ["sensor"], ["battery"], batteryRestrict, roomId, (showAll) => this._setDeviceSelector(index, "battery", { ...(device.entity_selectors?.["battery"] ?? {}), restrict_to_room_area: !showAll, domains: ["sensor"] }))}
          ${device.battery?.trim() ? html`<span class="hint">${this._isEntityValid(device.battery) ? "Valid battery entity." : "Battery entity is not valid yet."}</span>${this._renderCompactCheckField("Show battery level", "Shows the battery icon and percentage on the device tile.", device.show_battery !== false, (checked) => this._setDevice(index, "show_battery", checked))}${this._renderCompactCheckField("Enable battery alert", "Derives a low battery alert using the card-level battery alert settings.", device.battery_alert_enabled !== false, (checked) => this._setDevice(index, "battery_alert_enabled", checked))}` : html`<span class="hint">Optional. Creates a low battery alert and shows battery level on the tile.</span>`}
        </div>
        <div></div>
      </div>
      ${(definition.extra_fields ?? []).map((field) => {
        const fieldKey = `var:${field.key}`;
        const fieldDomains = (field.selector_domains ?? []).filter((d) => d !== "*");
        const fieldRestrict = hasRoom && device.entity_selectors?.[fieldKey]?.restrict_to_room_area !== false;
        const fieldValue = String(device.variables?.[field.key] ?? (device as unknown as Record<string, unknown>)[field.key] ?? "");
        return html`<div class="row single"><div class="field-card">
          <div class="field-title">${field.label}</div>
          <span class="hint">${field.hint}</span>
          ${this._renderSmartEntityPicker(fieldValue, (value) => this._setDeviceVariable(index, field.key, value), fieldDomains.length ? fieldDomains : undefined, undefined, fieldRestrict, roomId, (showAll) => this._setDeviceSelector(index, fieldKey, { ...(device.entity_selectors?.[fieldKey] ?? {}), restrict_to_room_area: !showAll, domains: field.selector_domains ?? ["*"] }))}
          ${fieldValue.trim() ? html`<span class="hint">${this._isEntityValid(fieldValue) ? "Valid entity." : "Entity is not valid yet."}</span>` : nothing}
        </div></div>`;
      })}
    </div>`;
  }

  private _renderSharedVisualsPanel(
    imageValue: string,
    onImageChange: (value: string) => void,
    description: string,
    toneClass = "",
  ) {
    return html`<div class="panel ${toneClass}"><div class="panel-title">Visuals</div>${description ? html`<div class="hint">${description}</div>` : nothing}<div class="row single"><label>Default image<span class="hint">Main tile image. State images override it. Transparent PNG recommended.</span><input .value=${imageValue} @input=${(e: InputEvent) => onImageChange(valueFromEvent(e))} /><span class="hint">Example: /local/img/products/camera.png</span></label></div></div>`;
  }

  private _renderSharedStateRulesPanel(offlinePanel: unknown, statesPanel: unknown, alertsPanel: unknown, toneClass = "") {
    return html`<div class="panel ${toneClass}"><div class="panel-title">State rules</div><div class="stack-separated">${offlinePanel}${statesPanel}${alertsPanel}</div></div>`;
  }

  private _renderSharedActionsPanel(tapPanel: unknown, holdPanel: unknown, toneClass = "") {
    return html`<div class="panel ${toneClass}"><div class="panel-title">Actions</div><div class="stack-separated"><div class="panel"><div class="panel-title">Tap</div>${tapPanel}</div><div class="panel"><div class="panel-title">Hold</div>${holdPanel}</div></div></div>`;
  }

  private _renderSharedActionEditor(options: {
    action: SmartRoomActionConfig | undefined;
    title: string;
    defaultAction: string;
    entityOptions?: string[];
    onActionChange: (value: string) => void;
    onEntityChange: (value: string) => void;
    onServiceChange: (value: string) => void;
    onPopupMetaChange: (key: "title" | "size", value: string) => void;
    onPopupYamlChange: (value: string) => void;
  }) {
    const { action, title, defaultAction, entityOptions, onActionChange, onEntityChange, onServiceChange, onPopupMetaChange, onPopupYamlChange } = options;
    return html`<div class="panel-grid">
      <div class="subsection">
        <div class="subsection-title">${title}</div>
        <div class="field-help">Defines what happens when the device tile is pressed.</div>
        <div class="row">
          <label>Action type<span class="hint">Selects the behavior used by this interaction.</span><select .value=${action?.action ?? defaultAction} @change=${(e: Event) => onActionChange(valueFromEvent(e))}><option value="button">Button</option><option value="more-info">More info</option><option value="custom">Custom popup</option><option value="none">None</option></select></label>
          ${this._renderEntityFieldLabel("Target entity", "Entity used by Button or More info actions.", action?.entity ?? "", onEntityChange, entityOptions, "Example: light.lamp, lock.front_door or button.portal_open", !entityOptions?.length)}
        </div>
        ${action?.action === "button" ? html`<div class="row single"><label>Button service<span class="hint">Service called when this action is triggered.</span><input .value=${action?.service ?? ""} @input=${(e: InputEvent) => onServiceChange(valueFromEvent(e))} /><span class="hint">Example: button.press, light.toggle, switch.turn_on</span></label></div>` : nothing}
        ${action?.action === "more-info" ? html`<div class="field-help">Opens the native Home Assistant details dialog for the target entity.</div>` : nothing}
        ${action?.action === "custom" ? html`<div class="row"><label>Popup title<span class="hint">Title shown at the top of the popup.</span><input .value=${action?.popup?.title ?? ""} @input=${(e: InputEvent) => onPopupMetaChange("title", valueFromEvent(e))} /></label><label>Popup size<span class="hint">Size used by the popup container.</span><select .value=${action?.popup?.size ?? "wide"} @change=${(e: Event) => onPopupMetaChange("size", valueFromEvent(e))}><option value="normal">normal</option><option value="wide">wide</option><option value="fullscreen">fullscreen</option></select></label></div><div class="row single"><label>Popup YAML<span class="hint">Lovelace YAML rendered inside the custom popup.</span><textarea @input=${(e: InputEvent) => onPopupYamlChange(valueFromEvent(e))}>${this._popupYaml(action)}</textarea><span class="hint">Example:
type: entities
entities:
  - entity: light.lamp

If your popup content is already a JSON object, you can paste it as-is.</span></label></div>` : nothing}
      </div>
    </div>`;
  }

  private _renderVisualsPanel(device: SmartRoomDeviceConfig, index: number) {
    return this._renderSharedVisualsPanel(
      device.image ?? "",
      (value) => this._setDevice(index, "image", value),
      "",
      this._toneClass(device.type),
    );
  }

  private _renderOfflinePanel(device: SmartRoomDeviceConfig, index: number) {
    const isPreset = device.type !== "custom" && this._isEntityRequired(device) && this._isEntityValid(device.entity);
    const lockMode = isPreset ? "first" : "none";
    return html`<div class="panel panel-subgroup-offline"><div class="panel-title">Offline</div>${isPreset ? html`<div class="preset-banner"><div class="preset-copy"><div><strong>Offline</strong></div><div>This default type configuration can be edited and reset, but it cannot be removed.</div></div><button type="button" class="secondary" @click=${() => this._resetPresetOffline(index)}>Reset</button></div>` : nothing}<div class="row">${this._renderToggleField("Offline enabled", "Turns the offline rule on or off.", device.offline?.enabled ?? false, (checked) => this._setOffline(index, "enabled", checked))}${this._renderToggleField("Strike through offline", "Adds the offline slash.", device.offline?.strike ?? false, (checked) => this._setOffline(index, "strike", checked))}</div><div class="row"><label>Dim opacity<span class="hint">Tile opacity while offline.</span><input type="number" min="0" max="1" step="0.05" .value=${String(device.offline?.dim_opacity ?? 0.5)} @input=${(e: InputEvent) => this._setOffline(index, "dim_opacity", Number(valueFromEvent(e)))} /></label>${this._renderPickerField("Header badge", "Badge while offline.", this._renderHeaderBadgeSelect(device.offline?.header_badge ?? "none", false, (value) => this._setOffline(index, "header_badge", value)))}</div>${this._renderConditionsSection("Conditions", "All conditions must be true for this device to be offline.", this._renderConditionList(device.offline?.conditions, (next) => this._setOffline(index, "conditions", next), lockMode, { restrict_to_room_area: this._deviceRestrictsToRoomArea(device), domains: ["*"] }))}</div>`;
  }

  private _renderStatesPanel(device: SmartRoomDeviceConfig, index: number) {
    return this._renderSharedStateRulesPanel(
      this._renderOfflinePanel(device, index),
      html`<div class="panel panel-subgroup-states"><div class="panel-title">States</div>${this._renderNamedStates(index, device.states?.states)}</div>`,
      html`<div class="panel panel-subgroup-alerts"><div class="panel-title">Alerts</div>${this._renderNamedAlerts(index, device.states?.alerts)}</div>`,
      this._toneClass(device.type),
    );
  }

  private _renderEntityFieldLabel(
    label: string,
    hint: string,
    value: string,
    onChange: (value: string) => void,
    options?: string[],
    example?: string,
    nativePicker = false,
  ) {
    return nativePicker
      ? html`<div class="field-card"><div class="field-title">${label}</div><span class="hint">${hint}</span>${this._renderEntityPicker(value, onChange)}${example ? html`<span class="hint">${example}</span>` : nothing}</div>`
      : html`<label>${label}<span class="hint">${hint}</span>${options?.length
      ? html`<select .value=${value} @change=${(e: Event) => onChange(valueFromEvent(e))}>${options.map((option) => html`<option value=${option}>${option}</option>`)}</select>`
      : html`<input .value=${value} @input=${(e: InputEvent) => onChange(valueFromEvent(e))} />`}${example ? html`<span class="hint">${example}</span>` : nothing}</label>`;
  }

  private _renderEntityPicker(
    value: string,
    onChange: (value: string) => void,
    disabled = false,
    selector: Record<string, unknown> = { entity: {} },
  ) {
    if (!this.hass) {
      return html`<input ?disabled=${disabled} .value=${value} @input=${(e: InputEvent) => onChange(valueFromEvent(e))} />`;
    }
    return html`<ha-selector
      .hass=${this.hass}
      .value=${value}
      .selector=${selector}
      .disabled=${disabled}
      @value-changed=${(e: CustomEvent) => onChange(String(e.detail?.value ?? ""))}
    ></ha-selector>`;
  }

  private _normalizeSelectorDomains(values?: string[]): string[] {
    return normalizeDomains(values);
  }

  private _getDeviceSelectorOverride(
    device: SmartRoomDeviceConfig,
    key: string,
    defaults?: SmartRoomEntitySelectorOverride,
  ): SmartRoomEntitySelectorOverride {
    return {
      restrict_to_room_area: device.entity_selectors?.[key]?.restrict_to_room_area ?? defaults?.restrict_to_room_area ?? this._deviceRestrictsToRoomArea(device),
      domains: this._normalizeSelectorDomains(device.entity_selectors?.[key]?.domains ?? defaults?.domains ?? ["*"]),
    };
  }


  private _areaEntityIds(areaId?: string, domains?: string[]): string[] {
    return areaEntityIds(this._entityRegistry, this._deviceRegistry, areaId, domains);
  }

  private _areaEntityIdsFiltered(areaId?: string, domains?: string[], deviceClasses?: string[]): string[] {
    return areaEntityIdsFiltered(this._entityRegistry, this._deviceRegistry, this.hass?.states ?? {}, areaId, domains, deviceClasses);
  }

  private _entitySelector(domains?: string[], restrictToArea = false, areaId?: string, extra?: Record<string, unknown>): Record<string, unknown> {
    const uniqueDomains = [...new Set((domains ?? []).map((d) => d.trim()).filter(Boolean).map((d) => d.endsWith(".") ? d.slice(0, -1) : d))];
    const includeEntities = restrictToArea ? this._areaEntityIds(areaId, uniqueDomains.length ? uniqueDomains : undefined) : undefined;
    return buildEntitySelector(uniqueDomains, includeEntities, extra);
  }

  private _entitySelectorFiltered(domains: string[] | undefined, restrictToArea: boolean, areaId: string | undefined, deviceClasses?: string[]): Record<string, unknown> {
    const uniqueDomains = [...new Set((domains ?? []).map((d) => d.trim()).filter(Boolean).map((d) => d.endsWith(".") ? d.slice(0, -1) : d))];
    const includeEntities = restrictToArea ? this._areaEntityIdsFiltered(areaId, uniqueDomains.length ? uniqueDomains : undefined, deviceClasses) : undefined;
    return buildEntitySelectorFiltered(uniqueDomains, includeEntities, deviceClasses);
  }

  private _renderSmartEntityPicker(
    value: string,
    onChange: (value: string) => void,
    domains: string[] | undefined,
    deviceClasses: string[] | undefined,
    restrictToArea: boolean,
    areaId: string | undefined,
    onToggleShowAll: (showAll: boolean) => void,
    disabled = false,
    onClear?: () => void,
  ) {
    const hasRoom = Boolean(areaId?.trim());
    const areaLabel = areaId ? (this._areaName(areaId) || areaId) : "";
    const selectorRestricted = this._entitySelectorFiltered(domains, true, areaId, deviceClasses);
    const selectorAll = this._entitySelectorFiltered(domains, false, areaId, deviceClasses);
    const clearBtn = onClear
      ? html`<button type="button" class="entity-clear-x" aria-label="Clear entity" @click=${(e: Event) => { e.stopPropagation(); onClear(); }}><ha-icon icon="mdi:close"></ha-icon></button>`
      : nothing;
    return html`
      <div class="entity-field-wrap" style=${restrictToArea ? "" : "display:none"}>
        ${this._renderEntityPicker(value, onChange, disabled, selectorRestricted)}
        ${clearBtn}
      </div>
      <div class="entity-field-wrap" style=${!restrictToArea ? "" : "display:none"}>
        ${this._renderEntityPicker(value, onChange, disabled, selectorAll)}
        ${clearBtn}
      </div>
      ${hasRoom && !disabled ? html`<label class="show-all-check"><input type="checkbox" .checked=${restrictToArea} @change=${(e: Event) => onToggleShowAll(!(e.target as HTMLInputElement).checked)} /><span>Show entities from ${areaLabel}</span></label>` : nothing}
    `;
  }

  private _renderPickerField(title: string, hint: string, content: unknown) {
    return html`<div class="inline-control"><div><div>${title}</div><div class="hint">${hint}</div></div>${content}</div>`;
  }

  private _typeIcon(type: string): string {
    return this._definitionForType(type).icon ?? "mdi:circle-outline";
  }

  private _typeLabel(type: string): string {
    return this._definitionForType(type).label;
  }

  private _renderTypePill(type: string) {
    return html`<ha-icon icon=${this._typeIcon(type)}></ha-icon><span>${this._typeLabel(type)}</span>`;
  }

  private _renderConditionsSection(title: string, hint: string, content: unknown) {
    return html`<div class="stack-separated"><div class="conditions-shell"><div class="subsection"><div class="subsection-title">Conditions</div><div class="field-help">${hint}</div></div>${content}</div></div>`;
  }

  private _renderSharedNamedStateCard(
    item: SmartRoomNamedStateConfig,
    options: {
      onUpdate: (key: keyof SmartRoomNamedStateConfig, value: unknown) => void;
      onConditions: (next: ConditionConfig[]) => void;
      onRemove?: () => void;
      onReset?: () => void;
      entityOptions?: string[];
      lockMode: "none" | "first" | "all";
      selectorDefaults?: { domains?: string[]; restrict_to_room_area?: boolean };
      showPresetBanner?: boolean;
      allowPresetNameEdit?: boolean;
    },
  ) {
    const {
      onUpdate,
      onConditions,
      onRemove,
      onReset,
      lockMode,
      selectorDefaults,
      showPresetBanner = true,
      allowPresetNameEdit = false,
    } = options;
    return html`<div class="condition-card condition-card-state ${item.preset ? "preset-locked" : ""}">
      ${item.preset && showPresetBanner ? html`<div class="preset-banner"><div class="preset-copy"><div><strong>${item.name?.trim() || `Default ${this._presetLabel(item.preset_source)} state`}</strong></div><div>You can edit this default type configuration, but it cannot be removed.</div></div>${onReset ? html`<button type="button" class="secondary" @click=${onReset}>Reset</button>` : nothing}</div>` : nothing}
      <div class="panel-grid">
        <div class="subsection">
          <div class="subsection-title">${item.name?.trim() || "State"}</div>
          <div class="row single"><label>State name<span class="hint">Internal editor name.</span><input ?disabled=${Boolean(item.preset || item.preset_source) && !allowPresetNameEdit} .value=${item.name ?? ""} @input=${(e: InputEvent) => onUpdate("name", valueFromEvent(e))} /><span class="hint">Example: On, Offline, Privacy</span></label></div>
          <div class="row single">${this._renderToggleField("State enabled", "Turns this state on or off without deleting it.", item.enabled !== false, (checked) => onUpdate("enabled", checked))}</div>
          <div class="row">${this._renderEntityFieldLabel("Active text", "Text appended under the device name while this state is active. Leave empty to omit it.", item.text_active ?? item.text ?? "", (value) => onUpdate("text_active", value || undefined), undefined, "Example: Auto open ready")}${this._renderEntityFieldLabel("Active entity", "Entity value appended under the device name while this state is active. Leave empty to omit it.", item.text_entity_active ?? item.text_entity ?? "", (value) => onUpdate("text_entity_active", value || undefined), undefined, "Example: sensor.last_portal_open", true)}</div>
          <div class="row">${this._renderEntityFieldLabel("Inactive text", "Text appended under the device name while this state is inactive. Leave empty to omit it.", item.text_inactive ?? "", (value) => onUpdate("text_inactive", value || undefined), undefined)}${this._renderEntityFieldLabel("Inactive entity", "Entity value appended under the device name while this state is inactive. Leave empty to omit it.", item.text_entity_inactive ?? "", (value) => onUpdate("text_entity_inactive", value || undefined), undefined, undefined, true)}</div>
          <div class="row"><div class="inline-control"><div class="toggle-header-row"><div class="toggle-header-copy"><div class="toggle-header-title">Highlight border</div><div class="toggle-header-desc">Shows the border while active.</div></div>${this._renderInlineToggle(item.outlined ?? false, (checked) => onUpdate("outlined", checked))}</div><div class="inline-color-block"><span class="inline-color-label">Color</span>${this._renderColorSelect(item.border_color ?? "white", false, (value) => onUpdate("border_color", value), true)}</div></div>${this._renderPickerField("Inactive header badge", "Badge while inactive.", this._renderHeaderBadgeSelect(this._stateBadgeValue(item, "inactive"), false, (value) => onUpdate("header_badge_inactive", value)))}</div>
          <div class="row single">${this._renderPickerField("Active header badge", "Badge while active.", this._renderHeaderBadgeSelect(this._stateBadgeValue(item, "active"), false, (value) => onUpdate("header_badge_active", value)))}</div>
        </div>
        <div class="subsection">
          <div class="subsection-title">State icons</div>
          <div class="field-help">These icons are shown in the top-right corner of the device tile.</div>
          <div class="row single"><div class="inline-control"><div><div>Active icon</div><div class="hint">Top-right icon while active.</div></div><div class="icon-picker-row">${this._renderIconPicker(item.icon_active ?? "", false, (value) => onUpdate("icon_active", value || undefined))}</div><div class="inline-color-block"><span class="inline-color-label">Color</span>${this._renderColorSelect(item.icon_active_color ?? item.border_color ?? "white", false, (value) => onUpdate("icon_active_color", value), true)}</div></div></div>
          <div class="row single"><div class="inline-control"><div><div>Inactive icon</div><div class="hint">Top-right icon while inactive.</div></div><div class="icon-picker-row">${this._renderIconPicker(item.icon_inactive ?? "", false, (value) => onUpdate("icon_inactive", value || undefined))}</div><div class="inline-color-block"><span class="inline-color-label">Color</span>${this._renderColorSelect(item.icon_inactive_color ?? item.border_color ?? "white", false, (value) => onUpdate("icon_inactive_color", value), true)}</div></div></div>
        </div>
        <div class="subsection">
          <div class="subsection-title">State images</div>
          <div class="field-help">These images replace the device image shown in the tile. A transparent PNG is recommended.</div>
          <div class="row"><label>Active image<span class="hint">Image shown for the device while this state is active.</span><input .value=${item.image_active ?? ""} @input=${(e: InputEvent) => onUpdate("image_active", valueFromEvent(e) || undefined)} /><span class="hint">Example: /local/img/products/light/on.png</span></label><label>Inactive image<span class="hint">Image shown for the device while this state is inactive.</span><input .value=${item.image_inactive ?? ""} @input=${(e: InputEvent) => onUpdate("image_inactive", valueFromEvent(e) || undefined)} /><span class="hint">Example: /local/img/products/light/off.png</span></label></div>
        </div>
      </div>
      ${this._renderConditionsSection("Conditions", "All conditions must be true for this state to be active. If any condition is false, it becomes inactive.", this._renderConditionList(item.conditions, onConditions, lockMode, selectorDefaults))}
      ${onRemove ? html`<button type="button" class="secondary" @click=${onRemove}>Remove state</button>` : nothing}
    </div>`;
  }

  private _renderNamedStates(index: number, states: SmartRoomNamedStateConfig[] | undefined) {
    const device = (this._config?.devices ?? [])[index];
    const items = states ?? [];
    return html`${items.map((item, itemIndex) => this._renderSharedNamedStateCard(item, {
      onUpdate: (key, value) => this._updateNamedState(index, itemIndex, key, value),
      onConditions: (next) => this._updateNamedState(index, itemIndex, "conditions", next),
      onRemove: item.preset ? undefined : () => this._removeNamedState(index, itemIndex),
      onReset: item.preset ? () => this._resetPresetState(index, itemIndex) : undefined,
      lockMode: item.preset ? "first" : "none",
      selectorDefaults: { restrict_to_room_area: device ? this._deviceRestrictsToRoomArea(device) : false, domains: ["*"] },
    }))}<button type="button" class="secondary" @click=${() => this._addNamedState(index)}>Add state</button>`;
  }

  private _renderSharedNamedAlertCard(
    item: SmartRoomNamedAlertConfig,
    options: {
      onUpdate: (key: keyof SmartRoomNamedAlertConfig, value: unknown) => void;
      onConditions: (next: ConditionConfig[]) => void;
      onRemove?: () => void;
      onReset?: () => void;
      lockMode: "none" | "first" | "all";
      batteryLocked?: boolean;
      selectorDefaults?: { domains?: string[]; restrict_to_room_area?: boolean };
      showPresetBanner?: boolean;
      allowPresetNameEdit?: boolean;
    },
  ) {
    const {
      onUpdate,
      onConditions,
      onRemove,
      onReset,
      lockMode,
      batteryLocked = false,
      selectorDefaults,
      showPresetBanner = true,
      allowPresetNameEdit = false,
    } = options;
    return html`<div class="condition-card condition-card-alert ${item.preset ? "preset-locked" : ""}">
      ${item.preset && showPresetBanner ? html`<div class="preset-banner"><div class="preset-copy"><div><strong>${item.name?.trim() || (item.preset_source === "battery" ? "Battery alert" : `Default ${this._presetLabel(item.preset_source)} alert`)}</strong></div><div>${item.preset_source === "battery" ? "Synced with Battery entity and threshold. Conditions are auto-managed. Appearance can be customized but alert cannot be removed." : "You can edit this default type configuration, but it cannot be removed."}</div></div>${onReset ? html`<button type="button" class="secondary" @click=${onReset}>Reset</button>` : nothing}</div>` : nothing}
      <div class="panel-grid">
        <div class="subsection">
          <div class="subsection-title">Alert</div>
          <div class="row single">${this._renderToggleField("Alert enabled", "Enables this alert without removing its config.", item.enabled !== false, (checked) => onUpdate("enabled", checked), batteryLocked)}</div>
          <div class="row single"><label>Alert message<span class="hint">Text shown in the room alert list.</span><input ?disabled=${batteryLocked} .value=${item.message ?? ""} @input=${(e: InputEvent) => onUpdate("message", valueFromEvent(e))} /></label></div>
          <div class="row single">${this._renderPickerField("Header badge", "Badge while active.", this._renderAlertHeaderBadgeSelect(item.header_badge ?? (batteryLocked ? "low_battery" : "alert_generic"), batteryLocked, (value) => onUpdate("header_badge", value)))}</div>
          <div class="row single"><div class="inline-control"><div class="inline-control-header">${this._renderToggleField("Alert border", "Shows the border while active.", item.outlined ?? true, (checked) => onUpdate("outlined", checked), batteryLocked)}</div><div class="inline-color-block"><span class="inline-color-label">Color</span>${this._renderColorSelect(item.border_color ?? "red", batteryLocked, (value) => onUpdate("border_color", value), true)}</div></div></div>
          <div class="row single"><div class="inline-control"><div><div>Alert icon</div><div class="hint">Top-right icon while active. Overrides state icons.</div></div><div class="icon-picker-row">${this._renderIconPicker(item.icon ?? "", batteryLocked, (value) => onUpdate("icon", value || undefined))}</div><div class="inline-color-block"><span class="inline-color-label">Color</span>${this._renderColorSelect(item.icon_color ?? item.border_color ?? "red", batteryLocked, (value) => onUpdate("icon_color", value), true)}</div></div></div>
        </div>
      </div>
      ${this._renderConditionsSection("Conditions", "All conditions must be true for this alert to trigger.", this._renderConditionList(item.conditions, onConditions, lockMode, selectorDefaults))}
      ${onRemove ? html`<button type="button" class="secondary" @click=${onRemove}>Remove alert</button>` : nothing}
    </div>`;
  }

  private _renderNamedAlerts(index: number, alerts: SmartRoomNamedAlertConfig[] | undefined) {
    const device = (this._config?.devices ?? [])[index];
    const items = alerts ?? [];
    const batteryAlertIndex = items.findIndex((item) => item.preset_source === "battery");
    const batteryAlert = batteryAlertIndex !== -1 ? items[batteryAlertIndex] : undefined;
    const userAlerts = items.filter((item) => item.preset_source !== "battery");
    return html`
      ${userAlerts.map((item) => {
        const itemIndex = items.indexOf(item);
        return this._renderSharedNamedAlertCard(item, {
          onUpdate: (key, value) => this._updateNamedAlert(index, itemIndex, key, value),
          onConditions: (next) => this._updateNamedAlert(index, itemIndex, "conditions", next),
          onRemove: item.preset ? undefined : () => this._removeNamedAlert(index, itemIndex),
          onReset: item.preset ? () => this._resetPresetAlert(index, itemIndex) : undefined,
          lockMode: item.preset ? "first" : "none",
          batteryLocked: false,
          selectorDefaults: { restrict_to_room_area: device ? this._deviceRestrictsToRoomArea(device) : false, domains: ["*"] },
        });
      })}
      <button type="button" class="secondary" @click=${() => this._addNamedAlert(index)}>Add alert</button>
      ${batteryAlert ? html`
        <div class="subsection">
          <div class="subsection-title">Battery alert</div>
          <div class="hint">Auto-generated from the battery entity and card-level threshold. Conditions are managed by the card. You can customize the appearance below.</div>
          ${this._renderSharedNamedAlertCard(batteryAlert, {
            onUpdate: (key, value) => this._updateNamedAlert(index, batteryAlertIndex, key, value),
            onConditions: () => {},
            onRemove: undefined,
            onReset: undefined,
            lockMode: "all",
            batteryLocked: false,
            allowPresetNameEdit: false,
            selectorDefaults: { restrict_to_room_area: device ? this._deviceRestrictsToRoomArea(device) : false, domains: ["*"] },
          })}
        </div>
      ` : nothing}
    `;
  }

  private _renderActionsPanel(device: SmartRoomDeviceConfig, index: number) {
    return this._renderSharedActionsPanel(
      this._renderActionEditor(index, "tap_action", device.tap_action),
      this._renderActionEditor(index, "hold_action", device.hold_action),
      this._toneClass(device.type),
    );
  }

  private _renderActionEditor(index: number, key: "tap_action" | "hold_action", action: SmartRoomActionConfig | undefined) {
    return this._renderSharedActionEditor({
      action,
      title: key === "tap_action" ? "Tap action" : "Hold action",
      defaultAction: "more-info",
      entityOptions: undefined,
      onActionChange: (value) => this._setAction(index, key, "action", value),
      onEntityChange: (value) => this._setAction(index, key, "entity", value),
      onServiceChange: (value) => this._setAction(index, key, "service", value),
      onPopupMetaChange: (popupKey, value) => this._setPopup(index, key, popupKey, value),
      onPopupYamlChange: (value) => this._setPopupYaml(index, key, value),
    });
  }

  private _renderConditionList(
    conditions: ConditionConfig[] | undefined,
    onChange: (next: ConditionConfig[]) => void,
    lockMode: "none" | "first" | "all" = "none",
    selectorDefaults?: { domains?: string[]; restrict_to_room_area?: boolean },
  ) {
    const items = conditions ?? [];
    return html`<div class="conditions-list">${items.map((condition, index) => {
      const removeLocked = lockMode === "all" || (lockMode === "first" && index === 0);
      return html`<div class="condition-card">${this._renderConditionEditor(condition, (next) => { const clone = [...items]; clone[index] = next; onChange(clone); }, lockMode === "all", selectorDefaults)}${removeLocked ? html`<div class="hint">${index === 0 && lockMode === "first" ? "Default preset condition. You can edit it, but you cannot remove it." : "Locked condition."}</div>` : html`<button type="button" class="secondary" @click=${() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove condition</button>`}</div>`;
    })}</div>${lockMode === "all" ? nothing : html`<button type="button" class="secondary" @click=${() => onChange([...items, { entity: "", operator: "eq", value: "on" }])}>Add condition</button>`}`;
  }

  private _renderConditionEditor(
    condition: ConditionConfig | undefined,
    onChange: (next: ConditionConfig) => void,
    disabled = false,
    selectorDefaults?: { domains?: string[]; restrict_to_room_area?: boolean },
  ) {
    const current = condition ?? { entity: "", operator: "eq", value: "on" };
    const hasRoom = this._isRoomIdValid(this._config?.room_id);
    const rawDomains = current.selector_domains ?? selectorDefaults?.domains ?? ["*"];
    const domains = rawDomains.filter((d) => d !== "*");
    const restrictToRoom = current.restrict_to_room_area ?? selectorDefaults?.restrict_to_room_area ?? hasRoom;
    return html`<div class="row"><div class="field-card"><div class="field-title">Entity</div>${this._renderSmartEntityPicker(current.entity, (value) => onChange({ ...current, entity: value }), domains.length ? domains : undefined, undefined, restrictToRoom, this._config?.room_id, (showAll) => onChange({ ...current, restrict_to_room_area: !showAll }), disabled)}</div><label>Operator<select ?disabled=${disabled} .value=${current.operator} @change=${(e: Event) => onChange({ ...current, operator: valueFromEvent(e) as ConditionConfig["operator"] })}>${OPERATORS.map((operator) => html`<option value=${operator}>${operator}</option>`)}</select></label></div><div class="row single"><label>Value<input ?disabled=${disabled} .value=${conditionValueToText(current.value)} @input=${(e: InputEvent) => onChange({ ...current, value: parseConditionValue(valueFromEvent(e)) })} /></label></div>`;
  }

  private _renderIconPicker(value: string, disabled: boolean, onChange: (value: string) => void) {
    return html`<ha-icon-picker
      .value=${value}
      ?disabled=${disabled}
      @value-changed=${(e: CustomEvent) => onChange(String(e.detail?.value ?? ""))}
    ></ha-icon-picker>`;
  }

  private _renderInlineToggle(checked: boolean, onChange: (checked: boolean) => void, disabled = false) {
    return html`<label class="ios-toggle" data-checked=${String(checked)} data-disabled=${String(disabled)}>
      <input type="checkbox" .checked=${checked} ?disabled=${disabled} @change=${(e: Event) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span class="ios-toggle-switch" aria-hidden="true"></span>
    </label>`;
  }

  private _renderCompactCheckField(title: string, description: string, checked: boolean, onChange: (checked: boolean) => void, disabled = false) {
    return html`<label class="compact-check"><input type="checkbox" .checked=${checked} ?disabled=${disabled} @change=${(e: Event) => onChange((e.currentTarget as HTMLInputElement).checked)} /><span class="compact-check-copy"><span class="compact-check-title">${title}</span><span class="compact-check-desc">${description}</span></span></label>`;
  }

  private _renderToggleField(
    title: string,
    description: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    disabled = false,
  ) {
    return html`<label class="ios-toggle" data-checked=${String(checked)} data-disabled=${String(disabled)}>
      <span class="ios-toggle-copy">
        <span class="ios-toggle-title">${title}</span>
        <span class="ios-toggle-desc">${description}</span>
      </span>
      <input type="checkbox" .checked=${checked} ?disabled=${disabled} @change=${(e: Event) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span class="ios-toggle-switch" aria-hidden="true"></span>
    </label>`;
  }

  private _renderColorSelect(value: string, disabled: boolean, onChange: (value: string) => void, compact = false) {
    const current = COLOR_OPTIONS.find((item) => item.value === value) ?? COLOR_OPTIONS[0];
    return html`<details class="color-picker ${compact ? "inline-color-picker" : ""}">
      <summary>
        <span class="color-swatch" style=${`background:${current.swatch}`}></span>
        <span>${current.label}</span>
        <span>▾</span>
      </summary>
      <div class="color-picker-menu">
        ${COLOR_OPTIONS.map((item) => html`<button type="button" class="color-option" ?disabled=${disabled} @click=${(e: Event) => { onChange(item.value); (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open"); }}>
          <span class="color-swatch" style=${`background:${item.swatch}`}></span>
          <span>${item.label}</span>
        </button>`)}
      </div>
    </details>`;
  }

  private _renderHeaderBadgeSelect(value: string, disabled: boolean, onChange: (value: string) => void) {
    const allowAutomationBadge = this._isRoomIdValid(this._config?.room_id);
    const options = HEADER_BADGE_OPTIONS.filter((item) => item.value !== "automation" || allowAutomationBadge);
    const current = options.find((item) => item.value === value) ?? options[0];
    return html`<details class="badge-picker">
      <summary>
        <span class="badge-icon">${current.icon ? html`<ha-icon icon=${current.icon} style=${`color:${(current as { color?: string }).color ?? "#fff"}`}></ha-icon>` : html`<span></span>`}</span>
        <span>${current.label}</span>
        <span>▾</span>
      </summary>
      <div class="badge-menu">
        ${options.map((item) => html`<button type="button" class="badge-option" ?disabled=${disabled} @click=${(e: Event) => { onChange(item.value); (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open"); }}>
          <span class="badge-icon">${item.icon ? html`<ha-icon icon=${item.icon} style=${`color:${(item as { color?: string }).color ?? "#fff"}`}></ha-icon>` : html`<span></span>`}</span>
          <span>${item.label}</span>
        </button>`)}
      </div>
    </details>`;
  }

  private _renderAlertHeaderBadgeSelect(value: string, disabled: boolean, onChange: (value: string) => void) {
    const options = ALERT_HEADER_BADGE_OPTIONS;
    const current = options.find((item) => item.value === value) ?? options[0];
    return html`<details class="badge-picker">
      <summary>
        <span class="badge-icon"><ha-icon icon=${current.icon} style="color:#ff3b30"></ha-icon></span>
        <span>${current.label}</span>
        <span>▾</span>
      </summary>
      <div class="badge-menu">
        ${options.map((item) => html`<button type="button" class="badge-option" ?disabled=${disabled} @click=${(e: Event) => { onChange(item.value); (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open"); }}>
          <span class="badge-icon"><ha-icon icon=${item.icon} style="color:#ff3b30"></ha-icon></span>
          <span>${item.label}</span>
        </button>`)}
      </div>
    </details>`;
  }

  private _addDevice = (type: SmartRoomDeviceConfig["type"]) => {
    const devices = [...(this._config?.devices ?? [])];
    devices.push(this._applyTypePreset({ entity: "", type, offline: {}, states: { on_conditions: [], alert_conditions: [] } }, type, ""));
    this._patch({ devices });
    this._expandedDevices = [devices.length - 1];
    this._showAddTypePicker = false;
  };

  private _confirmRemoveDevice(index: number) {
    if (!window.confirm("Remove this device from the grid?")) return;
    this._removeDevice(index);
  }

  private _removeDevice(index: number) {
    const devices = [...(this._config?.devices ?? [])];
    devices.splice(index, 1);
    this._patch({ devices });
    this._expandedDevices = this._expandedDevices.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item));
  }

  private _duplicateDevice(index: number) {
    const devices = [...(this._config?.devices ?? [])];
    const source = devices[index];
    if (!source) return;
    const duplicate = deepClone(source);
    if (duplicate.name) duplicate.name = `${duplicate.name} copy`;
    devices.splice(index + 1, 0, duplicate);
    this._patch({ devices });
    this._expandedDevices = [...this._expandedDevices.map((item) => (item > index ? item + 1 : item)), index + 1];
  }

  private _toggleDeviceExpanded(index: number) {
    this._expandedDevices = this._expandedDevices.includes(index) ? this._expandedDevices.filter((item) => item !== index) : [...this._expandedDevices, index];
  }

  private _moveDevice(index: number, direction: -1 | 1) {
    const devices = [...(this._config?.devices ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= devices.length) return;
    const [moved] = devices.splice(index, 1);
    devices.splice(nextIndex, 0, moved);
    this._patch({ devices });
    this._expandedDevices = this._expandedDevices.map((item) => { if (item === index) return nextIndex; if (direction === 1 && item > index && item <= nextIndex) return item - 1; if (direction === -1 && item < index && item >= nextIndex) return item + 1; return item; });
  }

  private _handleDragStart(index: number) {
    this._dragIndex = index;
    this._dropIndex = index;
  }
  private _handleDragOver(event: DragEvent) { event.preventDefault(); }
  private _handleDrop(index: number) { this._reorderTo(index); }
  private _handleDragEnd = () => { this._dragIndex = undefined; this._dropIndex = undefined; };

  private _handleTouchDragStart(event: PointerEvent, index: number) {
    if (event.pointerType === "mouse") return;
    this._dragIndex = index;
    this._dropIndex = index;
    this._touchDragPointerId = event.pointerId;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private _handleTouchDragMove = (event: PointerEvent) => {
    if (this._touchDragPointerId !== event.pointerId) return;
    const targetIndex = this._indexFromPoint(event.clientX, event.clientY);
    if (targetIndex !== undefined) this._dropIndex = targetIndex;
    event.preventDefault();
  };

  private _handleTouchDragEnd = (event: PointerEvent) => {
    if (this._touchDragPointerId !== event.pointerId) return;
    const targetIndex = this._dropIndex ?? this._indexFromPoint(event.clientX, event.clientY);
    if (targetIndex !== undefined) this._reorderTo(targetIndex); else { this._dragIndex = undefined; this._dropIndex = undefined; }
    this._touchDragPointerId = undefined;
    event.preventDefault();
  };

  private _handleTouchDragCancel = (event: PointerEvent) => {
    if (this._touchDragPointerId !== event.pointerId) return;
    this._touchDragPointerId = undefined;
    this._dragIndex = undefined;
    this._dropIndex = undefined;
  };

  private _reorderTo(targetIndex: number) {
    if (this._dragIndex === undefined || this._dragIndex === targetIndex) { this._dragIndex = undefined; this._dropIndex = undefined; return; }
    const devices = [...(this._config?.devices ?? [])];
    const [moved] = devices.splice(this._dragIndex, 1);
    devices.splice(targetIndex, 0, moved);
    this._patch({ devices });
    const from = this._dragIndex;
    const to = targetIndex;
    this._expandedDevices = this._expandedDevices.map((item) => { if (item === from) return to; if (from < to && item > from && item <= to) return item - 1; if (from > to && item >= to && item < from) return item + 1; return item; });
    this._dragIndex = undefined;
    this._dropIndex = undefined;
  }

  private _moveSensorKey(idx: number, dir: -1 | 1) {
    const customCount = this._config?.sensors?.custom?.length ?? 0;
    this._patch({ sensors: moveSensorInOrder(this._config?.sensors, idx, dir, customCount) });
  }

  private _sensorDragStart(idx: number) { this._sensorDragIndex = idx; this._sensorDropIndex = idx; }
  private _handleSensorDragOver = (event: DragEvent) => { event.preventDefault(); };
  private _handleSensorDropTarget(idx: number) { this._reorderSensorTo(idx); }
  private _handleSensorDragEnd = () => { this._sensorDragIndex = undefined; this._sensorDropIndex = undefined; };

  private _handleSensorTouchDragStart(event: PointerEvent, idx: number) {
    if (event.pointerType === "mouse") return;
    this._sensorDragIndex = idx;
    this._sensorDropIndex = idx;
    this._touchSensorDragPointerId = event.pointerId;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
  private _handleSensorTouchDragMove = (event: PointerEvent) => {
    if (this._touchSensorDragPointerId !== event.pointerId) return;
    const targetIndex = this._sensorIndexFromPoint(event.clientX, event.clientY);
    if (targetIndex !== undefined) this._sensorDropIndex = targetIndex;
    event.preventDefault();
  };
  private _handleSensorTouchDragEnd = (event: PointerEvent) => {
    if (this._touchSensorDragPointerId !== event.pointerId) return;
    const targetIndex = this._sensorDropIndex ?? this._sensorIndexFromPoint(event.clientX, event.clientY);
    if (targetIndex !== undefined) this._reorderSensorTo(targetIndex); else { this._sensorDragIndex = undefined; this._sensorDropIndex = undefined; }
    this._touchSensorDragPointerId = undefined;
    event.preventDefault();
  };
  private _handleSensorTouchDragCancel = (event: PointerEvent) => {
    if (this._touchSensorDragPointerId !== event.pointerId) return;
    this._touchSensorDragPointerId = undefined;
    this._sensorDragIndex = undefined;
    this._sensorDropIndex = undefined;
  };
  private _reorderSensorTo(targetIdx: number) {
    if (this._sensorDragIndex === undefined || this._sensorDragIndex === targetIdx) { this._sensorDragIndex = undefined; this._sensorDropIndex = undefined; return; }
    const customCount = this._config?.sensors?.custom?.length ?? 0;
    this._patch({ sensors: reorderSensorsInOrder(this._config?.sensors, this._sensorDragIndex, targetIdx, customCount) });
    this._sensorDragIndex = undefined;
    this._sensorDropIndex = undefined;
  }
  private _sensorIndexFromPoint(x: number, y: number): number | undefined {
    const elements = this.shadowRoot?.elementsFromPoint(x, y) ?? [];
    for (const element of elements) {
      const card = (element as HTMLElement).closest?.("[data-sensor-index]") as HTMLElement | null;
      if (!card) continue;
      const raw = card.dataset["sensorIndex"];
      if (raw === undefined) continue;
      const index = Number(raw);
      if (Number.isInteger(index)) return index;
    }
    return undefined;
  }

  private _indexFromPoint(x: number, y: number): number | undefined {
    const elements = this.shadowRoot?.elementsFromPoint(x, y) ?? [];
    for (const element of elements) {
      const card = (element as HTMLElement).closest?.("[data-device-index]") as HTMLElement | null;
      if (!card) continue;
      const raw = card.dataset.deviceIndex;
      if (raw === undefined) continue;
      const index = Number(raw);
      if (Number.isInteger(index)) return index;
    }
    return undefined;
  }

  private _isEntityRequired(device: SmartRoomDeviceConfig): boolean {
    return isEntityRequired(this._typeDefinitions, device);
  }

  private _definitionForType(type: SmartRoomDeviceType): SmartRoomTypeDefinition {
    return definitionForType(this._typeDefinitions, type);
  }

  private _allowedMainEntities(type?: SmartRoomDeviceType): string[] {
    return allowedMainEntities(this._typeDefinitions, type);
  }

  private _isEntityAllowedForDevice(device: SmartRoomDeviceConfig, entityId?: string): boolean {
    const trimmed = entityId?.trim();
    if (!trimmed) return false;
    const selectorOverride = this._getDeviceSelectorOverride(device, "entity", {
      domains: this._allowedMainEntities(device.type),
      restrict_to_room_area: this._deviceRestrictsToRoomArea(device),
    });
    const patterns = selectorOverride.domains ?? this._allowedMainEntities(device.type);
    const matchesType = !patterns.length || patterns.includes("*") || patterns.some((pattern) => {
      const normalized = pattern.trim();
      if (!normalized) return false;
      if (normalized === "*") return true;
      return trimmed.startsWith(normalized);
    });
    if (!matchesType) return false;
    if (!(selectorOverride.restrict_to_room_area ?? false)) return true;
    const areaId = (this._config?.room_id ?? "").trim();
    if (!this._isRoomIdValid(areaId)) return false;
    return this._areaEntityIds(areaId).includes(trimmed);
  }

  private _isRoomIdValid(roomId?: string): boolean {
    const normalized = (roomId ?? "").trim();
    return Boolean(normalized && this._areas()[normalized]);
  }

  private _handleRoomAutofill = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private _refreshRegistries(): void {
    if (!this.hass?.callWS) return;
    void (async () => {
      try {
        const [entities, devices] = await Promise.all([
          this.hass!.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
          this.hass!.callWS<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
        ]);
        this._entityRegistry = Array.isArray(entities) ? entities : [];
        this._deviceRegistry = Array.isArray(devices) ? devices : [];
      } catch {
        this._entityRegistry = [];
        this._deviceRegistry = [];
      }
    })();
  }

  private _setDeviceVariable(index: number, key: string, value: string): void {
    const devices = [...(this._config?.devices ?? [])];
    const current = devices[index];
    if (!current) return;
    const previousValue = current.variables?.[key] ?? "";
    const variables = { ...(current.variables ?? {}), [key]: value };
    const nextDevice = {
      ...current,
      variables,
      ...(key === "privacy" ? { privacy: value || undefined } : {}),
      ...(key === "battery" ? { battery: value || undefined } : {}),
    };
    const preset = this._buildPreset(nextDevice.type ?? "custom", nextDevice.entity ?? "", nextDevice);
    devices[index] = {
      ...nextDevice,
      tap_action: syncActionEntity(nextDevice.tap_action, preset.tap_action, previousValue, value, [`field.${key}`]),
      hold_action: syncActionEntity(nextDevice.hold_action, preset.hold_action, previousValue, value, [`field.${key}`]),
      double_tap_action: syncActionEntity(nextDevice.double_tap_action, preset.double_tap_action, previousValue, value, [`field.${key}`]),
      offline: syncOfflinePreset(nextDevice.offline, preset.offline, previousValue, value, [`field.${key}`]),
      states: syncStatePreset(nextDevice.states, preset.states, previousValue, value, [`field.${key}`]),
    };
    if (key === "battery") {
      devices[index] = this._applyDerivedBatteryAlert(devices[index], this._config?.ui?.battery_threshold ?? 20);
    }
    this._patch({ devices });
  }

  private _stateBadgeValue(item: SmartRoomNamedStateConfig, mode: "active" | "inactive"): SmartRoomHeaderBadge {
    if (mode === "inactive") {
      return item.header_badge_inactive ?? "none";
    }
    if (item.header_badge_active && item.header_badge_active !== "none") return item.header_badge_active;
    if (item.header_badge && item.header_badge !== "none") return item.header_badge;
    if (item.count_light) return "light";
    if (item.count_media) return "playing";
    if (item.count_rec) return "rec";
    return "none";
  }

  private _presetLabel(source?: SmartRoomNamedStateConfig["preset_source"] | SmartRoomNamedAlertConfig["preset_source"]): string {
    switch (source) {
      case "camera_live": return "camera live";
      case "camera_privacy": return "camera privacy";
      case "offline": return "offline";
      case "type":
      default: return "type";
    }
  }

  private _isEntityValid(entityId?: string): boolean {
    if (!entityId?.trim()) return false;
    if (!this.hass?.states) {
      return entityId.includes(".");
    }
    return Boolean(this.hass.states[entityId.trim()]);
  }

  private _areas(): Record<string, { name?: string; icon?: string }> {
    return (this.hass as HomeAssistantExtended).areas ?? {};
  }

  private _areaName(areaId?: string): string | undefined {
    const normalized = (areaId ?? "").trim();
    return normalized ? this._areas()[normalized]?.name : undefined;
  }

  private _setAreaId(areaId: string): void {
    const nextAreaId = areaId.trim();
    const newAreaName = this._areaName(nextAreaId);
    this._patch({
      room_id: nextAreaId || undefined,
      ...(newAreaName ? { room: newAreaName } : {}),
    });
  }

  private _setRoot(key: keyof SmartRoomCardConfig, value: unknown) { this._patch({ [key]: value } as Partial<SmartRoomCardConfig>); }
  private _setUi(key: string, value: unknown) {
    if (key === "battery_threshold") {
      const threshold = Number(value);
      const devices = (this._config?.devices ?? []).map((device) => this._applyDerivedBatteryAlert(device, threshold));
      this._patch({ ui: { ...(this._config?.ui ?? {}), [key]: threshold }, devices });
      return;
    }
    if (key === "battery_alerts_enabled") {
      const enabled = Boolean(value);
      const threshold = enabled ? (this._config?.ui?.battery_threshold ?? 20) : 0;
      const devices = (this._config?.devices ?? []).map((device) => this._applyDerivedBatteryAlert(device, threshold));
      this._patch({ ui: { ...(this._config?.ui ?? {}), [key]: enabled }, devices });
      return;
    }
    if (key === "battery_alert_outlined" || key === "battery_alert_border_color" || key === "battery_alert_header_badge" || key === "battery_alert_header_border") {
      const nextUi = { ...(this._config?.ui ?? {}), [key]: value };
      const threshold = (this._config?.ui?.battery_alerts_enabled !== false)
        ? (this._config?.ui?.battery_threshold ?? 20)
        : 0;
      const devices = (this._config?.devices ?? []).map((device) =>
        this._applyDerivedBatteryAlertWithUi(device, threshold, nextUi),
      );
      this._patch({ ui: nextUi, devices });
      return;
    }
    this._patch({ ui: { ...(this._config?.ui ?? {}), [key]: value } });
  }
  private _setExpander(key: string, value: unknown) { this._patch({ expander: { ...(this._config?.expander ?? {}), [key]: value } }); }
  private _setRoomImage(key: "background_on" | "background_off", value: string) { this._patch({ ui: { ...(this._config?.ui ?? {}), images: { ...(this._config?.ui?.images ?? {}), [key]: value || undefined } } }); }
  private _setImageKey(key: string, value: unknown) { this._patch({ ui: { ...(this._config?.ui ?? {}), images: { ...(this._config?.ui?.images ?? {}), [key]: value } } }); }
  private _setSensor(key: string, value: string) {
    const hadEntity = Boolean((this._config?.sensors as Record<string, unknown>)?.[key]);
    let newSensors = patchSensor(this._config?.sensors, key, value);
    if (value && !hadEntity) {
      newSensors = bubbleSensorAboveEmpty(newSensors, key);
      this._patch({ sensors: newSensors });
      requestAnimationFrame(() => { this.shadowRoot?.querySelector<HTMLElement>(`[data-sensor-key="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
      return;
    }
    else if (!value && hadEntity) newSensors = sinkSensorBelowFilled(newSensors, key);
    this._patch({ sensors: newSensors });
  }
  private _setSensorIcon(key: string, value: string) { this._patch({ sensors: patchSensorIcon(this._config?.sensors, key, value) }); }
  private _setSensorFilter(key: string, field: "restrict_to_room_area", value: boolean) {
    this._patch({ sensors: patchSensorFilter(this._config?.sensors, key as "temperature", field, value) });
  }
  private _setSensorAlert(key: string, field: "enabled" | "min" | "max" | "eq", value: boolean | number | string | undefined) {
    this._patch({ sensors: patchSensorAlert(this._config?.sensors, key as "temperature", field, value) });
  }
  private _addCustomSensor() { this._patch({ sensors: addCustomSensor(this._config?.sensors) }); }
  private _removeCustomSensor(i: number) { this._patch({ sensors: removeCustomSensor(this._config?.sensors, i) }); }
  private _updateCustomSensor(i: number, patch: Partial<import("./helpers").SmartRoomCustomSensor>) {
    this._patch({ sensors: updateCustomSensor(this._config?.sensors, i, patch) });
  }
  private _updateCustomSensorAlert(i: number, field: "enabled" | "min" | "max" | "eq", value: boolean | number | undefined) {
    this._patch({ sensors: updateCustomSensorAlert(this._config?.sensors, i, field, value) });
  }
  private _setCustomSensorEntity(i: number, value: string) {
    const hadEntity = Boolean(this._config?.sensors?.custom?.[i]?.entity);
    let newSensors = updateCustomSensor(this._config?.sensors, i, { entity: value });
    if (value && !hadEntity) {
      newSensors = bubbleSensorAboveEmpty(newSensors, `custom_${i}`);
      this._patch({ sensors: newSensors });
      requestAnimationFrame(() => { this.shadowRoot?.querySelector<HTMLElement>(`[data-sensor-key="custom_${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
      return;
    }
    else if (!value && hadEntity) newSensors = sinkSensorBelowFilled(newSensors, `custom_${i}`);
    this._patch({ sensors: newSensors });
  }

  private _setDevice(index: number, key: keyof SmartRoomDeviceConfig, value: unknown) {
    const devices = [...(this._config?.devices ?? [])];
    const current = devices[index];
    if (!current) return;

    if (key === "type") {
      const nextType = (value as SmartRoomDeviceConfig["type"]) ?? "custom";
      devices[index] = this._applyTypePreset({ ...current, type: nextType }, nextType, current.entity);
      this._patch({ devices });
      return;
    }

    if (key === "entity") {
      const nextEntity = String(value ?? "");
      devices[index] = this._syncDeviceWithEntity({ ...current, entity: nextEntity }, current.entity, nextEntity);
      this._patch({ devices });
      return;
    }

    if (key === "privacy") {
      const nextPrivacy = String(value ?? "");
      const nextDevice = { ...current, privacy: nextPrivacy };
      const preset = this._buildPreset(nextDevice.type ?? "custom", nextDevice.entity ?? "", nextDevice);
      devices[index] = {
        ...nextDevice,
        states: syncStatePreset(
          nextDevice.states,
          preset.states,
          current.privacy ?? "",
          nextPrivacy,
          [EXTRA_FIELD_PLACEHOLDERS.privacy],
        ),
      };
      this._patch({ devices });
      return;
    }

    if (key === "show_battery" || key === "battery_alert_enabled") {
      devices[index] = { ...current, [key]: value };
      if (key === "battery_alert_enabled") {
        devices[index] = this._applyDerivedBatteryAlert(devices[index], this._config?.ui?.battery_threshold ?? 20);
      }
      this._patch({ devices });
      return;
    }
    devices[index] = { ...current, [key]: value || undefined };
    if (key === "battery") {
      devices[index] = this._applyDerivedBatteryAlert(devices[index], this._config?.ui?.battery_threshold ?? 20);
    }
    this._patch({ devices });
  }
  private _setDeviceSelector(index: number, selectorKey: string, next: SmartRoomEntitySelectorOverride) {
    const devices = [...(this._config?.devices ?? [])];
    const current = devices[index];
    if (!current) return;
    const entity_selectors = {
      ...(current.entity_selectors ?? {}),
      [selectorKey]: {
        restrict_to_room_area: next.restrict_to_room_area ?? false,
        domains: this._normalizeSelectorDomains(next.domains),
      },
    };
    devices[index] = {
      ...current,
      entity_selectors,
      ...(selectorKey === "entity" ? { restrict_to_room_area: next.restrict_to_room_area ?? false } : {}),
    };
    if (selectorKey === "entity") {
      const nextEntity = current.entity ?? "";
      devices[index] = this._syncDeviceWithEntity(devices[index], nextEntity, nextEntity);
    }
    this._patch({ devices });
  }
  private _applyTypePreset(device: SmartRoomDeviceConfig, type: SmartRoomDeviceConfig["type"], entity: string): SmartRoomDeviceConfig {
    return applyTypePreset(this._typeDefinitions, device, type, entity);
  }
  private _hydratePresetDefaults(device: SmartRoomDeviceConfig): SmartRoomDeviceConfig {
    return hydratePresetDefaults(this._typeDefinitions, device, this._config?.ui?.battery_threshold ?? 20, this._config?.ui);
  }
  private _syncDeviceWithEntity(device: SmartRoomDeviceConfig, previousEntity: string, nextEntity: string): SmartRoomDeviceConfig {
    return syncDeviceWithEntity(this._typeDefinitions, device, previousEntity, nextEntity, this._config?.ui?.battery_threshold ?? 20, this._config?.ui);
  }
  private _buildPreset(type: SmartRoomDeviceConfig["type"], entity: string, device?: SmartRoomDeviceConfig): SmartRoomDeviceConfig {
    return buildPreset(this._typeDefinitions, type, entity, device);
  }
  private _buildResolvedPresetDevice(device: SmartRoomDeviceConfig): SmartRoomDeviceConfig {
    return buildResolvedPresetDevice(this._typeDefinitions, device, this._config?.ui?.battery_threshold ?? 20, this._config?.ui);
  }
  private _applyDerivedBatteryAlertWithUi(device: SmartRoomDeviceConfig, threshold: number, ui: SmartRoomCardConfig["ui"]): SmartRoomDeviceConfig {
    return applyDerivedBatteryAlertWithUi(device, threshold, ui);
  }
  private _applyDerivedBatteryAlert(device: SmartRoomDeviceConfig, threshold: number): SmartRoomDeviceConfig {
    return applyDerivedBatteryAlertWithUi(device, threshold, this._config?.ui);
  }
  private _setOffline(index: number, key: string, value: unknown) { const devices = [...(this._config?.devices ?? [])]; devices[index] = { ...devices[index], offline: { ...(devices[index].offline ?? {}), [key]: value } }; this._patch({ devices }); }
  private _resetPresetState(index: number, stateIndex: number) {
    const devices = [...(this._config?.devices ?? [])];
    const device = devices[index];
    if (!device) return;
    const next = resetPresetState(device, stateIndex, this._buildResolvedPresetDevice(device));
    if (!next) return;
    devices[index] = next;
    this._patch({ devices });
  }
  private _resetPresetAlert(index: number, alertIndex: number) {
    const devices = [...(this._config?.devices ?? [])];
    const device = devices[index];
    if (!device) return;
    const next = resetPresetAlert(device, alertIndex, this._buildResolvedPresetDevice(device));
    if (!next) return;
    devices[index] = next;
    this._patch({ devices });
  }
  private _resetPresetOffline(index: number) {
    const devices = [...(this._config?.devices ?? [])];
    const device = devices[index];
    if (!device) return;
    devices[index] = resetPresetOffline(device, this._buildResolvedPresetDevice(device));
    this._patch({ devices });
  }
  private _addNamedState(index: number) {
    const devices = [...(this._config?.devices ?? [])];
    if (!devices[index]) return;
    devices[index] = addNamedState(devices[index]);
    this._patch({ devices });
  }

  private _removeNamedState(index: number, stateIndex: number) {
    const devices = [...(this._config?.devices ?? [])];
    if (!devices[index]) return;
    devices[index] = removeNamedState(devices[index], stateIndex);
    this._patch({ devices });
  }

  private _updateNamedState(index: number, stateIndex: number, key: keyof SmartRoomNamedStateConfig, value: unknown) {
    const devices = [...(this._config?.devices ?? [])];
    if (!devices[index]) return;
    devices[index] = updateNamedState(devices[index], stateIndex, key, value);
    this._patch({ devices });
  }

  private _addNamedAlert(index: number) {
    const devices = [...(this._config?.devices ?? [])];
    if (!devices[index]) return;
    devices[index] = addNamedAlert(devices[index]);
    devices[index] = this._applyDerivedBatteryAlert(devices[index], this._config?.ui?.battery_threshold ?? 20);
    this._patch({ devices });
  }

  private _removeNamedAlert(index: number, alertIndex: number) {
    const devices = [...(this._config?.devices ?? [])];
    if (!devices[index]) return;
    devices[index] = removeNamedAlert(devices[index], alertIndex);
    this._patch({ devices });
  }

  private _updateNamedAlert(index: number, alertIndex: number, key: keyof SmartRoomNamedAlertConfig, value: unknown) {
    const devices = [...(this._config?.devices ?? [])];
    if (!devices[index]) return;
    devices[index] = updateNamedAlert(devices[index], alertIndex, key, value);
    this._patch({ devices });
  }

  private _setAction(index: number, actionKey: "tap_action" | "hold_action", key: keyof SmartRoomActionConfig, value: unknown) { const devices = [...(this._config?.devices ?? [])]; const current = devices[index][actionKey] ?? {}; devices[index] = { ...devices[index], [actionKey]: { ...current, [key]: value || undefined } }; this._patch({ devices }); }
  private _setPopup(index: number, actionKey: "tap_action" | "hold_action", key: "title" | "size", value: unknown) { const devices = [...(this._config?.devices ?? [])]; const current = devices[index][actionKey] ?? {}; devices[index] = { ...devices[index], [actionKey]: { ...current, popup: { ...(current.popup ?? {}), [key]: value || undefined } } }; this._patch({ devices }); }
  private _setPopupYaml(index: number, actionKey: "tap_action" | "hold_action", raw: string) { try { const parsed = raw.trim() ? parse(raw) : undefined; const devices = [...(this._config?.devices ?? [])]; const current = devices[index][actionKey] ?? {}; devices[index] = { ...devices[index], [actionKey]: { ...current, popup: { ...(current.popup ?? {}), card: parsed as Record<string, unknown> | undefined } } }; this._patch({ devices }); } catch {} }
  private _popupYaml(action?: SmartRoomActionConfig): string { return JSON.stringify(action?.popup?.card ?? action?.popup?.content ?? {}, null, 2); }
  private _patch(partial: Partial<SmartRoomCardConfig>) { this._config = { ...(this._config ?? { type: "custom:smart-area-card", room: "" }), ...partial }; fireEvent(this, "config-changed", { config: this._config }); }
}

if (!customElements.get("smart-area-card-editor")) {
  customElements.define("smart-area-card-editor", SmartAreaCardEditor);
}
