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
import { buildRoomBackgroundImage, DEVICE_TILE_SIZE_PRESETS, normalizeAssetPath, resolveDeviceTileSize } from "./helpers";
import { syncActionEntity, syncOfflinePreset, syncStatePreset } from "./editor/preset-engine";
import { definitionForType, isEntityRequired, allowedMainEntities, buildPreset, applyDerivedBatteryAlertWithUi, applyTypePreset, hydratePresetDefaults, syncDeviceWithEntity, buildResolvedPresetDevice } from "./editor/device-builder";
import { normalizeDomains, areaEntityIds, areaEntityIdsFiltered, buildEntitySelector, buildEntitySelectorFiltered, relatedBatteryEntityId } from "./editor/registry-helpers";
import { patchSensor, patchSensorIcon, patchSensorFilter, patchSensorAlert, patchSensorBattery, addCustomSensor, removeCustomSensor, updateCustomSensor, updateCustomSensorAlert, getNormalizedSensorOrder, moveSensorInOrder, reorderSensorsInOrder, bubbleSensorAboveEmpty, sinkSensorBelowFilled } from "./editor/sensor-config";
import { addNamedState, removeNamedState, updateNamedState, resetPresetState, resetPresetAlert, resetPresetOffline, addNamedAlert, removeNamedAlert, updateNamedAlert } from "./editor/named-item-config";
import type { SensorPopupItem } from "./components/sensor-popup";

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

const SENSOR_PREVIEW_ICONS: Record<string, string> = {
  temperature: "mdi:thermometer",
  humidity: "mdi:water-percent",
  co2: "mdi:molecule-co2",
  voc: "mdi:flask-outline",
  pm25: "mdi:blur",
  aqi: "mdi:gauge",
  presence: "mdi:motion-sensor",
  noise: "mdi:volume-high",
  illuminance: "mdi:brightness-5",
  power: "mdi:lightning-bolt",
  energy: "mdi:flash",
  carbon_monoxide: "mdi:molecule-co",
  radon: "mdi:radioactive",
  moisture: "mdi:water-alert",
};

const SENSOR_PREVIEW_LABELS: Record<string, string> = {
  temperature: "Temperature",
  humidity: "Humidity",
  co2: "CO2",
  voc: "VOC",
  pm25: "PM2.5",
  pm10: "PM10",
  aqi: "Air Quality",
  presence: "Presence",
  noise: "Noise",
  illuminance: "Illuminance",
  power: "Power",
  energy: "Energy",
  carbon_monoxide: "CO",
  radon: "Radon",
  moisture: "Moisture",
};

type HeaderSensorPreview = SensorPopupItem & { color?: string };

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
  @state() private _expandedSensors: string[] = [];
  @state() private _expandedSensorBatteries: string[] = [];
  @state() private _expandedPresetItems: string[] = [];
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
  @state() private _automationsCollapsed = false;
  @state() private _sensorsCollapsed = false;
  @state() private _showHeaderAutomationDetails = false;
  @state() private _showHeaderSensorPreviewPopup = false;
  @state() private _showSensorHeaderPreviewPopup = false;
  @state() private _imgPickerMode: "library" | "path" = "library";
  @state() private _imgUploading = false;
  @state() private _devImgPickerTabs: Record<string, "library" | "path"> = {};
  @state() private _devImgUploading = false;
  @state() private _devGallery: Array<{ url: string; name: string; type?: string }> = [];
  @state() private _bgGallery: Array<{ url: string; name: string }> = [];

  private static readonly _DEV_GALLERY_KEY = "smart-area:device-gallery";
  private static readonly _BG_GALLERY_HA_KEY = "smart_area_bg_gallery";
  private static readonly _EDITOR_SECTIONS_SEEN_KEY = "smart-area:editor-sections-seen";
  private _bgGalleryLoaded = false;

  private readonly _typeDefinitions: SmartRoomTypeDefinition[] = [...BUILTIN_TYPE_DEFINITIONS];
  private _touchDragPointerId?: number;
  private _touchDragStartX = 0;
  private _touchDragStartY = 0;
  private _touchDragPendingIndex?: number;
  private _touchSensorDragPointerId?: number;
  private _sensorTouchDragStartX = 0;
  private _sensorTouchDragStartY = 0;
  private _sensorTouchDragPendingIndex?: number;
  private _sectionsInitialized = false;
  private _devImgUploadCallback?: (url: string) => void;
  private _devImgUploadType?: string;

  protected firstUpdated(): void {
    this._refreshRegistries();
    try {
      const raw = localStorage.getItem(SmartAreaCardEditor._DEV_GALLERY_KEY);
      if (raw) this._devGallery = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  protected updated(changedProps: Map<string, unknown>): void {
    if (changedProps.has("hass")) {
      this._syncEditorColorScheme();
    }
    if (changedProps.has("hass") && this.hass && !this._bgGalleryLoaded) {
      this._bgGalleryLoaded = true;
      this._loadBgGallery();
    }
  }

  private _syncEditorColorScheme(): void {
    const haDarkMode = (this.hass as unknown as { themes?: { darkMode?: boolean } })?.themes?.darkMode;
    const browserDarkMode = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    this.toggleAttribute("data-editor-theme-dark", haDarkMode ?? browserDarkMode);
  }

  private async _ensureSensorPopupElement(): Promise<void> {
    await import("./components/sensor-popup");
    if (this._showHeaderSensorPreviewPopup || this._showSensorHeaderPreviewPopup) this.requestUpdate();
  }

  private async _loadBgGallery(): Promise<void> {
    try {
      const result = await (this.hass!.connection as any).sendMessagePromise({
        type: "frontend/get_user_data",
        key: SmartAreaCardEditor._BG_GALLERY_HA_KEY,
      });
      const remote = result?.value;
      if (Array.isArray(remote) && remote.length > 0) {
        this._bgGallery = remote;
      } else {
        // Migrate from old per-card config gallery on first use
        const legacy = this._config?.ui?.images?.gallery ?? [];
        if (legacy.length > 0) {
          await this._persistBgGallery(legacy);
        }
      }
    } catch { /* ignore */ }
  }

  private async _persistBgGallery(next: Array<{ url: string; name: string }>): Promise<void> {
    this._bgGallery = next;
    try {
      await (this.hass!.connection as any).sendMessagePromise({
        type: "frontend/set_user_data",
        key: SmartAreaCardEditor._BG_GALLERY_HA_KEY,
        value: next,
      });
    } catch { /* ignore */ }
  }

  private _getGallery(): Array<{ url: string; name: string }> {
    return this._bgGallery;
  }

  private _saveToGallery(url: string, name: string): void {
    const next = [{ url, name }, ...this._bgGallery.filter((g) => g.url !== url)].slice(0, 20);
    this._persistBgGallery(next);
  }

  private _removeFromGallery(url: string): void {
    const next = this._bgGallery.filter((g) => g.url !== url);
    this._persistBgGallery(next);
  }

  private _getDeviceGallery(): Array<{ url: string; name: string; type?: string }> {
    return this._devGallery;
  }

  private _saveToDeviceGallery(url: string, name: string, type?: string): void {
    const next = [{ url, name, type }, ...this._devGallery.filter((g) => g.url !== url)].slice(0, 30);
    this._devGallery = next;
    try { localStorage.setItem(SmartAreaCardEditor._DEV_GALLERY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  private _removeFromDeviceGallery(url: string): void {
    const next = this._devGallery.filter((g) => g.url !== url);
    this._devGallery = next;
    try { localStorage.setItem(SmartAreaCardEditor._DEV_GALLERY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  private _triggerDeviceImageUpload(callback: (url: string) => void, type?: string): void {
    this._devImgUploadCallback = callback;
    this._devImgUploadType = type;
    this.shadowRoot?.querySelector<HTMLInputElement>(".dev-img-file-input")?.click();
  }

  private async _handleDeviceImageFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (e.target as HTMLInputElement).value = "";
    this._devImgUploading = true;
    try {
      const format = file.type === "image/png" ? "png" : "jpeg";
      const dataUrl = await this._resizeImage(file, 400, 400, 0.85, format);
      const name = file.name.replace(/\.[^.]+$/, "");
      this._saveToDeviceGallery(dataUrl, name, this._devImgUploadType);
      this._devImgUploadCallback?.(dataUrl);
    } catch (err) {
      console.error("[smart-area-card] Device image resize failed:", err);
    } finally {
      this._devImgUploading = false;
      this._devImgUploadCallback = undefined;
      this._devImgUploadType = undefined;
    }
  }

  private _renderDevImgItem(img: { url: string; name: string; type?: string }, currentUrl: string, onPick: (url: string) => void) {
    return html`
      <div class="img-gallery-item ${currentUrl === img.url ? "img-gallery-item--active" : ""}"
           @click=${() => onPick(img.url)}>
        <img src=${img.url} alt=${img.name} loading="lazy" />
        <button type="button" class="img-gallery-del"
                @click=${(e: Event) => { e.stopPropagation(); this._removeFromDeviceGallery(img.url); if (currentUrl === img.url) onPick(""); }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
    `;
  }

  private _renderDeviceImagePicker(pickerId: string, currentUrl: string, onPick: (url: string) => void, deviceType?: string) {
    const tab = this._devImgPickerTabs[pickerId] ?? "library";
    const gallery = this._getDeviceGallery();
    const sameType = deviceType ? gallery.filter((g) => g.type === deviceType) : gallery;
    const others = deviceType ? gallery.filter((g) => g.type !== deviceType) : [];
    return html`
      <div class="img-picker-tabs">
        <button type="button" class="img-tab ${tab === "library" ? "img-tab--active" : ""}"
                @click=${() => { this._devImgPickerTabs = { ...this._devImgPickerTabs, [pickerId]: "library" }; }}>
          <ha-icon icon="mdi:image-multiple-outline"></ha-icon>Library
        </button>
        <button type="button" class="img-tab ${tab === "path" ? "img-tab--active" : ""}"
                @click=${() => { this._devImgPickerTabs = { ...this._devImgPickerTabs, [pickerId]: "path" }; }}>
          <ha-icon icon="mdi:link-variant"></ha-icon>Path
        </button>
      </div>
      ${tab === "path" ? html`
        <div class="row single">
          <label><input type="text" .value=${currentUrl.startsWith("data:") ? "" : currentUrl}
            placeholder="/local/img/products/device.png"
            @input=${(e: InputEvent) => onPick(valueFromEvent(e))} /></label>
        </div>
      ` : html`
        <div class="img-gallery img-gallery--square">
          <button type="button" class="img-upload-btn" ?disabled=${this._devImgUploading}
                  @click=${() => this._triggerDeviceImageUpload((url) => onPick(url), deviceType)}>
            <ha-icon icon=${this._devImgUploading ? "mdi:loading" : "mdi:plus"}></ha-icon>
            ${this._devImgUploading ? "Uploading…" : "Upload"}
          </button>
          ${sameType.map((img) => this._renderDevImgItem(img, currentUrl, onPick))}
          ${others.length > 0 ? html`<div class="img-gallery-separator"><span>Other types</span></div>` : nothing}
          ${others.map((img) => this._renderDevImgItem(img, currentUrl, onPick))}
          ${gallery.length === 0 ? html`<span class="img-gallery-empty">No images yet. Tap Upload to add one.</span>` : nothing}
        </div>
      `}
      ${currentUrl && !currentUrl.startsWith("data:") ? html`
        <div class="dev-img-preview"><img src=${currentUrl} alt="" loading="lazy" /></div>
      ` : nothing}
    `;
  }

  private _triggerImageUpload(): void {
    this.shadowRoot?.querySelector<HTMLInputElement>(".img-file-input")?.click();
  }

  private async _handleImageFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (e.target as HTMLInputElement).value = "";
    this._imgUploading = true;
    try {
      const dataUrl = await this._resizeImage(file);
      const name = file.name.replace(/\.[^.]+$/, "");
      this._saveToGallery(dataUrl, name);
      this._setRoomImage("background_on", dataUrl);
      this._bgPreviewValid = false;
      this._bgPreviewError = false;
    } catch (err) {
      console.error("[smart-area-card] Image resize failed:", err);
    } finally {
      this._imgUploading = false;
    }
  }

  private _resizeImage(file: File, maxW = 1280, maxH = 800, quality = 0.82, format: "jpeg" | "png" = "jpeg"): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(`image/${format}`, quality));
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("load failed")); };
      img.src = objectUrl;
    });
  }

  public setConfig(config: SmartRoomCardConfig): void {
    const fallback: SmartRoomCardConfig = {
      type: "custom:smart-area-card",
      room: "",
      room_id: "",
      devices: [],
      sensors: { alerts: {} },
      ui: {
        header_sensors_enabled: true,
        header_climate_more_info: true,
        battery_threshold: 20,
        battery_alerts_enabled: true,
        show_entity_icons: false,
        show_area_icon: false,
        keep_background_on_until_sunset: false,
        automation_badge_enabled: false,
        automation_badge_click_details: true,
        performance: {
          mode: "balanced",
          unload_collapsed_grid: true,
          lazy_sensor_charts: true,
        },
      },
      expander: { enabled: true, initial_state: "closed", persist_state: true },
    };
    try {
      const clone = deepClone(config);
      const nextConfig: SmartRoomCardConfig = {
        ...fallback,
        ...clone,
        ui: {
          ...fallback.ui,
          ...(clone.ui ?? {}),
          performance: {
            ...fallback.ui?.performance,
            ...(clone.ui?.performance ?? {}),
            lazy_sensor_charts: true,
          },
        },
        expander: { ...fallback.expander, ...(clone.expander ?? {}) },
      };
      nextConfig.devices = (nextConfig.devices ?? []).map((device) => this._hydratePresetDefaults(device));
      this._config = nextConfig;
    } catch {
      this._config = fallback;
    }
    const deviceCount = this._config?.devices?.length ?? 0;
    this._expandedDevices = this._expandedDevices.filter((index) => index < deviceCount);
    this._expandedPresetItems = this._expandedPresetItems.filter((key) => Number(key.split(":")[1]) < deviceCount);
    if (!this._sectionsInitialized) {
      this._sectionsInitialized = true;
      let collapseSections = false;
      try {
        collapseSections = localStorage.getItem(SmartAreaCardEditor._EDITOR_SECTIONS_SEEN_KEY) === "true";
        localStorage.setItem(SmartAreaCardEditor._EDITOR_SECTIONS_SEEN_KEY, "true");
      } catch { /* ignore */ }
      this._cardSetupCollapsed = collapseSections;
      this._headerCollapsed = collapseSections;
      this._automationsCollapsed = collapseSections;
      this._sensorsCollapsed = collapseSections;
    }
    // Registry is loaded once in firstUpdated. Do not re-fetch on every config change.
  }

  protected render() {
    try {
      const config = this._config;
      if (!config) return nothing;
      const hasArea = this._isRoomIdValid(config.room_id);
      return html`<div class="editor-shell"><div class="stack">
        ${this._renderGeneral(config, hasArea)}
        ${hasArea ? this._renderHeaderSection(config) : nothing}
        ${hasArea ? this._renderAutomationsSection(config) : nothing}
        ${hasArea ? this._renderSensorsSection(config) : nothing}
        ${hasArea ? this._renderDevices(config) : nothing}
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
    const performance = config.ui?.performance ?? {};
    const performanceMode = performance.mode ?? "balanced";
    const reduceEffects = performance.reduce_effects === true || performanceMode === "maximum";
    const unloadCollapsedGrid = performance.unload_collapsed_grid ?? true;
    const areaCollapsed = hasArea && this._cardSetupCollapsed;

    return html`
      <section class="section">
        <div class="section-header" @click=${() => { this._cardSetupCollapsed = !this._cardSetupCollapsed; }}>
          <div>
            <div class="section-title">Area</div>
            <div class="section-subtitle">${hasArea ? areaName || "Area selected" : "Choose an area"}</div>
          </div>
          <button class="section-collapse-btn" @click=${(e: Event) => e.stopPropagation()}>
            <ha-icon icon=${areaCollapsed ? "mdi:pencil-outline" : "mdi:chevron-up"}></ha-icon>
          </button>
        </div>

        <div class="section-collapsible ${areaCollapsed ? "section-collapsible--collapsed" : ""}">
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
            <button type="button" class="autofill-button autofill-button--full" ?disabled=${!hasArea} @click=${this._handleRoomAutofill}>Autofill devices from area</button>
          </div>

          ${!hasArea ? nothing : html`
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
                ${this._renderCompactCheckField("Remember state", "Restores the last open or closed state in this browser.", config.expander?.persist_state ?? true, (checked) => this._setExpander("persist_state", checked))}
              </div>
            </div>

            <div class="panel">
              <div class="panel-title">Battery alerts</div>
              <div class="row single">
                <label>Threshold %
                  <span class="hint">Marks batteries at or below this level.</span>
                  <input type="number" min="0" max="100"
                    .value=${String(config.ui?.battery_threshold ?? 20)}
                    @input=${(e: InputEvent) => this._setUi("battery_threshold", Number(valueFromEvent(e)))}
                  />
                </label>
              </div>
            </div>

            <div class="panel">
              <div class="panel-title">Performance</div>
              <div class="row single">
                <label>Mode
                  <select .value=${performanceMode} @change=${(e: Event) => this._setUiPerformance("mode", valueFromEvent(e))}>
                    <option value="balanced">Balanced</option>
                    <option value="maximum">Maximum savings</option>
                  </select>
                </label>
              </div>
              <div class="row single">
                ${this._renderCompactCheckField("Reduce visual effects", "Uses lighter shadows, blur and motion.", reduceEffects, (checked) => this._setUiPerformance("reduce_effects", checked || undefined), performanceMode === "maximum")}
              </div>
              <div class="row single">
                ${this._renderCompactCheckField("Unload closed grid", "Removes device tiles from the DOM while the card is closed.", unloadCollapsedGrid, (checked) => this._setUiPerformance("unload_collapsed_grid", checked))}
              </div>
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
      const isDragging = this._sensorDragIndex === idx;
      const isDropTarget = this._sensorDropIndex === idx && this._sensorDragIndex !== idx;
      const canReorder = hasEntityForKey(key);
      const accent = key.startsWith("custom_")
        ? CUSTOM_SENSOR_COLORS[Number(key.slice(7)) % CUSTOM_SENSOR_COLORS.length]
        : (SENSOR_ACCENT[key] ?? "#9aa7b6");

      const dragZoneAttrs = canReorder ? {
        draggable: true,
        dragstart: () => this._sensorDragStart(idx),
        dragend: this._handleSensorDragEnd,
        pointerdown: (e: PointerEvent) => this._handleSensorTouchDragStart(e, idx),
        pointermove: this._handleSensorTouchDragMove,
        pointerup: this._handleSensorTouchDragEnd,
        pointercancel: this._handleSensorTouchDragCancel,
      } : {};

      const primaryTip = isFirstVisible
        ? html`<span class="sensor-primary-tip"><span class="sr-primary-star" title="Primary sensor">&#9733;</span> Primary &mdash; displayed largest in the card.</span>`
        : nothing;

      if (key.startsWith("custom_")) {
        const i = Number(key.slice(7));
        const sensor = customSensors[i];
        if (!sensor) return nothing;
        const hasEntity = Boolean(sensor.entity);
        const isExpanded = !hasEntity || this._expandedSensors.includes(key);
        const entityLabel = sensor.entity ? (this.hass?.states[sensor.entity]?.attributes?.friendly_name as string | undefined ?? sensor.entity) : "";
        return html`
          <div class="sr-card ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}"
               data-sensor-index=${String(idx)} data-sensor-key=${key}
               style="--sr-accent: ${accent}"
               @dragover=${this._handleSensorDragOver} @drop=${() => this._handleSensorDropTarget(idx)}>
            <div class="sr-header">
              ${canReorder ? html`
                <div class="sr-drag-handle"
                     draggable="true"
                     @dragstart=${() => this._sensorDragStart(idx)}
                     @dragend=${this._handleSensorDragEnd}
                     @pointerdown=${(e: PointerEvent) => this._handleSensorTouchDragStart(e, idx)}
                     @pointermove=${this._handleSensorTouchDragMove}
                     @pointerup=${this._handleSensorTouchDragEnd}
                     @pointercancel=${this._handleSensorTouchDragCancel}>
                  <ha-icon icon="mdi:drag-vertical"></ha-icon>
                </div>
              ` : nothing}
              <div class="sr-header-info ${hasEntity ? "sr-header-info--clickable" : ""}"
                   @click=${hasEntity ? () => this._toggleSensorExpanded(key) : nothing}>
                <div class="sr-chip">
                  <ha-icon icon=${sensor.icon || "mdi:gauge"}></ha-icon>
                  <span class="sr-chip-name-sizer">
                    <span class="sr-chip-name-measure">${sensor.name || " "}</span>
                    <input class="sr-chip-name" .value=${sensor.name} placeholder="Name"
                           @click=${(e: Event) => e.stopPropagation()}
                           @pointerdown=${(e: Event) => e.stopPropagation()}
                           @input=${(e: InputEvent) => this._updateCustomSensor(i, { name: valueFromEvent(e) })} />
                    </span>
                </div>
                ${primaryTip}
                ${hasEntity ? html`<span class="sr-entity-label">${entityLabel}</span>` : nothing}
              </div>
              <div class="sr-actions">
                <button class="dc-btn dc-btn--del" type="button" title="Remove"
                        @click=${(e: Event) => { e.stopPropagation(); this._removeCustomSensor(i); }}>
                  <ha-icon icon="mdi:delete-outline"></ha-icon>
                </button>
              </div>
            </div>
            ${isExpanded ? this._renderCustomSensor(sensor, i, config, accent) : nothing}
          </div>`;
      }

      const meta = PRESET_META[key];
      if (!meta) return nothing;
      const alertConfig = config.sensors?.alerts?.[key as keyof typeof config.sensors.alerts];
      const entityId = (config.sensors as Record<string, string | undefined>)?.[key] ?? "";
      const sAlertKey = key as "temperature";
      const hasEntity = Boolean(entityId);
      const isExpanded = !hasEntity || this._expandedSensors.includes(key);
      return html`
        <div class="sr-card ${isFirstFilled ? "sr-card--primary" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}"
             data-sensor-index=${String(idx)} data-sensor-key=${key}
             style="--sr-accent: ${accent}"
             @dragover=${this._handleSensorDragOver} @drop=${() => this._handleSensorDropTarget(idx)}>
          <div class="sr-header">
            ${canReorder ? html`
              <div class="sr-drag-handle"
                   draggable="true"
                   @dragstart=${() => this._sensorDragStart(idx)}
                   @dragend=${this._handleSensorDragEnd}
                   @pointerdown=${(e: PointerEvent) => this._handleSensorTouchDragStart(e, idx)}
                   @pointermove=${this._handleSensorTouchDragMove}
                   @pointerup=${this._handleSensorTouchDragEnd}
                   @pointercancel=${this._handleSensorTouchDragCancel}>
                <ha-icon icon="mdi:drag-vertical"></ha-icon>
              </div>
            ` : nothing}
            <div class="sr-header-info ${hasEntity ? "sr-header-info--clickable" : ""}"
                 @click=${hasEntity ? () => this._toggleSensorExpanded(key) : nothing}>
              <div class="sr-chip">
                <ha-icon icon=${meta.icon}></ha-icon>
                <span>${meta.label}</span>
              </div>
              ${primaryTip}
              ${hasEntity ? html`<span class="sr-entity-label">${this.hass?.states[entityId]?.attributes?.friendly_name as string ?? entityId}</span>` : nothing}
            </div>
            <div class="sr-actions"></div>
          </div>
          ${isExpanded ? this._renderPresetSensor(key as string & keyof typeof SENSOR_ACCENT, meta.label, meta.icon, config, meta.domains, accent, alertConfig) : nothing}
        </div>`;
    };

    const collapseSensors = async () => {
      this._showMoreSensors = false;
      await this.updateComplete;
      this.shadowRoot?.querySelector<HTMLElement>('.sensor-more-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    return html`
      <div class="sensor-ordered-list">
          ${repeat(visibleKeys, k => k, (k, vi) => renderSensorRow(k, sensorOrder.indexOf(k), vi === 0))}
      </div>
        ${!this._showMoreSensors ? html`
          <button type="button" class="secondary sensor-more-btn" @click=${() => { this._showMoreSensors = true; }}>More sensors ▾</button>
        ` : html`
          <button type="button" class="secondary sensor-more-btn" @click=${collapseSensors}>Less sensors ▴</button>
          ${hiddenKeys.length ? html`
            <div class="sensor-ordered-list">
              ${repeat(hiddenKeys, k => k, k => renderSensorRow(k, sensorOrder.indexOf(k), false))}
            </div>
          ` : nothing}
          <button type="button" class="sensor-add-row" @click=${this._addCustomSensor.bind(this)}>+ Add custom sensor</button>
          <button type="button" class="secondary sensor-more-btn" @click=${collapseSensors}>Less sensors ▴</button>
        `}
    `;
  }

  private _previewAreaAutomations(roomId?: string): Array<{ entityId: string; name: string; enabled: boolean }> {
    const normalized = (roomId ?? "").trim();
    if (!normalized) return [];

    const automations = this._entityRegistry
      .filter((entry) => entry.area_id === normalized && entry.entity_id.startsWith("automation."))
      .map((entry) => {
        const entity = this.hass?.states?.[entry.entity_id];
        return {
          entityId: entry.entity_id,
          name: String(entity?.attributes?.friendly_name ?? entry.entity_id),
          enabled: entity?.state === "on",
        };
      });

    return [
      ...automations.filter((item) => item.enabled),
      ...automations.filter((item) => !item.enabled),
    ];
  }

  private _renderSensorPreviewPopup(roomName: string, sensors: HeaderSensorPreview[], onClose = () => { this._showHeaderSensorPreviewPopup = false; }, config = this._config) {
    const images = config?.ui?.images ?? {};
    const bgOn = images.background_on ?? "";
    const bgPosY = images.background_position_y ?? 50;
    const darkEnabled = Boolean(bgOn) && images.dark_mode_enabled !== false;
    const backgroundSize = bgOn ? (darkEnabled ? "100% 100%, 100% 100%, cover" : "100% 100%, cover") : "100% 100%";
    const backgroundPosition = bgOn ? (darkEnabled ? `top left, top left, center ${bgPosY}%` : `top left, center ${bgPosY}%`) : "top left";
    const popupStyles = {
      backgroundImage: buildRoomBackgroundImage(bgOn, darkEnabled),
      backgroundSize,
      backgroundPosition,
      backgroundRepeat: "no-repeat",
      backgroundOrigin: "border-box",
      backgroundClip: "border-box",
    };

    return html`
      <smart-area-sensor-popup
        .items=${sensors.map((sensor) => ({ ...sensor, accent: sensor.color, blur: true }))}
        .popupStyles=${popupStyles}
        @sensor-popup-close=${(event: Event) => { event.stopPropagation(); onClose(); }}
      ></smart-area-sensor-popup>
    `;
  }

  private _renderBackgroundImageControls(config: SmartRoomCardConfig) {
    const areaName = this._areaName(config.room_id);
    const images = config.ui?.images ?? {};
    const darkEnabled = images.dark_mode_enabled !== false;
    const darkCond = images.dark_mode_condition ?? "always";
    const bgOn = images.background_on ?? "";
    const bgPosY = images.background_position_y ?? 50;
    const slug = (areaName || "living room").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area";

    return html`
      <div class="panel">
        <div class="panel-title">Background image</div>
        <div class="img-picker-tabs">
          <button type="button" class="img-tab ${this._imgPickerMode === "library" ? "img-tab--active" : ""}"
                  @click=${() => { this._imgPickerMode = "library"; }}>
            <ha-icon icon="mdi:image-multiple-outline"></ha-icon>Library
          </button>
          <button type="button" class="img-tab ${this._imgPickerMode === "path" ? "img-tab--active" : ""}"
                  @click=${() => { this._imgPickerMode = "path"; }}>
            <ha-icon icon="mdi:link-variant"></ha-icon>Path
          </button>
        </div>
        ${this._imgPickerMode === "path" ? html`
          <div class="row single">
            <label>
              <span class="hint">Use a wide, calm image that still reads behind controls.</span>
              <input type="text" .value=${bgOn.startsWith("data:") ? "" : bgOn} placeholder=${`/local/img/areas/${slug}.png`}
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
        ` : html`
          <div class="img-gallery">
            <button type="button" class="img-upload-btn" ?disabled=${this._imgUploading}
                    @click=${this._triggerImageUpload}>
              <ha-icon icon=${this._imgUploading ? "mdi:loading" : "mdi:plus"}></ha-icon>
              ${this._imgUploading ? "Uploading..." : "Upload image"}
            </button>
            ${this._getGallery().map((img) => html`
              <div class="img-gallery-item ${bgOn === img.url ? "img-gallery-item--active" : ""}"
                   @click=${() => {
                     this._setRoomImage("background_on", img.url);
                     this._bgPreviewValid = false;
                     this._bgPreviewError = false;
                     if (!bgOn && images.dark_mode_enabled === undefined) this._setImageKey("dark_mode_enabled", true);
                   }}>
                <img src=${img.url} alt=${img.name} loading="lazy" />
                <button type="button" class="img-gallery-del"
                        @click=${(e: Event) => { e.stopPropagation(); this._removeFromGallery(img.url); if (bgOn === img.url) this._setRoomImage("background_on", ""); }}>
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
            `)}
            ${this._getGallery().length === 0 ? html`<span class="img-gallery-empty">Upload one image to start your room library.</span>` : nothing}
          </div>
          <input type="file" accept="image/*" class="img-file-input" @change=${this._handleImageFile} />
        `}
        ${bgOn && this._bgPreviewError ? this._reqError("Image not found. Check the path or choose another file.") : nothing}
        ${this._bgPreviewValid ? html`
          <div class="bg-crop-control">
            <span class="bg-crop-label">Crop position</span>
            <div class="tile-size-range-wrap" style="--range-pct: ${bgPosY}%">
              <input class="tile-size-range" type="range" min="0" max="100" step="5"
                     .value=${String(bgPosY)}
                     @input=${(e: InputEvent) => this._setImageKey("background_position_y", Number((e.target as HTMLInputElement).value))} />
            </div>
            <div class="bg-crop-labels"><span>Top</span><span>Center</span><span>Bottom</span></div>
          </div>
          <div class="row single">
            ${this._renderToggleField("Use dark version", "Dims the same image when the room is off.", darkEnabled, (checked) => this._setImageKey("dark_mode_enabled", checked))}
          </div>
          ${darkEnabled ? html`
            <div class="row single">
              <label>Switch to dark when
                <select .value=${darkCond} @change=${(e: Event) => this._setImageKey("dark_mode_condition", valueFromEvent(e))}>
                  <option value="always">Room is off</option>
                  <option value="daytime">Room is off during the day</option>
                  <option value="lux">Lux sensor is below threshold</option>
                </select>
              </label>
            </div>
            ${darkCond === "lux" ? html`
              <div class="row single">
                <label>Lux sensor</label>
                ${this._renderClearableEntityPicker(
                  images.dark_mode_lux_entity ?? "",
                  (value) => this._setImageKey("dark_mode_lux_entity", value || undefined),
                  false,
                  { entity: { domain: "sensor", device_class: "illuminance" } },
                  () => this._setImageKey("dark_mode_lux_entity", undefined),
                )}
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
    `;
  }

  private _renderHeaderSection(config: SmartRoomCardConfig) {
    const roomName = config.room?.trim() ?? "";
    const showAreaIcon = config.ui?.show_area_icon ?? false;
    const images = config.ui?.images ?? {};
    const appearanceSummary = [
      roomName || this._areaName(config.room_id) || "Untitled area",
      showAreaIcon ? "icon on" : "icon off",
      images.background_on ? "image set" : "no image",
    ].join(" - ");

    return html`
      <section class="section">
        <div class="section-header" @click=${() => { this._headerCollapsed = !this._headerCollapsed; }}>
          <div>
            <div class="section-title">Appearance</div>
            <div class="section-subtitle">${appearanceSummary}</div>
          </div>
          <button class="section-collapse-btn" @click=${(e: Event) => e.stopPropagation()}>
            <ha-icon icon=${this._headerCollapsed ? "mdi:pencil-outline" : "mdi:chevron-up"}></ha-icon>
          </button>
        </div>

        <div class="section-collapsible ${this._headerCollapsed ? "section-collapsible--collapsed" : ""}">
        <div class="section-collapsible-inner">
          ${this._renderAppearancePreview(config)}

          <div class="row">
            <label>
              Area name
              <span class="hint">Leave empty to show badges without a title.</span>
              <input .value=${config.room ?? ""} @input=${(e: InputEvent) => this._setRoot("room", valueFromEvent(e))} />
            </label>
            ${this._renderCompactCheckField("Show area icon", "Adds the Home Assistant area icon beside the name.", showAreaIcon, (checked) => this._setUi("show_area_icon", checked))}
          </div>

          ${this._renderBackgroundImageControls(config)}
        </div></div>
      </section>
    `;
  }

  private _renderAppearancePreview(config: SmartRoomCardConfig) {
    const roomName = config.room?.trim() ?? "";
    const showAreaIcon = config.ui?.show_area_icon ?? false;
    const areaIcon = (this.hass as import("./types/ha-extensions").HomeAssistantExtended)?.areas?.[config.room_id ?? ""]?.icon ?? "mdi:home-outline";
    const automationEnabled = config.ui?.automation_badge_enabled ?? false;
    const automationClickDetails = config.ui?.automation_badge_click_details !== false;
    const sensorsEnabled = true;
    const sensorClickDetails = config.ui?.header_climate_more_info !== false;
    const previewAutomations = this._previewAreaAutomations(config.room_id);
    const enabledAutomationCount = previewAutomations.filter((item) => item.enabled).length;
    const images = config.ui?.images ?? {};
    const bgOn = images.background_on ?? "";
    const bgPosY = images.background_position_y ?? 50;
    const darkEnabled = Boolean(bgOn) && images.dark_mode_enabled !== false;

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
      <div class="editor-header-preview ${bgOn ? "editor-header-preview--image" : ""}">
        ${bgOn ? html`
          <img class="ehp-bg ehp-bg--on" src=${bgOn} alt=""
            style="object-position: center ${bgPosY}%"
            @load=${() => { this._bgPreviewValid = true; this._bgPreviewError = false; }}
            @error=${() => { this._bgPreviewValid = false; this._bgPreviewError = true; }}
          />
          ${darkEnabled ? html`
            <img class="ehp-bg ehp-bg--off" src=${bgOn} alt="" style="object-position: center ${bgPosY}%" />
            <span class="bg-preview-tag bg-preview-tag--left">ON</span>
            <span class="bg-preview-tag bg-preview-tag--right">OFF</span>
          ` : nothing}
        ` : nothing}
        <div class="ehp-overlay"></div>
        <div class="ehp-top">
          <div class="ehp-title ${roomName ? "" : "ehp-title--empty"}">
            ${showAreaIcon ? html`<ha-icon icon=${areaIcon}></ha-icon>` : nothing}
            ${roomName ? html`<span>${roomName}</span>` : html`<span>${this._areaName(config.room_id) || "Area"}</span>`}
            ${automationEnabled ? html`
              ${automationClickDetails ? html`
                <button
                  type="button"
                  class="ehp-automation-badge"
                  aria-label="Show automation details preview"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._showHeaderAutomationDetails = !this._showHeaderAutomationDetails;
                  }}
                >
                  <ha-icon icon="mdi:home-automation"></ha-icon>
                  <span class="ehp-badge-count">${enabledAutomationCount}</span>
                </button>
              ` : html`
              <span class="ehp-automation-badge" aria-label="${enabledAutomationCount} automations enabled">
                <ha-icon icon="mdi:home-automation"></ha-icon>
                <span class="ehp-badge-count">${enabledAutomationCount}</span>
              </span>
              `}
            ` : nothing}
          </div>
          ${sensorsEnabled && _previewSensors.length ? html`
            ${sensorClickDetails ? html`
            <button
              type="button"
              class="ehp-sensors ehp-sensor-click-target"
              aria-label="Open sensor details preview"
              @click=${(e: Event) => {
                e.stopPropagation();
                void this._ensureSensorPopupElement();
                this._showHeaderSensorPreviewPopup = true;
              }}
            >
              ${_previewSensors.map((s, i) => html`
                <span class="ehp-sensor-item ${i === 0 ? "ehp-sensor-item--primary" : ""}">
                  <ha-icon icon=${s.icon}></ha-icon>
                  <span>${s.value}</span>
                </span>
              `)}
            </button>
            ` : html`
            <div class="ehp-sensors">
              ${_previewSensors.map((s, i) => html`
                <span class="ehp-sensor-item ${i === 0 ? "ehp-sensor-item--primary" : ""}">
                  <ha-icon icon=${s.icon}></ha-icon>
                  <span>${s.value}</span>
                </span>
              `)}
            </div>
            `}
          ` : nothing}
        </div>
        ${automationEnabled && automationClickDetails && this._showHeaderAutomationDetails ? html`
          <div class="ehp-automation-panel">
            <ha-icon icon="mdi:home-automation"></ha-icon>
            <div class="ehp-automation-list">
              ${previewAutomations.length
                ? previewAutomations.map((item) => html`
                    <div class="ehp-automation-item ${item.enabled ? "" : "ehp-automation-item--disabled"}">
                      ${item.name}
                      <span>${item.enabled ? "enabled" : "disabled"}</span>
                    </div>
                  `)
                : html`<div class="ehp-automation-item ehp-automation-item--disabled">No automations in this area</div>`}
            </div>
          </div>
        ` : nothing}
        ${sensorsEnabled && this._showHeaderSensorPreviewPopup ? this._renderSensorPreviewPopup(roomName, _previewSensors) : nothing}
      </div>
    `;
  }

  private _renderAutomationsSection(config: SmartRoomCardConfig) {
    const automationEnabled = config.ui?.automation_badge_enabled ?? false;
    const automationClickDetails = config.ui?.automation_badge_click_details !== false;
    const previewAutomations = this._previewAreaAutomations(config.room_id);
    const enabledAutomationCount = previewAutomations.filter((item) => item.enabled).length;
    const summary = automationEnabled ? `${enabledAutomationCount} enabled` : "Hidden";

    return html`
      <section class="section">
        <div class="section-header" @click=${() => { this._automationsCollapsed = !this._automationsCollapsed; }}>
          <div>
            <div class="section-title">Automations</div>
            <div class="section-subtitle">${summary}</div>
          </div>
          <button class="section-collapse-btn" @click=${(e: Event) => e.stopPropagation()}>
            <ha-icon icon=${this._automationsCollapsed ? "mdi:pencil-outline" : "mdi:chevron-up"}></ha-icon>
          </button>
        </div>

        <div class="section-collapsible ${this._automationsCollapsed ? "section-collapsible--collapsed" : ""}">
        <div class="section-collapsible-inner">
          <div class="row single">
            ${this._renderToggleField("Show automation count", "Shows enabled automations in the appearance preview and card header.", automationEnabled, (checked) => this._setUi("automation_badge_enabled", checked), !this._isRoomIdValid(config.room_id))}
          </div>
          ${automationEnabled ? html`
            <div class="row single">
              ${this._renderCompactCheckField("Open details on click", "Lets the automation badge reveal area automation details.", automationClickDetails, (checked) => this._setUi("automation_badge_click_details", checked))}
            </div>
          ` : nothing}
        </div></div>
      </section>
    `;
  }

  private _renderSensorsSection(config: SmartRoomCardConfig) {
    const sensorClickDetails = config.ui?.header_climate_more_info !== false;
    const sensorOrder = getNormalizedSensorOrder(config.sensors, config.sensors?.custom?.length ?? 0);
    const configuredLabels = sensorOrder.flatMap((key) => {
      if (key.startsWith("custom_")) {
        const index = Number(key.slice(7));
        const sensor = config.sensors?.custom?.[index];
        return sensor?.entity ? [sensor.name?.trim() || `Custom ${index + 1}`] : [];
      }
      return (config.sensors as Record<string, unknown> | undefined)?.[key]
        ? [SENSOR_PREVIEW_LABELS[key] || key]
        : [];
    });
    const summary = configuredLabels.length ? configuredLabels.join(", ") : "None configured";

    return html`
      <section class="section">
        <div class="section-header" @click=${() => { this._sensorsCollapsed = !this._sensorsCollapsed; }}>
          <div>
            <div class="section-title">Sensors</div>
            <div class="section-subtitle">${summary}</div>
          </div>
          <button class="section-collapse-btn" @click=${(e: Event) => e.stopPropagation()}>
            <ha-icon icon=${this._sensorsCollapsed ? "mdi:pencil-outline" : "mdi:chevron-up"}></ha-icon>
          </button>
        </div>

        <div class="section-collapsible ${this._sensorsCollapsed ? "section-collapsible--collapsed" : ""}">
        <div class="section-collapsible-inner">
          ${this._renderSensorHeaderPreview(config, sensorClickDetails)}
          ${this._renderSensors(config)}
        </div></div>
      </section>
    `;
  }

  private _previewHeaderSensors(config: SmartRoomCardConfig, maxItems = 6): HeaderSensorPreview[] {
    const sensorOrder = getNormalizedSensorOrder(config.sensors, config.sensors?.custom?.length ?? 0);
    const sensors: HeaderSensorPreview[] = [];
    for (const key of sensorOrder) {
      if (sensors.length >= maxItems) break;
      if (key.startsWith("custom_")) {
        const customIndex = Number(key.slice(7));
        const sensor = config.sensors?.custom?.[customIndex];
        if (!sensor?.entity) continue;
        const entity = this.hass?.states[sensor.entity];
        if (!entity || entity.state === "unavailable" || entity.state === "unknown") continue;
        const unit = entity.attributes["unit_of_measurement"] as string | undefined ?? "";
        sensors.push({
          key,
          icon: sensor.icon || "mdi:gauge",
          value: `${entity.state}${unit ? ` ${unit}` : ""}`,
          label: sensor.name || `Sensor ${customIndex + 1}`,
          entityId: sensor.entity,
          color: CUSTOM_SENSOR_COLORS[customIndex % CUSTOM_SENSOR_COLORS.length],
        });
        continue;
      }

      const entityId = (config.sensors as Record<string, unknown> | undefined)?.[key] as string | undefined;
      if (!entityId) continue;
      const entity = this.hass?.states[entityId];
      if (!entity || entity.state === "unavailable" || entity.state === "unknown") continue;
      const unit = entity.attributes["unit_of_measurement"] as string | undefined ?? "";
      const raw = entity.state;
      const value = key === "temperature" && Number.isFinite(Number(raw))
        ? `${Number(raw).toFixed(1)}${unit || "\u00b0"}`
        : `${raw}${unit ? ` ${unit}` : ""}`;
      const icon = (config.sensors?.icons as Record<string, string> | undefined)?.[key] || SENSOR_PREVIEW_ICONS[key] || "mdi:gauge";
      sensors.push({
        key,
        icon,
        value,
        label: SENSOR_PREVIEW_LABELS[key] || key,
        entityId,
        color: SENSOR_ACCENT[key] ?? "#94a3b8",
      });
    }
    return sensors;
  }

  private _renderSensorHeaderPreview(config: SmartRoomCardConfig, sensorClickDetails: boolean) {
    const sensors = this._previewHeaderSensors(config);
    const images = config.ui?.images ?? {};
    const bgOn = images.background_on ?? "";
    const bgPosY = images.background_position_y ?? 50;
    const { height } = resolveDeviceTileSize(config.ui);
    const previewHeight = Math.max(116, Math.min(168, height + 36));
    const roomName = config.room?.trim() || this._areaName(config.room_id) || "Area";
    const openPreview = (event: Event) => {
      event.stopPropagation();
      if (!sensorClickDetails || !sensors.length) return;
      void this._ensureSensorPopupElement();
      this._showSensorHeaderPreviewPopup = true;
    };
    return html`
      <div class="sensor-preview-composition" style="--sensor-preview-height: ${previewHeight}px">
        <div class="sensor-header-preview-frame ${bgOn ? "sensor-header-preview-frame--image" : ""}">
          ${bgOn ? html`<img src=${bgOn} alt="" style="object-position: center ${bgPosY}%" />` : nothing}
          <div class="sensor-header-preview-mask"></div>
          ${sensorClickDetails && sensors.length ? html`
          <button
            type="button"
            class="sensor-header-preview-strip sensor-header-preview-strip--clickable"
            aria-label="Open sensor details preview"
            @click=${openPreview}
          >
            ${sensors.length ? sensors.map((sensor, index) => html`
              <span class="sensor-header-preview-item ${index === 0 ? "sensor-header-preview-item--primary" : ""}">
                <ha-icon icon=${sensor.icon}></ha-icon>
                <span>${sensor.value}</span>
              </span>
            `) : html`<span class="sensor-header-preview-empty">No sensors selected</span>`}
          </button>
          ` : html`
          <div class="sensor-header-preview-strip">
            ${sensors.length ? sensors.map((sensor, index) => html`
              <span class="sensor-header-preview-item ${index === 0 ? "sensor-header-preview-item--primary" : ""}">
                <ha-icon icon=${sensor.icon}></ha-icon>
                <span>${sensor.value}</span>
              </span>
            `) : html`<span class="sensor-header-preview-empty">No sensors selected</span>`}
          </div>
          `}
        </div>
        <div class="sensor-preview-option">
          ${this._renderCompactCheckField("Open details on click", "Lets the sensor strip open a compact details preview.", sensorClickDetails, (checked) => {
            if (!checked) this._showSensorHeaderPreviewPopup = false;
            this._setUi("header_climate_more_info", checked);
          })}
        </div>
        ${sensorClickDetails && this._showSensorHeaderPreviewPopup ? this._renderSensorPreviewPopup(roomName, sensors, () => { this._showSensorHeaderPreviewPopup = false; }, config) : nothing}
      </div>
    `;
  }

  private _renderPresetSensor(
    key: string,
    _label: string,
    _icon: string,
    config: SmartRoomCardConfig,
    domains: string[] = ["sensor"],
    _accent = "#9aa7b6",
    alertConfig?: { enabled?: boolean; min?: number; max?: number; eq?: number | string },
  ) {
    const entityId = (config.sensors as Record<string, string | undefined>)?.[key] ?? "";
    const hasRoomId = Boolean(this._config?.room_id?.trim());
    const filterEntry = (config.sensors?.filters as Record<string, { restrict_to_room_area?: boolean } | undefined> | undefined)?.[key];
    const restrictToRoom = hasRoomId && filterEntry?.restrict_to_room_area !== false;
    const isPresence = key === "presence";
    const numericAlertConfig = !isPresence ? (alertConfig as SmartRoomNumericSensorAlert | undefined) : undefined;
    const deviceClasses = SENSOR_DEVICE_CLASSES[key];
    const sAlertKey = key as "temperature";
    const sFilterKey = key as "temperature";
    const batteryConfig = config.sensors?.batteries?.[sAlertKey];
    const batteryRestrict = hasRoomId && batteryConfig?.restrict_to_room_area !== false;
    const presenceAlertConfig = isPresence ? (alertConfig as import("./helpers").SmartRoomPresenceSensorAlert | undefined) : undefined;
    return html`
      <div class="sr-body">
        <div class="sensor-row-body">
          ${this._renderSmartEntityPicker(entityId, (v) => this._setSensor(key, v), domains, deviceClasses, restrictToRoom, this._config?.room_id, (showAll) => this._setSensorFilter(sFilterKey, "restrict_to_room_area", !showAll), false, () => this._setSensor(key, ""))}
        </div>
        ${entityId ? html`
          ${this._renderSensorBatteryField(
            batteryConfig?.entity ?? "",
            batteryConfig?.alert_enabled !== false,
            batteryRestrict,
            key,
            (value) => this._setSensorBattery(sAlertKey, "entity", value || undefined),
            (checked) => this._setPresetSensorBatteryAlertEnabled(sAlertKey, checked),
            (showAll) => this._setSensorBattery(sAlertKey, "restrict_to_room_area", !showAll),
            () => this._setSensorBattery(sAlertKey, "entity", undefined),
          )}
          <div class="sr-alert-group">
            <div class="sr-alert-group-label">Alert triggers</div>
            <div class="sensor-alert-row">
              ${isPresence ? html`
                <label>Is<input type="text" .value=${presenceAlertConfig?.eq ?? ""} placeholder="e.g. on" @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "eq", (e.target as HTMLInputElement).value || undefined)} /></label>
                <label>Is not<input type="text" .value=${presenceAlertConfig?.neq ?? ""} placeholder="e.g. off" @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "neq", (e.target as HTMLInputElement).value || undefined)} /></label>
              ` : html`
                <label>Min<input type="number" .value=${typeof numericAlertConfig?.min === "number" ? String(numericAlertConfig.min) : ""} @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "min", toNumberOrUndefined(valueFromEvent(e)))} /></label>
                <label>Max<input type="number" .value=${typeof numericAlertConfig?.max === "number" ? String(numericAlertConfig.max) : ""} @input=${(e: InputEvent) => this._setSensorAlert(sAlertKey, "max", toNumberOrUndefined(valueFromEvent(e)))} /></label>
              `}
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderCustomSensor(sensor: import("./helpers").SmartRoomCustomSensor, i: number, _config: SmartRoomCardConfig, _accent = "#9aa7b6") {
    const hasRoomId = Boolean(this._config?.room_id?.trim());
    const restrictToRoom = hasRoomId && sensor.restrict_to_room_area === true;
    const batteryRestrict = hasRoomId && sensor.battery_restrict_to_room_area !== false;
    return html`
      <div class="sr-body">
        <div class="sensor-row-body">
          ${this._renderSmartEntityPicker(sensor.entity ?? "", (v) => this._setCustomSensorEntity(i, v), ["sensor"], undefined, restrictToRoom, this._config?.room_id, (showAll) => this._updateCustomSensor(i, { restrict_to_room_area: !showAll }), false, () => this._setCustomSensorEntity(i, ""))}
          ${sensor.entity ? this._renderIconPicker(sensor.icon ?? "", false, (v) => this._updateCustomSensor(i, { icon: v || undefined })) : nothing}
        </div>
        ${sensor.entity ? html`
          ${this._renderSensorBatteryField(
            sensor.battery ?? "",
            sensor.battery_alert_enabled !== false,
            batteryRestrict,
            `custom_${i}`,
            (value) => this._setCustomSensorBattery(i, value),
            (checked) => this._setCustomSensorBatteryAlertEnabled(i, checked),
            (showAll) => this._updateCustomSensor(i, { battery_restrict_to_room_area: !showAll }),
            () => this._setCustomSensorBattery(i, ""),
          )}
          <div class="sr-alert-group">
            <div class="sr-alert-group-label">Alert triggers</div>
            <div class="sensor-alert-row">
              <label>Is<input type="text" .value=${sensor.alert?.text_eq ?? ""} placeholder="state text" @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "text_eq", valueFromEvent(e) || undefined)} /></label>
              <label>Is not<input type="text" .value=${sensor.alert?.text_neq ?? ""} placeholder="state text" @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "text_neq", valueFromEvent(e) || undefined)} /></label>
              <label>Min<input type="number" .value=${sensor.alert?.min !== undefined ? String(sensor.alert.min) : ""} @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "min", toNumberOrUndefined(valueFromEvent(e)))} /></label>
              <label>Max<input type="number" .value=${sensor.alert?.max !== undefined ? String(sensor.alert.max) : ""} @input=${(e: InputEvent) => this._updateCustomSensorAlert(i, "max", toNumberOrUndefined(valueFromEvent(e)))} /></label>
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderSensorBatteryField(
    value: string,
    alertEnabled: boolean,
    restrictToRoom: boolean,
    batteryKey: string,
    onEntity: (value: string) => void,
    onAlertEnabled: (checked: boolean) => void,
    onToggleShowAll: (showAll: boolean) => void,
    onClear: () => void,
  ) {
    const trimmed = value.trim();
    const threshold = this._config?.ui?.battery_threshold ?? 20;
    const isExpanded = Boolean(trimmed) || this._expandedSensorBatteries.includes(batteryKey);
    return html`
      <div class="sensor-battery-card ${isExpanded ? "sensor-battery-card--expanded" : ""}">
        <button
          type="button"
          class="sensor-battery-title"
          aria-expanded=${String(isExpanded)}
          @click=${() => this._toggleSensorBatteryExpanded(batteryKey)}
        >
          <ha-icon icon="mdi:battery-outline"></ha-icon>
          <span>Battery</span>
          ${trimmed ? html`<span class="sensor-battery-status">${this.hass?.states[trimmed]?.attributes?.friendly_name as string | undefined ?? trimmed}</span>` : nothing}
          <ha-icon class="sensor-battery-chevron" icon=${isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon>
        </button>
        ${isExpanded ? html`
          ${this._renderSmartEntityPicker(trimmed, onEntity, ["sensor"], ["battery"], restrictToRoom, this._config?.room_id, onToggleShowAll, false, onClear)}
          ${trimmed ? html`
            ${!this._isEntityValid(trimmed) ? html`<span class="hint">Battery is not valid yet.</span>` : nothing}
            <label class="compact-check battery-alert-check">
              <input type="checkbox" .checked=${alertEnabled} @change=${(e: Event) => onAlertEnabled((e.target as HTMLInputElement).checked)} />
              <span class="compact-check-copy">
                <span class="compact-check-title">Enable battery alert (<= ${threshold}%)</span>
                <span class="compact-check-desc">Uses the card-level battery threshold for this header sensor.</span>
              </span>
            </label>
          ` : nothing}
        ` : nothing}
      </div>
    `;
  }

  private _renderDevices(config: SmartRoomCardConfig) {
    const tilePreset = resolveDeviceTileSize(config.ui);
    const setTilePreset = (width: number, height: number) => this._patch({ ui: { ...(this._config?.ui ?? {}), device_tile_width: width, device_tile_height: height } });
    return html`
      <section class="section">
        <div class="devices-header">
          <div>
            <div class="section-title">Devices</div>
            <div class="section-subtitle">Drag to reorder. Tap to edit.</div>
          </div>
        </div>
        <div class="tile-size-control">
          <div class="tile-size-slider">
            <div class="tile-size-label">
              <span>Tile size</span>
              <span>Applies width and height together.</span>
            </div>
            <div class="tile-size-options tile-size-options--preset">
              ${DEVICE_TILE_SIZE_PRESETS.map((option) => {
                const active = tilePreset.label === option.label;
                return html`
                <button
                  class="tile-size-option ${active ? "tile-size-option--active" : ""}"
                  type="button"
                  aria-pressed=${String(active)}
                  @click=${() => setTilePreset(option.width, option.height)}
                >
                  <span>${option.label}</span>
                </button>
              `})}
            </div>
          </div>
        </div>
        ${this._renderDeviceGridPreview(config)}
        <div class="devices-list">
          ${(config.devices ?? []).map((device, index) => this._renderDevice(device, index))}
        </div>
        <button class="dc-add-btn" type="button" @click=${() => { this._showAddTypePicker = true; }}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Add device
        </button>
        ${this._showAddTypePicker ? this._renderAddTypePicker() : nothing}
        <input type="file" accept="image/*" class="dev-img-file-input" @change=${this._handleDeviceImageFile} />
      </section>
    `;
  }

  private _renderDeviceGridPreview(config: SmartRoomCardConfig) {
    const devices = config.devices ?? [];
    const { width: tileWidth, height: tileHeight } = resolveDeviceTileSize(config.ui);
    const gridStyle = `grid-template-columns: repeat(auto-fill, minmax(${tileWidth}px, 1fr)); --sr-tile-width: ${tileWidth}px; --sr-tile-height: ${tileHeight}px; --sr-tile-size: ${tileHeight}px`;
    return html`
      <div class="dg-preview">
        <div class="dg-preview-grid" style=${gridStyle}>
          ${devices.map((device, index) => {
            const type = device.type ?? "custom";
            const isDragging = this._dragIndex === index;
            const isDropTarget = this._dropIndex === index && this._dragIndex !== index;
            const isActive = this._expandedDevices.includes(index);
            const rawName = device.name || (device.entity ? device.entity.split(".").pop()?.replace(/_/g, " ") ?? "" : "") || `Device ${index + 1}`;
            const previewImg = normalizeAssetPath(device.image || device.image_on || device.image_off, "product");
            return html`
              <div class="dg-preview-tile dg-tile--${type} ${isDragging ? "dg-tile--dragging" : ""} ${isDropTarget ? "dg-tile--drop" : ""} ${isActive ? "dg-preview-tile--active" : ""}"
                   data-device-index=${String(index)}
                   draggable="true"
                   @dragstart=${() => this._handleDragStart(index)}
                   @dragend=${this._handleDragEnd}
                   @dragover=${this._handleDragOver}
                   @drop=${() => this._handleDrop(index)}
                   @pointerdown=${(e: PointerEvent) => this._handleTouchDragStart(e, index)}
                   @pointermove=${this._handleTouchDragMove}
                   @pointerup=${this._handleTouchDragEnd}
                   @pointercancel=${this._handleTouchDragCancel}
                   @click=${async () => {
                     const wasExpanded = this._expandedDevices.includes(index);
                     this._toggleDeviceExpanded(index);
                     if (!wasExpanded) {
                       await this.updateComplete;
                       this.shadowRoot?.querySelector<HTMLElement>(`.device-card[data-device-index="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                     }
                   }}>
                ${previewImg ? html`
                  <div class="dg-preview-tile-visual">
                    <img src=${previewImg} alt="" />
                  </div>
                ` : nothing}
                <div class="dg-preview-tile-label">
                  ${!previewImg ? html`<ha-icon class="dg-preview-tile-icon" icon=${this._typeIcon(type)}></ha-icon>` : nothing}
                  <div class="dg-preview-tile-name">${rawName}</div>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private _renderAddTypePicker() {
    return html`
      <div class="add-type-picker">
        <div class="add-type-header">
          <span class="add-type-title">Choose device type</span>
          <button class="dc-btn" type="button" title="Cancel" @click=${() => { this._showAddTypePicker = false; }}>
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="add-type-grid">
          ${this._typeDefinitions.map((type) => html`
            <button type="button" class="add-type-btn" style="--atp-color: ${type.editor_color};"
                    @click=${() => this._addDevice(type.id)}>
              <span class="add-type-btn-icon"><ha-icon icon=${this._typeIcon(type.id)}></ha-icon></span>
              <span class="add-type-btn-label">${type.label}</span>
            </button>
          `)}
        </div>
      </div>
    `;
  }

  private _renderDevice(device: SmartRoomDeviceConfig, index: number) {
    const expanded = this._expandedDevices.includes(index);
    const entityRequired = this._isEntityRequired(device);
    const roomReady = this._isRoomIdValid(this._config?.room_id);
    const entityValid = this._isEntityValid(device.entity) && this._isEntityAllowedForDevice(device, device.entity);
    const configBlocked = !roomReady || (entityRequired && !entityValid);
    const type = device.type ?? "custom";
    return html`
      <section class="device-card ${expanded ? "device-card--editing" : ""} ${this._dragIndex === index ? "dragging" : ""} ${this._dropIndex === index && this._dragIndex !== index ? "drop-target" : ""}"
               data-type=${type} data-device-index=${String(index)}
               @dragover=${this._handleDragOver} @drop=${() => this._handleDrop(index)}>
        <div class="dc-header">
          <div class="dc-drag-handle"
               draggable="true"
               @dragstart=${() => this._handleDragStart(index)}
               @dragend=${this._handleDragEnd}
               @pointerdown=${(e: PointerEvent) => this._handleTouchDragStart(e, index)}
               @pointermove=${this._handleTouchDragMove}
               @pointerup=${this._handleTouchDragEnd}
               @pointercancel=${this._handleTouchDragCancel}>
            <ha-icon icon="mdi:drag-vertical"></ha-icon>
          </div>
          <div class="dc-header-content" @click=${() => this._toggleDeviceExpanded(index)}>
            <div class="dc-badge">
              <ha-icon icon=${this._typeIcon(type)}></ha-icon>
            </div>
            <div class="dc-info">
              <span class="dc-name">${device.name || device.entity || `Device ${index + 1}`}</span>
              ${device.entity ? html`<span class="dc-entity">${device.entity}</span>` : nothing}
            </div>
          </div>
          <div class="dc-actions">
            <button class="dc-btn dc-btn--dup" type="button" title="Duplicate" @click=${(e: Event) => { e.stopPropagation(); this._duplicateDevice(index); }}>
              <ha-icon icon="mdi:content-copy"></ha-icon>
            </button>
            <button class="dc-btn dc-btn--del" type="button" title="Remove" @click=${(e: Event) => { e.stopPropagation(); this._confirmRemoveDevice(index); }}>
              <ha-icon icon="mdi:delete-outline"></ha-icon>
            </button>
          </div>
        </div>
        ${expanded ? html`
          <div class="dc-panels">
            ${this._renderIdentityPanel(device, index, entityRequired, entityValid)}
            ${configBlocked ? html`
              <div class="panel locked-panel">
                <div class="panel-title">${!roomReady ? "Area ID required" : "Entity required"}</div>
                <div class="required-note">${!roomReady ? "Set a valid Area ID first." : "Enter a valid entity to unlock visuals, states and actions."}</div>
              </div>
            ` : html`
              ${this._renderVisualsPanel(device, index)}
              ${this._renderActionsPanel(device, index)}
              ${!this._isDeviceAdvanced(index) ? html`
                <div class="row single"><button type="button" class="secondary" @click=${() => this._setDeviceAdvanced(index, true)}>Advanced settings</button></div>
              ` : html`
                ${this._renderStatesPanel(device, index)}
                <div class="row single"><button type="button" class="secondary" @click=${() => this._setDeviceAdvanced(index, false)}>Back to simple device setup</button></div>
              `}
            `}
          </div>
        ` : nothing}
      </section>
    `;
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
          <div class="field-title">Battery</div>
          <span class="hint">Battery source.</span>
          ${this._renderSmartEntityPicker(device.battery ?? "", (value) => this._setDevice(index, "battery", value), ["sensor"], ["battery"], batteryRestrict, roomId, (showAll) => this._setDeviceSelector(index, "battery", { ...(device.entity_selectors?.["battery"] ?? {}), restrict_to_room_area: !showAll, domains: ["sensor"] }))}
          ${device.battery?.trim() ? html`${!this._isEntityValid(device.battery) ? html`<span class="hint">Battery is not valid yet.</span>` : nothing}${this._renderCompactCheckField("Show battery level", "Shows the battery icon and percentage on the device tile.", device.show_battery !== false, (checked) => this._setDevice(index, "show_battery", checked))}${this._renderCompactCheckField(`Enable battery alert (<= ${this._config?.ui?.battery_threshold ?? 20}%)`, "Derives a low battery alert using the card-level battery alert settings.", device.battery_alert_enabled !== false, (checked) => this._setDevice(index, "battery_alert_enabled", checked))}` : html`<span class="hint">Optional. Creates a low battery alert and shows battery level on the tile.</span>`}
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
    deviceType?: string,
    pickerId = "default-image",
  ) {
    return html`<div class="panel ${toneClass}">
      <div class="panel-title">Visuals</div>
      ${description ? html`<div class="hint">${description}</div>` : nothing}
      <div class="field-help">Main tile image. State images override it. Transparent PNG recommended.</div>
      ${this._renderDeviceImagePicker(pickerId, imageValue, onImageChange, deviceType)}
    </div>`;
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
      device.type,
      `device-${index}-img`,
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
      ? html`<div class="field-card"><div class="field-title">${label}</div><span class="hint">${hint}</span>${this._renderClearableEntityPicker(value, onChange)}${example ? html`<span class="hint">${example}</span>` : nothing}</div>`
      : html`<label>${label}<span class="hint">${hint}</span>${options?.length
      ? html`<select .value=${value} @change=${(e: Event) => onChange(valueFromEvent(e))}>${options.map((option) => html`<option value=${option}>${option}</option>`)}</select>`
      : html`<input .value=${value} @input=${(e: InputEvent) => onChange(valueFromEvent(e))} />`}${example ? html`<span class="hint">${example}</span>` : nothing}</label>`;
  }

  private _renderEntityClearButton(onClear: () => void, disabled = false) {
    if (disabled) return nothing;
    return html`
      <button type="button" class="entity-clear-x" aria-label="Clear entity" @click=${(e: Event) => { e.stopPropagation(); onClear(); }}>
        <ha-icon icon="mdi:close"></ha-icon>
      </button>
    `;
  }

  private _renderClearableEntityPicker(
    value: string,
    onChange: (value: string) => void,
    disabled = false,
    selector: Record<string, unknown> = { entity: {} },
    onClear: () => void = () => onChange(""),
  ) {
    return html`
      <div class="entity-field-wrap">
        ${this._renderEntityPicker(value, onChange, disabled, selector)}
        ${this._renderEntityClearButton(onClear, disabled)}
      </div>
    `;
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
    const normalizedValue = value.trim();
    const areaEntityIds = hasRoom
      ? this._areaEntityIdsFiltered(areaId, domains, deviceClasses)
      : [];
    const canRestrictToArea = !normalizedValue || areaEntityIds.includes(normalizedValue);
    const effectiveRestrictToArea = restrictToArea && canRestrictToArea;
    const selectorRestricted = this._entitySelectorFiltered(domains, true, areaId, deviceClasses);
    const selectorAll = this._entitySelectorFiltered(domains, false, areaId, deviceClasses);
    const clear = onClear ?? (() => onChange(""));
    return html`
      <div class="entity-field-wrap" style=${effectiveRestrictToArea ? "" : "display:none"}>
        ${this._renderEntityPicker(value, onChange, disabled, selectorRestricted)}
        ${this._renderEntityClearButton(clear, disabled)}
      </div>
      <div class="entity-field-wrap" style=${!effectiveRestrictToArea ? "" : "display:none"}>
        ${this._renderEntityPicker(value, onChange, disabled, selectorAll)}
        ${this._renderEntityClearButton(clear, disabled)}
      </div>
      ${hasRoom && !disabled ? html`<label class="show-all-check ${canRestrictToArea ? "" : "is-disabled"}"><input type="checkbox" .checked=${effectiveRestrictToArea} ?disabled=${!canRestrictToArea} @change=${(e: Event) => onToggleShowAll(!(e.target as HTMLInputElement).checked)} /><span>Show entities from ${areaLabel}</span></label>` : nothing}
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

  private _presetEditorKey(deviceIndex: number, kind: "state" | "alert", itemIndex: number, item: { preset_source?: string }): string {
    return `${kind}:${deviceIndex}:${item.preset_source ?? "preset"}:${itemIndex}`;
  }

  private _isPresetEditorExpanded(key: string): boolean {
    return this._expandedPresetItems.includes(key);
  }

  private _togglePresetEditor(key: string): void {
    this._expandedPresetItems = this._expandedPresetItems.includes(key)
      ? this._expandedPresetItems.filter((item) => item !== key)
      : [...this._expandedPresetItems, key];
  }

  private _renderSharedNamedStateCard(
    item: SmartRoomNamedStateConfig,
    options: {
      onUpdate: (key: keyof SmartRoomNamedStateConfig, value: unknown) => void;
      onConditions: (next: ConditionConfig[]) => void;
      onRemove?: () => void;
      onReset?: () => void;
      onToggleCollapsed?: () => void;
      entityOptions?: string[];
      lockMode: "none" | "first" | "all";
      selectorDefaults?: { domains?: string[]; restrict_to_room_area?: boolean };
      showPresetBanner?: boolean;
      allowPresetNameEdit?: boolean;
      collapsed?: boolean;
    },
  ) {
    const {
      onUpdate,
      onConditions,
      onRemove,
      onReset,
      onToggleCollapsed,
      lockMode,
      selectorDefaults,
      showPresetBanner = true,
      allowPresetNameEdit = false,
      collapsed = false,
    } = options;
    const presetBanner = item.preset && showPresetBanner ? html`
      <div class="preset-banner">
        <div class="preset-copy">
          <div><strong>${item.name?.trim() || `Default ${this._presetLabel(item.preset_source)} state`}</strong></div>
          <div>You can edit this default type configuration, but it cannot be removed.</div>
        </div>
        <div class="preset-actions">
          ${onReset ? html`<button type="button" class="secondary" @click=${onReset}>Reset</button>` : nothing}
          ${onToggleCollapsed ? html`
            <button type="button" class="secondary preset-edit-button" title=${collapsed ? "Edit" : "Hide"} @click=${onToggleCollapsed}>
              <ha-icon icon=${collapsed ? "mdi:pencil-outline" : "mdi:chevron-up"}></ha-icon>
            </button>
          ` : nothing}
        </div>
      </div>
    ` : nothing;
    return html`<div class="condition-card condition-card-state ${item.preset ? "preset-locked" : ""}">
      ${presetBanner}
      ${collapsed ? nothing : html`
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
      </div>
      ${this._renderConditionsSection("Conditions", "All conditions must be true for this state to be active. If any condition is false, it becomes inactive.", this._renderConditionList(item.conditions, onConditions, lockMode, selectorDefaults))}
      ${onRemove ? html`<button type="button" class="secondary" @click=${onRemove}>Remove state</button>` : nothing}
      ${item.preset && onToggleCollapsed ? html`
        <button type="button" class="secondary preset-hide-bottom" @click=${onToggleCollapsed}>
          <ha-icon icon="mdi:chevron-up"></ha-icon>
          <span>Hide</span>
        </button>
      ` : nothing}
      `}
    </div>`;
  }

  private _renderNamedStates(index: number, states: SmartRoomNamedStateConfig[] | undefined) {
    const device = (this._config?.devices ?? [])[index];
    const items = states ?? [];
    return html`${items.map((item, itemIndex) => {
      const presetKey = item.preset ? this._presetEditorKey(index, "state", itemIndex, item) : "";
      const expanded = !item.preset || this._isPresetEditorExpanded(presetKey);
      return this._renderSharedNamedStateCard(item, {
        onUpdate: (key, value) => this._updateNamedState(index, itemIndex, key, value),
        onConditions: (next) => this._updateNamedState(index, itemIndex, "conditions", next),
        onRemove: item.preset ? undefined : () => this._removeNamedState(index, itemIndex),
        onReset: item.preset ? () => this._resetPresetState(index, itemIndex) : undefined,
        onToggleCollapsed: item.preset ? () => this._togglePresetEditor(presetKey) : undefined,
        lockMode: item.preset ? "first" : "none",
        selectorDefaults: { restrict_to_room_area: device ? this._deviceRestrictsToRoomArea(device) : false, domains: ["*"] },
        collapsed: item.preset && !expanded,
      });
    })}<button type="button" class="secondary" @click=${() => this._addNamedState(index)}>Add state</button>`;
  }

  private _renderSharedNamedAlertCard(
    item: SmartRoomNamedAlertConfig,
    options: {
      onUpdate: (key: keyof SmartRoomNamedAlertConfig, value: unknown) => void;
      onConditions: (next: ConditionConfig[]) => void;
      onRemove?: () => void;
      onReset?: () => void;
      onToggleCollapsed?: () => void;
      lockMode: "none" | "first" | "all";
      batteryLocked?: boolean;
      selectorDefaults?: { domains?: string[]; restrict_to_room_area?: boolean };
      showPresetBanner?: boolean;
      allowPresetNameEdit?: boolean;
      collapsed?: boolean;
    },
  ) {
    const {
      onUpdate,
      onConditions,
      onRemove,
      onReset,
      onToggleCollapsed,
      lockMode,
      batteryLocked = false,
      selectorDefaults,
      showPresetBanner = true,
      allowPresetNameEdit = false,
      collapsed = false,
    } = options;
    const presetTitle = item.preset_source === "battery"
      ? "Battery alert"
      : (item.name?.trim() || `Default ${this._presetLabel(item.preset_source)} alert`);
    const presetDescription = item.preset_source === "battery"
      ? "Synced with Battery and threshold. You can edit this default battery alert, but it cannot be removed."
      : "You can edit this default type configuration, but it cannot be removed.";
    const presetBanner = item.preset && showPresetBanner ? html`
      <div class="preset-banner">
        <div class="preset-copy">
          <div><strong>${presetTitle}</strong></div>
          <div>${presetDescription}</div>
        </div>
        <div class="preset-actions">
          ${onReset ? html`<button type="button" class="secondary" @click=${onReset}>Reset</button>` : nothing}
          ${onToggleCollapsed ? html`
            <button type="button" class="secondary preset-edit-button" title=${collapsed ? "Edit" : "Hide"} @click=${onToggleCollapsed}>
              <ha-icon icon=${collapsed ? "mdi:pencil-outline" : "mdi:chevron-up"}></ha-icon>
            </button>
          ` : nothing}
        </div>
      </div>
    ` : nothing;
    return html`<div class="condition-card condition-card-alert ${item.preset ? "preset-locked" : ""}">
      ${presetBanner}
      ${collapsed ? nothing : html`
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
      ${item.preset && onToggleCollapsed ? html`
        <button type="button" class="secondary preset-hide-bottom" @click=${onToggleCollapsed}>
          <ha-icon icon="mdi:chevron-up"></ha-icon>
          <span>Hide</span>
        </button>
      ` : nothing}
      `}
    </div>`;
  }

  private _renderNamedAlerts(index: number, alerts: SmartRoomNamedAlertConfig[] | undefined) {
    const device = (this._config?.devices ?? [])[index];
    const items = alerts ?? [];
    return html`
      ${items.map((item, itemIndex) => {
        const presetKey = item.preset ? this._presetEditorKey(index, "alert", itemIndex, item) : "";
        const expanded = !item.preset || this._isPresetEditorExpanded(presetKey);
        const isBattery = item.preset_source === "battery";
        return this._renderSharedNamedAlertCard(item, {
          onUpdate: (key, value) => this._updateNamedAlert(index, itemIndex, key, value),
          onConditions: (next) => this._updateNamedAlert(index, itemIndex, "conditions", next),
          onRemove: item.preset ? undefined : () => this._removeNamedAlert(index, itemIndex),
          onReset: item.preset ? () => (isBattery ? this._resetBatteryAlert(index) : this._resetPresetAlert(index, itemIndex)) : undefined,
          onToggleCollapsed: item.preset ? () => this._togglePresetEditor(presetKey) : undefined,
          lockMode: item.preset ? "first" : "none",
          batteryLocked: false,
          selectorDefaults: { restrict_to_room_area: device ? this._deviceRestrictsToRoomArea(device) : false, domains: isBattery ? ["sensor"] : ["*"] },
          collapsed: item.preset && !expanded,
        });
      })}
      <button type="button" class="secondary" @click=${() => this._addNamedAlert(index)}>Add alert</button>
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

  private _toggleSensorExpanded(key: string) {
    this._expandedSensors = this._expandedSensors.includes(key) ? this._expandedSensors.filter((k) => k !== key) : [...this._expandedSensors, key];
  }

  private _toggleSensorBatteryExpanded(key: string) {
    this._expandedSensorBatteries = this._expandedSensorBatteries.includes(key)
      ? this._expandedSensorBatteries.filter((k) => k !== key)
      : [...this._expandedSensorBatteries, key];
  }

  private _expandSensor(key: string) {
    if (!this._expandedSensors.includes(key)) this._expandedSensors = [...this._expandedSensors, key];
  }

  private _expandSensorBattery(key: string) {
    if (!this._expandedSensorBatteries.includes(key)) this._expandedSensorBatteries = [...this._expandedSensorBatteries, key];
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
    this._touchDragStartX = event.clientX;
    this._touchDragStartY = event.clientY;
    this._touchDragPendingIndex = index;
    this._touchDragPointerId = event.pointerId;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private _handleTouchDragMove = (event: PointerEvent) => {
    if (this._touchDragPointerId !== event.pointerId) return;
    if (this._touchDragPendingIndex !== undefined && this._dragIndex === undefined) {
      const dx = event.clientX - this._touchDragStartX;
      const dy = event.clientY - this._touchDragStartY;
      if (dx * dx + dy * dy < 144) return; // 12px threshold
      this._dragIndex = this._touchDragPendingIndex;
      this._dropIndex = this._touchDragPendingIndex;
      this._touchDragPendingIndex = undefined;
    }
    if (this._dragIndex === undefined) return;
    const targetIndex = this._indexFromPoint(event.clientX, event.clientY);
    if (targetIndex !== undefined) this._dropIndex = targetIndex;
    event.preventDefault();
  };

  private _handleTouchDragEnd = (event: PointerEvent) => {
    if (this._touchDragPointerId !== event.pointerId) return;
    if (this._dragIndex !== undefined) {
      const targetIndex = this._dropIndex ?? this._indexFromPoint(event.clientX, event.clientY);
      if (targetIndex !== undefined) this._reorderTo(targetIndex);
    }
    this._touchDragPointerId = undefined;
    this._touchDragPendingIndex = undefined;
    this._dragIndex = undefined;
    this._dropIndex = undefined;
    event.preventDefault();
  };

  private _handleTouchDragCancel = (event: PointerEvent) => {
    if (this._touchDragPointerId !== event.pointerId) return;
    this._touchDragPointerId = undefined;
    this._touchDragPendingIndex = undefined;
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
    this._sensorTouchDragStartX = event.clientX;
    this._sensorTouchDragStartY = event.clientY;
    this._sensorTouchDragPendingIndex = idx;
    this._touchSensorDragPointerId = event.pointerId;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
  private _handleSensorTouchDragMove = (event: PointerEvent) => {
    if (this._touchSensorDragPointerId !== event.pointerId) return;
    if (this._sensorTouchDragPendingIndex !== undefined && this._sensorDragIndex === undefined) {
      const dx = event.clientX - this._sensorTouchDragStartX;
      const dy = event.clientY - this._sensorTouchDragStartY;
      if (dx * dx + dy * dy < 144) return; // 12px threshold
      this._sensorDragIndex = this._sensorTouchDragPendingIndex;
      this._sensorDropIndex = this._sensorTouchDragPendingIndex;
      this._sensorTouchDragPendingIndex = undefined;
    }
    if (this._sensorDragIndex === undefined) return;
    const targetIndex = this._sensorIndexFromPoint(event.clientX, event.clientY);
    if (targetIndex !== undefined) this._sensorDropIndex = targetIndex;
    event.preventDefault();
  };
  private _handleSensorTouchDragEnd = (event: PointerEvent) => {
    if (this._touchSensorDragPointerId !== event.pointerId) return;
    if (this._sensorDragIndex !== undefined) {
      const targetIndex = this._sensorDropIndex ?? this._sensorIndexFromPoint(event.clientX, event.clientY);
      if (targetIndex !== undefined) this._reorderSensorTo(targetIndex);
    }
    this._touchSensorDragPointerId = undefined;
    this._sensorTouchDragPendingIndex = undefined;
    this._sensorDragIndex = undefined;
    this._sensorDropIndex = undefined;
    event.preventDefault();
  };
  private _handleSensorTouchDragCancel = (event: PointerEvent) => {
    if (this._touchSensorDragPointerId !== event.pointerId) return;
    this._touchSensorDragPointerId = undefined;
    this._sensorTouchDragPendingIndex = undefined;
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
      devices[index] = this._applyDerivedBatteryAlert(this._withoutDerivedBatteryAlert(devices[index]), this._config?.ui?.battery_threshold ?? 20);
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
  private _setUiPerformance(key: string, value: unknown) {
    this._patch({
      ui: {
        ...(this._config?.ui ?? {}),
        performance: {
          ...(this._config?.ui?.performance ?? {}),
          [key]: value,
          lazy_sensor_charts: true,
        },
      },
    });
  }
  private _setExpander(key: string, value: unknown) { this._patch({ expander: { ...(this._config?.expander ?? {}), [key]: value } }); }
  private _setRoomImage(key: "background_on" | "background_off", value: string) { this._patch({ ui: { ...(this._config?.ui ?? {}), images: { ...(this._config?.ui?.images ?? {}), [key]: value || undefined } } }); }
  private _setImageKey(key: string, value: unknown) { this._patch({ ui: { ...(this._config?.ui ?? {}), images: { ...(this._config?.ui?.images ?? {}), [key]: value } } }); }
  private _setSensor(key: string, value: string) {
    const previousEntity = String((this._config?.sensors as Record<string, unknown>)?.[key] ?? "");
    const previousBattery = this._relatedBatteryEntityId(previousEntity);
    const nextBattery = this._relatedBatteryEntityId(value);
    const batteryConfig = this._config?.sensors?.batteries?.[key as "temperature"];
    const currentBattery = batteryConfig?.entity?.trim() ?? "";
    const shouldSyncBattery = !currentBattery || (Boolean(previousBattery) && currentBattery === previousBattery);
    const hadEntity = Boolean((this._config?.sensors as Record<string, unknown>)?.[key]);
    let newSensors = patchSensor(this._config?.sensors, key, value);
    if (shouldSyncBattery) {
      newSensors = patchSensorBattery(newSensors, key as "temperature", "entity", nextBattery);
      if (nextBattery) {
        newSensors = patchSensorBattery(newSensors, key as "temperature", "alert_enabled", true);
        this._expandSensor(key);
        this._expandSensorBattery(key);
      }
    }
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
  private _setSensorAlert(key: string, field: "enabled" | "min" | "max" | "eq" | "neq" | "text_eq" | "text_neq", value: boolean | number | string | undefined) {
    this._patch({ sensors: patchSensorAlert(this._config?.sensors, key as "temperature", field, value) });
  }
  private _setSensorBattery(key: string, field: "entity" | "alert_enabled" | "restrict_to_room_area", value: string | boolean | undefined) {
    let sensors = patchSensorBattery(this._config?.sensors, key as "temperature", field, value);
    if (field === "entity" && typeof value === "string" && value.trim()) {
      sensors = patchSensorBattery(sensors, key as "temperature", "alert_enabled", true);
      this._expandSensor(key);
      this._expandSensorBattery(key);
    } else if (field === "entity" && !value) {
      sensors = patchSensorBattery(sensors, key as "temperature", "alert_enabled", false);
    }
    this._patch({ sensors });
  }
  private _setPresetSensorBatteryAlertEnabled(key: string, enabled: boolean) {
    const sensors = patchSensorBattery(this._config?.sensors, key as "temperature", "alert_enabled", enabled);
    if (enabled) {
      this._expandSensor(key);
      this._expandSensorBattery(key);
    }
    this._patch({ sensors });
  }
  private _addCustomSensor() { this._patch({ sensors: addCustomSensor(this._config?.sensors) }); }
  private _removeCustomSensor(i: number) { this._patch({ sensors: removeCustomSensor(this._config?.sensors, i) }); }
  private _updateCustomSensor(i: number, patch: Partial<import("./helpers").SmartRoomCustomSensor>) {
    this._patch({ sensors: updateCustomSensor(this._config?.sensors, i, patch) });
  }
  private _updateCustomSensorAlert(i: number, field: "enabled" | "min" | "max" | "eq" | "neq" | "text_eq" | "text_neq", value: boolean | number | string | undefined) {
    this._patch({ sensors: updateCustomSensorAlert(this._config?.sensors, i, field, value) });
  }
  private _setCustomSensorBatteryAlertEnabled(i: number, enabled: boolean) {
    const sensors = updateCustomSensor(this._config?.sensors, i, { battery_alert_enabled: enabled });
    if (enabled) {
      this._expandSensor(`custom_${i}`);
      this._expandSensorBattery(`custom_${i}`);
    }
    this._patch({ sensors });
  }
  private _setCustomSensorBattery(i: number, value: string) {
    const normalized = value || undefined;
    let sensors = updateCustomSensor(this._config?.sensors, i, {
      battery: normalized,
      ...(normalized ? { battery_alert_enabled: true } : { battery_alert_enabled: false }),
    });
    if (normalized) {
      this._expandSensor(`custom_${i}`);
      this._expandSensorBattery(`custom_${i}`);
    }
    this._patch({ sensors });
  }
  private _setCustomSensorEntity(i: number, value: string) {
    const current = this._config?.sensors?.custom?.[i];
    const hadEntity = Boolean(current?.entity);
    const previousBattery = this._relatedBatteryEntityId(current?.entity);
    const nextBattery = this._relatedBatteryEntityId(value);
    const currentBattery = current?.battery?.trim() ?? "";
    const shouldSyncBattery = !currentBattery || (Boolean(previousBattery) && currentBattery === previousBattery);
    let newSensors = updateCustomSensor(this._config?.sensors, i, {
      entity: value,
      ...(shouldSyncBattery ? { battery: nextBattery } : {}),
      ...(shouldSyncBattery && nextBattery ? { battery_alert_enabled: true } : {}),
    });
    if (shouldSyncBattery && nextBattery) {
      this._expandSensor(`custom_${i}`);
      this._expandSensorBattery(`custom_${i}`);
    }
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
      const previousBattery = this._relatedBatteryEntityId(current.entity);
      const nextBattery = this._relatedBatteryEntityId(nextEntity);
      const currentBattery = current.battery?.trim() ?? "";
      const shouldSyncBattery = !currentBattery || (Boolean(previousBattery) && currentBattery === previousBattery);
      const nextDevice = {
        ...current,
        entity: nextEntity,
        ...(shouldSyncBattery ? { battery: nextBattery } : {}),
      };
      devices[index] = this._syncDeviceWithEntity(nextDevice, current.entity, nextEntity);
      if (shouldSyncBattery && nextBattery !== currentBattery) {
        devices[index] = this._applyDerivedBatteryAlert(this._withoutDerivedBatteryAlert(devices[index]), this._config?.ui?.battery_threshold ?? 20);
      }
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
      devices[index] = this._applyDerivedBatteryAlert(this._withoutDerivedBatteryAlert(devices[index]), this._config?.ui?.battery_threshold ?? 20);
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
  private _relatedBatteryEntityId(entityId?: string): string | undefined {
    return relatedBatteryEntityId(this._entityRegistry, this.hass?.states ?? {}, entityId);
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
  private _withoutDerivedBatteryAlert(device: SmartRoomDeviceConfig): SmartRoomDeviceConfig {
    return {
      ...device,
      states: {
        ...(device.states ?? {}),
        alerts: (device.states?.alerts ?? []).filter((item) => item.preset_source !== "battery"),
      },
    };
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
  private _resetBatteryAlert(index: number) {
    const devices = [...(this._config?.devices ?? [])];
    const device = devices[index];
    if (!device) return;
    devices[index] = this._applyDerivedBatteryAlert(this._withoutDerivedBatteryAlert(device), this._config?.ui?.battery_threshold ?? 20);
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
