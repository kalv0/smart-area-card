import { LitElement, TemplateResult, html, nothing } from "lit";
import { property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard } from "custom-card-helpers";
import { fireEvent } from "custom-card-helpers";
import {
  buildRoomBackgroundImage,
  canToggle,
  evaluateCondition,
  getBatteryColor,
  getBatteryLevel,
  getBatteryIcon,
  resolveDeviceTileSize,
  storageKey,
  type ComputedDeviceModel,
  type PopupConfig,
  type SmartRoomActionConfig,
  type SmartRoomActionType,
  type SmartRoomCardConfig,
  type SmartRoomHeaderBadge,
} from "./helpers/index";
import { smartRoomCardStyles } from "./styles";
import type { RenderModel } from "./types/card-model";
import type { HomeAssistantExtended } from "./types/ha-extensions";
import { createTrackedEntityIds, resolveAreaAutomationIds } from "./helpers/room-model";
import { computeRenderModel } from "./helpers/compute-render-model";
import { warnOnInvalidConfig } from "./helpers/validate-config";
import { PressController } from "./controllers/press-controller";
import { ImageFitController } from "./controllers/image-fit-controller";
import type { SensorPopupItem } from "./components/sensor-popup";

declare global {
  interface HTMLElementTagNameMap {
    "smart-area-card": SmartAreaCard;
  }

  interface Window {
    customCards?: Array<Record<string, unknown>>;
    loadCardHelpers?: () => Promise<{
      createCardElement?: (config: unknown) => HTMLElement | Promise<HTMLElement>;
    }>;
  }
}

type EntityRegistry = NonNullable<HomeAssistantExtended["entities"]>;
type SensorPopupAlertFlag = { label: string; active: boolean };
type SensorBatteryInfo = { entityId: string; level?: number; alertEnabled: boolean };

const BADGE_CONFIG: Partial<Record<SmartRoomHeaderBadge, { pillClass: string; icon: string }>> = {
  alert_generic: { pillClass: "header-pill header-pill-red",    icon: "mdi:alert-circle-outline" },
  door_open:     { pillClass: "header-pill header-pill-red",    icon: "mdi:door-open" },
  door_closed:   { pillClass: "header-pill header-pill-green",  icon: "mdi:door-closed" },
  lock_open:     { pillClass: "header-pill header-pill-red",    icon: "mdi:lock-open-variant" },
  lock_closed:   { pillClass: "header-pill header-pill-green",  icon: "mdi:lock" },
  presence:      { pillClass: "header-pill header-pill-white",  icon: "mdi:account" },
  fire:          { pillClass: "header-pill header-pill-red",    icon: "mdi:fire-alert" },
  water:         { pillClass: "header-pill header-pill-red",    icon: "mdi:water-alert" },
  plug_off:      { pillClass: "header-pill header-pill-red",    icon: "mdi:power-plug-off-outline" },
  low_battery:   { pillClass: "header-pill header-pill-red",    icon: "mdi:battery-alert-variant-outline" },
};

const SENSOR_POPUP_META: Record<string, { label: string; color: string }> = {
  temperature:     { label: "Temperature", color: "#f59e0b" },
  humidity:        { label: "Humidity",    color: "#3b82f6" },
  co2:             { label: "CO2",         color: "#10b981" },
  voc:             { label: "VOC",         color: "#8b5cf6" },
  pm25:            { label: "PM2.5",       color: "#ec4899" },
  pm10:            { label: "PM10",        color: "#db2777" },
  aqi:             { label: "Air Quality", color: "#14b8a6" },
  presence:        { label: "Presence",    color: "#f97316" },
  noise:           { label: "Noise",       color: "#64748b" },
  illuminance:     { label: "Illuminance", color: "#eab308" },
  power:           { label: "Power",       color: "#fb923c" },
  energy:          { label: "Energy",      color: "#16a34a" },
  carbon_monoxide: { label: "CO",          color: "#dc2626" },
  radon:           { label: "Radon",       color: "#7c3aed" },
  moisture:        { label: "Moisture",    color: "#0ea5e9" },
};

const EMPTY_ENTITY_REGISTRY: EntityRegistry = {};

function _formatLastTriggered(lastTriggered: string | null | undefined): string {
  if (!lastTriggered) return "never";
  const date = new Date(lastTriggered);
  if (isNaN(date.getTime())) return "never";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diffMs / 86400000);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export class SmartAreaCard extends LitElement implements LovelaceCard {
  public static styles = smartRoomCardStyles;

  public static async getConfigElement(): Promise<HTMLElement> {
    await import("./smart-area-card-editor");
    return document.createElement("smart-area-card-editor");
  }

  public static async getStubConfig(): Promise<SmartRoomCardConfig> {
    return {
      type: "custom:smart-area-card",
      room: "Entrada",
      room_id: "entrada",
      devices: [],
      ui: {
        battery_threshold: 20,
        battery_alerts_enabled: true,
        header_sensors_enabled: true,
        header_climate_more_info: true,
        show_entity_icons: false,
        show_area_icon: false,
        keep_background_on_until_sunset: false,
        automation_badge_enabled: false,
        automation_badge_click_details: true,
        blur: true,
        glassmorphism: true,
        performance: {
          mode: "balanced",
          unload_collapsed_grid: true,
          lazy_sensor_charts: true,
        },
      },
      expander: {
        enabled: true,
        initial_state: "closed",
        persist_state: true,
      },
    };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config?: SmartRoomCardConfig;
  @state() private _expanded = false;
  @state() private _everExpanded = false;
  @state() private _showAutomationPanel = false;
  @state() private _showClimateHistory = false;
  @state() private _expandedSensorChartKeys = new Set<string>();

  private _renderModel?: RenderModel;
  private _deviceByKey = new Map<string, ComputedDeviceModel>();
  /** Cached automation entity IDs for the current room. Rebuilt on config change. */
  private _automationEntityIds: string[] = [];
  private _trackedEntityIds: string[] = [];
  private _trackedEntityRefs: Array<unknown> = [];
  private _changedEntityIds?: Set<string>;
  private _lastEntityRegistry?: HomeAssistantExtended["entities"];
  private _previousScrollLock?: { bodyOverflow: string; documentOverflow: string };
  private _chartBuildVersion = 0;

  private readonly _press = new PressController(this);
  private readonly _imageFit = new ImageFitController(this);
  private readonly _onPressClear = (): void => this._press.clear();

  public setConfig(config: SmartRoomCardConfig): void {
    const defaults: SmartRoomCardConfig = {
      type: "custom:smart-area-card",
      devices: [],
      room: "",
      room_id: "",
      ui: {
        blur: true,
        glassmorphism: true,
        battery_threshold: 20,
        battery_alerts_enabled: true,
        header_sensors_enabled: true,
        header_climate_more_info: true,
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
      expander: {
        enabled: true,
        initial_state: "closed",
        persist_state: true,
      },
    };

    this._config = {
      ...defaults,
      ...config,
      ui: {
        ...defaults.ui,
        ...(config.ui ?? {}),
        performance: {
          ...defaults.ui?.performance,
          ...(config.ui?.performance ?? {}),
          lazy_sensor_charts: true,
        },
      },
      expander: {
        ...defaults.expander,
        ...(config.expander ?? {}),
      },
    };

    warnOnInvalidConfig(this._config);
    this._rebuildAutomationIds();
    this._rebuildTrackedEntityIds();
    this._trackedEntityRefs = [];
    this._changedEntityIds = undefined;
    this._restoreExpanded();
    this._restoreAutomationPanel();
  }

  public getCardSize(): number {
    if (!this._expanded) return 4;
    const deviceRows = Math.ceil((this._config?.devices?.length ?? 0) / 3);
    return 4 + Math.max(deviceRows, 1);
  }

  protected updated(changedProps: Map<string, unknown>): void {
    if (changedProps.has("_showClimateHistory")) {
      this._setPageScrollLocked(this._showClimateHistory);
    }
    if (this._showClimateHistory) {
      const chartContainers = this.shadowRoot?.querySelectorAll(".sensor-popup-chart");
      const missingChart = Array.from(chartContainers ?? []).some((el) => !el.firstElementChild);
      if (changedProps.has("_showClimateHistory") || changedProps.has("_config") || changedProps.has("_expandedSensorChartKeys") || missingChart) {
        void this._buildPopupCharts();
      } else if (changedProps.has("hass")) {
        this.shadowRoot?.querySelectorAll(".sensor-popup-chart > *").forEach((el) => {
          (el as HTMLElement & { hass: HomeAssistant }).hass = this.hass;
        });
      }
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._setPageScrollLocked(false);
  }

  private async _buildPopupCharts(): Promise<void> {
    this._destroyPopupCharts();
    const buildVersion = this._chartBuildVersion;
    const items = this._renderModel?.climateItems ?? [];
    for (const item of items) {
      if (!this._expandedSensorChartKeys.has(item.key)) continue;
      const entityId = this._entityIdForKey(item.key);
      if (!entityId) continue;
      const container = this.shadowRoot?.querySelector<HTMLElement>(`.sensor-popup-chart[data-key="${item.key}"]`);
      if (!container) continue;
      const card = await this._createHistoryGraphCard(entityId);
      if (!card || buildVersion !== this._chartBuildVersion || !this._showClimateHistory) return;
      container.replaceChildren();
      container.appendChild(card);
    }
  }

  private async _createHistoryGraphCard(entityId: string): Promise<HTMLElement | undefined> {
    const config = { type: "history-graph", entities: [{ entity: entityId }], hours_to_show: 24 };
    const helpers = await window.loadCardHelpers?.().catch(() => undefined);
    if (helpers?.createCardElement) {
      const card = await helpers.createCardElement(config) as HTMLElement & { hass?: HomeAssistant };
      card.hass = this.hass;
      return card;
    }

    const HistoryCard = customElements.get("hui-history-graph-card") as (new () => HTMLElement) | undefined;
    if (!HistoryCard) return undefined;
    const card = new HistoryCard() as HTMLElement & { hass: HomeAssistant; setConfig(c: unknown): void };
    card.hass = this.hass;
    card.setConfig(config);
    return card;
  }

  private _destroyPopupCharts(): void {
    this._chartBuildVersion += 1;
    this.shadowRoot?.querySelectorAll(".sensor-popup-chart").forEach((container) => {
      container.replaceChildren();
    });
  }

  private _setPageScrollLocked(locked: boolean): void {
    if (locked) {
      if (!this._previousScrollLock) {
        this._previousScrollLock = {
          bodyOverflow: document.body.style.overflow,
          documentOverflow: document.documentElement.style.overflow,
        };
      }
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      return;
    }

    if (!this._previousScrollLock) return;
    document.body.style.overflow = this._previousScrollLock.bodyOverflow;
    document.documentElement.style.overflow = this._previousScrollLock.documentOverflow;
    this._previousScrollLock = undefined;
  }

  private _entityIdForKey(key: string): string | undefined {
    const sensors = this._config?.sensors;
    if (!sensors) return undefined;
    if (key.startsWith("custom_")) {
      const i = Number(key.slice(7));
      return sensors.custom?.[i]?.entity || undefined;
    }
    return (sensors as Record<string, string | undefined>)[key];
  }

  private _relativeTime(iso: string | null | undefined): string {
    if (!iso) return "";
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    return `${Math.floor(diff / 86400)} d ago`;
  }

  private async _ensureSensorPopupElement(): Promise<void> {
    await import("./components/sensor-popup");
    if (this._showClimateHistory) this.requestUpdate();
  }

  protected willUpdate(changedProps: Map<string, unknown>): void {
    if (changedProps.has("hass") || changedProps.has("_config")) {
      if (this._config && this.hass) {
        this._refreshAutomationTracking();
        try {
          const previous = changedProps.has("_config") ? undefined : this._renderModel;
          this._renderModel = computeRenderModel(this._config, this.hass, this._automationEntityIds, {
            previous,
            changedEntityIds: this._changedEntityIds,
          });
          this._deviceByKey = new Map(this._renderModel.devices.map((device) => [device.key, device]));
          this._syncTrackedEntityRefs();
        } catch (err) {
          console.error("[smart-area-card] computeRenderModel failed:", err);
        }
      }
    }
    this.toggleAttribute("alert", Boolean(this._renderModel?.hasAlert && !this._expanded));
    this.toggleAttribute("pressed", this._press.pressed);
    this.toggleAttribute("performance-lite", this._reduceVisualEffects());
    this.toggleAttribute("no-blur", !this._blurEnabled());
  }

  protected shouldUpdate(changedProps: Map<string, unknown>): boolean {
    if (!changedProps.size) return true;
    if (
      changedProps.has("_config") ||
      changedProps.has("_expanded") ||
      changedProps.has("_showAutomationPanel") ||
      changedProps.has("_showClimateHistory") ||
      changedProps.has("_expandedSensorChartKeys")
    ) {
      return true;
    }
    if (changedProps.has("hass")) {
      if (this._refreshAutomationTracking()) {
        this._trackedEntityRefs = [];
        this._changedEntityIds = undefined;
        return true;
      }
      if (this._trackedEntityRefsChanged()) {
        return true;
      }
    }
    return false;
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass || !this._renderModel) {
      return html``;
    }

    const model = this._renderModel;
    const colors = this._config.ui?.colors;
    const hasRoomBackground = Boolean(model.roomBackground);
    const roomBackgroundPosition = `center ${model.roomBackgroundPositionY ?? 50}%`;
    const backgroundSize = hasRoomBackground
      ? model.roomImageDark
        ? "100% 100%, 100% 100%, cover"
        : "100% 100%, cover"
      : "100% 100%";
    const backgroundPosition = hasRoomBackground
      ? model.roomImageDark
        ? `top left, top left, ${roomBackgroundPosition}`
        : `top left, ${roomBackgroundPosition}`
      : "top left";
    const cardStyles = {
      "--smart-room-active": colors?.active ?? "#ffd700",
      "--smart-room-alert": colors?.alert ?? "#ff3b30",
      "--smart-room-camera": colors?.camera ?? "#ff3b30",
      "--smart-room-surface": colors?.surface ?? "rgba(10, 16, 28, 0.42)",
      "--smart-room-text": colors?.text ?? "white",
      "--smart-room-muted": colors?.muted ?? "rgba(255,255,255,0.76)",
      backgroundImage: buildRoomBackgroundImage(model.roomBackground, model.roomImageDark),
      backgroundSize,
      backgroundPosition,
      backgroundRepeat: "no-repeat",
      backgroundOrigin: "border-box",
      backgroundClip: "border-box",
    };

    return html`
      <ha-card
        style=${styleMap(cardStyles)}
        aria-expanded=${this._config.expander?.enabled !== false ? String(this._expanded) : nothing}
        @click=${this._handleCardClick}
      >
        <div class="shell">
          <section class="summary-zone">
            ${this._renderHeader()}
            ${this._renderAlertPanels()}
            ${this._renderAutomationPanel()}
          </section>
          ${this._renderExpander()}
        </div>
      </ha-card>
      ${this._showClimateHistory ? this._renderSensorPopup() : nothing}
    `;
  }

  private _totalAlertCount(): number {
    const badgeTotal = Object.values(this._renderModel?.alertsByBadge ?? {})
      .reduce((sum, msgs) => sum + (msgs?.length ?? 0), 0);
    const climateTotal = (this._renderModel?.climateAlertBadges ?? [])
      .reduce((sum, b) => sum + b.messages.length, 0);
    return badgeTotal + climateTotal;
  }

  private _reduceVisualEffects(): boolean {
    const performance = this._config?.ui?.performance;
    return performance?.reduce_effects === true || performance?.mode === "maximum";
  }

  private _blurEnabled(): boolean {
    return this._config?.ui?.blur !== false && this._config?.ui?.glassmorphism !== false && !this._reduceVisualEffects();
  }

  private _unloadCollapsedGrid(): boolean {
    const performance = this._config?.ui?.performance;
    return performance?.unload_collapsed_grid ?? true;
  }

  private _renderGridWhenCollapsed(): boolean {
    return this._expanded || (!this._unloadCollapsedGrid() && this._everExpanded);
  }

  private _renderHeader(): TemplateResult {
    const model = this._renderModel!;
    const room = this._config!.room?.trim() ?? "";
    const sensorsEnabled = true;
    const climateItems = repeat(model.climateItems, (item) => item.key, (item) => html`
      <div class="climate-item ${item.className}">
        <ha-icon icon=${item.icon}></ha-icon>
        ${item.value}
      </div>
    `);

    return html`
      <section class="header">
        <div class="header-top">
          <div class="title-line">
            ${room && this._config?.ui?.show_area_icon && model.areaIcon ? html`<ha-icon icon=${model.areaIcon}></ha-icon>` : nothing}
            ${room ? html`<span>${room}</span>` : nothing}
            <div class="header-states">
              ${this._renderAutomationBadge()}
              ${this._renderHeaderBadge("door_closed")}
              ${this._renderHeaderBadge("lock_closed")}
              ${this._renderHeaderBadge("presence")}
              ${this._renderHeaderBadge("light")}
              ${this._renderHeaderBadge("rec")}
              ${this._renderHeaderBadge("playing")}
            </div>
          </div>

          ${sensorsEnabled && model.climateItems.length
            ? this._config?.ui?.header_climate_more_info === false
              ? html`<div class="climate climate-static">${climateItems}</div>`
              : html`<button class="climate climate-button" @click=${this._handleClimateClick}>${climateItems}</button>`
            : nothing}
        </div>
      </section>
    `;
  }

  private _renderHeaderBadge(badge: SmartRoomHeaderBadge): TemplateResult | typeof nothing {
    const count = this._renderModel?.badgeCounts?.[badge] ?? 0;
    if (!count) return nothing;

    const countLabel = count > 1 ? html`<span class="badge-count">${count}</span>` : nothing;
    switch (badge) {
      case "rec":
        return html`<span class="camera-rec"><span>REC</span>${countLabel}</span>`;
      case "light":
        return html`<span class="active-pill"><ha-icon icon="mdi:lightbulb"></ha-icon>${countLabel}</span>`;
      case "playing":
        return html`<span class="media-pill"><span class="media-main"><ha-icon icon="mdi:play"></ha-icon><span class="media-waves" aria-hidden="true"><span></span><span></span><span></span></span></span>${countLabel}</span>`;
      default: {
        const cfg = BADGE_CONFIG[badge];
        if (!cfg) return nothing;
        return html`<span class="${cfg.pillClass}"><ha-icon icon=${cfg.icon}></ha-icon>${countLabel}</span>`;
      }
    }
  }

  private _renderAlertPanels(): TemplateResult | typeof nothing {
    const flatPanels: Array<{ icon: string; message: string }> = [];

    const alertsByBadge = this._renderModel?.alertsByBadge ?? {};
    (Object.entries(alertsByBadge) as [SmartRoomHeaderBadge, string[]][])
      .filter(([, messages]) => messages.length > 0)
      .forEach(([badge, messages]) => {
        const icon = BADGE_CONFIG[badge]?.icon ?? "mdi:alert-circle-outline";
        messages.forEach((message) => flatPanels.push({ icon, message }));
      });

    (this._renderModel?.climateAlertBadges ?? [])
      .filter((b) => b.messages.length > 0)
      .forEach((b) => b.messages.forEach((message) => flatPanels.push({ icon: b.icon, message })));

    if (!flatPanels.length) return nothing;

    return html`${repeat(flatPanels, ({ icon, message }, index) => `${index}:${icon}:${message}`, ({ icon, message }) => html`
      <section class="alert-bar">
        <ha-icon icon=${icon}></ha-icon>
        <div class="alert-lines"><div>${message}</div></div>
      </section>
    `)}`;
  }

  private _renderAutomationBadge(): TemplateResult | typeof nothing {
    if (!this._config?.ui?.automation_badge_enabled) return nothing;
    const count = this._renderModel?.badgeCounts?.automation ?? 0;
    if (!count) return nothing;
    const content = html`<ha-icon icon="mdi:home-automation"></ha-icon><span class="badge-count">${count}</span>`;
    if (this._config.ui?.automation_badge_click_details === false) {
      return html`<span class="automation-badge" aria-label="${count} automations enabled">${content}</span>`;
    }
    return html`<button class="automation-badge automation-badge-clickable" aria-label="${count} automations enabled" @click=${this._handleAutomationBadgeClick}>${content}</button>`;
  }

  private _handleAutomationBadgeClick = (event: Event): void => {
    event.stopPropagation();
    this._showAutomationPanel = !this._showAutomationPanel;
    this._persistAutomationPanel();
  };

  private _handleAutomationItemClick = (event: Event): void => {
    event.stopPropagation();
    const entityId = (event.currentTarget as HTMLElement | null)?.dataset.entityId;
    if (entityId) this._navigateToAutomation(entityId);
  };

  private _closeSensorPopup = (event?: Event): void => {
    event?.stopPropagation();
    this._destroyPopupCharts();
    this._expandedSensorChartKeys = new Set();
    this._showClimateHistory = false;
  };

  private _handleSensorPopupToggle = (event: CustomEvent<{ key?: string }>): void => {
    event.stopPropagation();
    const key = event.detail?.key;
    if (!key) return;
    const next = new Set(this._expandedSensorChartKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._expandedSensorChartKeys = next;
  };

  private _handleSensorPopupMore = (event: CustomEvent<{ entityId?: string }>): void => {
    event.stopPropagation();
    const entityId = event.detail?.entityId;
    if (entityId) this._openEntityHistory(entityId);
  };

  private _sensorAlertFlags(key: string, entityId?: string): SensorPopupAlertFlag[] {
    const sensors = this._config?.sensors;
    if (!sensors) return [];
    const alert = key.startsWith("custom_")
      ? sensors.custom?.[Number(key.slice(7))]?.alert
      : sensors.alerts?.[key as keyof NonNullable<typeof sensors.alerts>];
    const hasConfiguredAlert = Boolean(alert
      && (("min" in alert && alert.min !== undefined)
        || ("max" in alert && alert.max !== undefined)
        || ("eq" in alert && alert.eq !== undefined)
        || ("neq" in alert && alert.neq !== undefined)
        || ("text_eq" in alert && alert.text_eq !== undefined)
        || ("text_neq" in alert && alert.text_neq !== undefined)));
    const entity = entityId ? this.hass?.states?.[entityId] : undefined;
    const state = entity?.state;
    const value = Number(state);
    const unit = entity?.attributes?.unit_of_measurement ? String(entity.attributes.unit_of_measurement) : "";
    const formatNumber = (n: number): string => `${n}${unit}`;
    const flags: SensorPopupAlertFlag[] = [];
    if (alert && hasConfiguredAlert) {
      if ("min" in alert && alert.min !== undefined) flags.push({ label: `Min.${formatNumber(alert.min)}`, active: Number.isFinite(value) && value < alert.min });
      if ("max" in alert && alert.max !== undefined) flags.push({ label: `Max.${formatNumber(alert.max)}`, active: Number.isFinite(value) && value > alert.max });
      if ("eq" in alert && alert.eq !== undefined) flags.push({ label: `= ${typeof alert.eq === "number" ? formatNumber(alert.eq) : alert.eq}`, active: state === String(alert.eq) });
      if ("neq" in alert && alert.neq !== undefined) flags.push({ label: `!= ${alert.neq}`, active: state !== undefined && state !== alert.neq });
      if ("text_eq" in alert && alert.text_eq !== undefined) flags.push({ label: `Text = ${alert.text_eq}`, active: state === alert.text_eq });
      if ("text_neq" in alert && alert.text_neq !== undefined) flags.push({ label: `Text != ${alert.text_neq}`, active: state !== undefined && state !== alert.text_neq });
    }
    const batteryConfig = key.startsWith("custom_")
      ? {
          entity: sensors.custom?.[Number(key.slice(7))]?.battery,
          alert_enabled: sensors.custom?.[Number(key.slice(7))]?.battery_alert_enabled,
        }
      : sensors.batteries?.[key as keyof NonNullable<typeof sensors.batteries>];
    if (batteryConfig?.entity && batteryConfig.alert_enabled !== false && this._config?.ui?.battery_alerts_enabled !== false) {
      const threshold = this._config?.ui?.battery_threshold ?? 20;
      const batteryLevel = getBatteryLevel(this.hass?.states?.[batteryConfig.entity]);
      flags.push({ label: `Battery <= ${threshold}%`, active: batteryLevel !== undefined && batteryLevel <= threshold });
    }
    return flags.length ? flags : hasConfiguredAlert ? [{ label: "Alert", active: false }] : [];
  }

  private _sensorBatteryInfo(key: string): SensorBatteryInfo | undefined {
    const sensors = this._config?.sensors;
    if (!sensors) return undefined;
    const batteryConfig = key.startsWith("custom_")
      ? {
          entity: sensors.custom?.[Number(key.slice(7))]?.battery,
          alert_enabled: sensors.custom?.[Number(key.slice(7))]?.battery_alert_enabled,
        }
      : sensors.batteries?.[key as keyof NonNullable<typeof sensors.batteries>];
    const entityId = batteryConfig?.entity?.trim();
    if (!entityId) return undefined;
    return {
      entityId,
      level: getBatteryLevel(this.hass?.states?.[entityId]),
      alertEnabled: batteryConfig?.alert_enabled !== false && this._config?.ui?.battery_alerts_enabled !== false,
    };
  }

  private _sensorPopupItems(): SensorPopupItem[] {
    const items = this._renderModel?.climateItems ?? [];
    return items.map((item) => {
      const entityId = this._entityIdForKey(item.key);
      const meta = item.key.startsWith("custom_")
        ? { label: this._config?.sensors?.custom?.[Number(item.key.slice(7))]?.name ?? item.key, color: "#94a3b8" }
        : (SENSOR_POPUP_META[item.key] ?? { label: item.key, color: "#94a3b8" });
      const batteryInfo = this._sensorBatteryInfo(item.key);
      return {
        key: item.key,
        icon: item.icon,
        label: meta.label,
        value: item.value,
        entityId,
        updated: entityId ? this._relativeTime(this.hass.states[entityId]?.last_updated) : undefined,
        accent: meta.color,
        alert: item.className.includes("alert"),
        expanded: this._expandedSensorChartKeys.has(item.key),
        interactive: Boolean(entityId),
        blur: this._blurEnabled(),
        alertFlags: this._sensorAlertFlags(item.key, entityId),
        batteryInfo: batteryInfo ? { level: batteryInfo.level } : undefined,
      };
    });
  }

  private _renderSensorPopup(): TemplateResult | typeof nothing {
    const popupItems = this._sensorPopupItems();
    if (!popupItems.length) return nothing;
    const popupModel = this._renderModel;
    const popupHasRoomBackground = Boolean(popupModel?.roomBackground);
    const popupRoomBackgroundPosition = `center ${popupModel?.roomBackgroundPositionY ?? 50}%`;
    const popupBackgroundSize = popupHasRoomBackground
      ? popupModel?.roomImageDark
        ? "100% 100%, 100% 100%, cover"
        : "100% 100%, cover"
      : "100% 100%";
    const popupBackgroundPosition = popupHasRoomBackground
      ? popupModel?.roomImageDark
        ? `top left, top left, ${popupRoomBackgroundPosition}`
        : `top left, ${popupRoomBackgroundPosition}`
      : "top left";
    const sharedPopupStyles = {
      backgroundImage: buildRoomBackgroundImage(popupModel?.roomBackground, popupModel?.roomImageDark),
      backgroundSize: popupBackgroundSize,
      backgroundPosition: popupBackgroundPosition,
      backgroundRepeat: "no-repeat",
      backgroundOrigin: "border-box",
      backgroundClip: "border-box",
    };
    return html`
      <smart-area-sensor-popup
        .items=${popupItems}
        .popupStyles=${sharedPopupStyles}
        .charts=${true}
        @sensor-popup-close=${this._closeSensorPopup}
        @sensor-popup-toggle=${this._handleSensorPopupToggle}
        @sensor-popup-more=${this._handleSensorPopupMore}
      ></smart-area-sensor-popup>
    `;
  }

  private _navigateToAutomation(entityId: string): void {
    // automation state attributes contain `id` for UI-created automations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const automationId = (this.hass?.states?.[entityId]?.attributes as any)?.id;
    if (automationId) {
      history.pushState(null, "", `/config/automation/edit/${automationId}`);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false }, bubbles: true, composed: true }));
    } else {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
    }
  }

  private _openEntityHistory(entityId: string): void {
    this._destroyPopupCharts();
    this._expandedSensorChartKeys = new Set();
    this._showClimateHistory = false;
    history.pushState(null, "", `/history?entity_id=${encodeURIComponent(entityId)}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false }, bubbles: true, composed: true }));
  }

  private _renderAutomationPanel(): TemplateResult | typeof nothing {
    if (this._config?.ui?.automation_badge_click_details === false) return nothing;
    if (!this._showAutomationPanel) return nothing;
    const automations = this._renderModel?.areaAutomations ?? [];
    if (!automations.length) return nothing;
    return html`
      <section class="automation-panel">
        <ha-icon icon="mdi:home-automation"></ha-icon>
        <div class="automation-list">
          ${repeat(automations, (a) => a.entityId, (a) => html`
            <button class="automation-item ${a.enabled ? "" : "automation-item-disabled"}" data-entity-id=${a.entityId} @click=${this._handleAutomationItemClick}>
              ${a.name}<span class="automation-last-run"> - ${_formatLastTriggered(a.lastTriggered)}</span>
            </button>
          `)}
        </div>
      </section>
    `;
  }

  private _renderExpander(): TemplateResult {
    if (this._config?.expander?.enabled === false) {
      return this._renderGrid();
    }

    return html`
      <section class="expander">
        <div class="expander-shell ${classMap({ open: this._expanded })}">
          <div class="expander-inner">
            ${this._renderGridWhenCollapsed() ? this._renderGrid() : nothing}
          </div>
        </div>
      </section>
    `;
  }

  private _renderGrid(): TemplateResult {
    const { width: tileWidth, height: tileHeight } = resolveDeviceTileSize(this._config?.ui);
    return html`
      <section class="device-zone">
        <div class="device-grid" style="grid-template-columns: repeat(auto-fill, minmax(${tileWidth}px, 1fr)); --sr-tile-width: ${tileWidth}px; --sr-tile-height: ${tileHeight}px; --sr-tile-size: ${tileHeight}px">
          ${repeat(this._renderModel?.devices ?? [], (device) => device.key, (device) => this._renderDeviceSafe(device))}
        </div>
      </section>
    `;
  }

  private _renderDeviceSafe(device: ComputedDeviceModel): TemplateResult {
    try {
      return this._renderDevice(device);
    } catch (err) {
      console.error(`[smart-area-card] Failed to render device "${device.key}":`, err);
      return html`
        <div class="tile tile-error" role="img" aria-label="${device.label} — render error">
          <div class="tile-label">
            <ha-icon class="tile-entity-icon" icon="mdi:alert-circle-outline"></ha-icon>
            <div class="tile-name">${device.label}</div>
            <div class="tile-state">Error</div>
          </div>
        </div>
      `;
    }
  }

  private _renderDevice(device: ComputedDeviceModel): TemplateResult {
    const offlineVisual = device.isOffline && device.offlineEnabled;
    const batteryColor = getBatteryColor(device.batteryLevel);
    return html`
      <button
        type="button"
        aria-label=${device.label}
        data-device-key=${device.key}
        class="tile ${classMap({
          glass: this._blurEnabled(),
          active: device.isOn,
          "active-accent": device.isOn && device.activeAccent !== "none",
          outlined: device.outlined,
          offline: offlineVisual,
          alert: device.isAlert && device.alertOutlined,
        })}"
        style=${styleMap({
          opacity: offlineVisual ? String(device.offlineOpacity) : "1",
          "--smart-room-tile-accent": device.activeAccentCss ?? "transparent",
          "--smart-room-alert-accent": device.alertAccentCss ?? "var(--smart-room-alert)",
        })}
        @pointerdown=${this._handleDevicePointerDown}
        @pointerup=${this._handleDevicePointerUp}
        @pointerleave=${this._onPressClear}
        @pointercancel=${this._onPressClear}
        @click=${this._swallowClick}
        @keydown=${this._handleDeviceKeyDown}
      >
        <div class="tile-header">
          <span></span>
          <span class="badge">
            ${this._renderStatusIcon(device)}
          </span>
        </div>

        <div class="tile-visual">
          ${device.image
            ? html`
                <img
                  alt=${device.label}
                  src=${device.image}
                  data-src=${device.image}
                  loading="lazy"
                  decoding="async"
                  style=${this._imageFit.styleFor(device.image!)}
                  @load=${this._handleDeviceImageLoad}
                />
              `
            : nothing}
          ${device.isOffline && device.strikeOffline ? html`<div class="slash" aria-hidden="true"></div>` : nothing}
        </div>

        <div class="tile-label">
          ${(device.config.show_entity_icons ?? this._config?.ui?.show_entity_icons) ? html`<ha-icon class="tile-entity-icon" icon=${device.icon}></ha-icon>` : nothing}
          <div class="tile-name">${device.label}</div>
          <div class="tile-state">${device.isOffline ? "Offline" : device.stateText}</div>
        </div>

        <div class="tile-footer">
          ${device.batteryLevel !== undefined && device.config.show_battery !== false
            ? html`
                <span class="badge">
                  <ha-icon style=${`color:${batteryColor}`} icon=${getBatteryIcon(device.batteryLevel)}></ha-icon>
                  <span style=${`color:${batteryColor}`}>${device.batteryLevel}%</span>
                </span>
              `
            : nothing}
        </div>
      </button>
    `;
  }

  private _renderStatusIcon(device: ComputedDeviceModel): TemplateResult | typeof nothing {
    if (device.statusIcon) {
      return html`
        <ha-icon
          icon=${device.statusIcon}
          style=${`color:${device.statusIconColor ?? "white"}`}
        ></ha-icon>
      `;
    }
    return nothing;
  }

  private _handleCardClick = (): void => {
    if (this._config?.expander?.enabled === false) return;
    this._toggleExpanded();
  };

  private _handleClimateClick = (event: Event): void => {
    event.stopPropagation();
    if (this._config?.ui?.header_climate_more_info === false) {
      this._toggleExpanded();
      return;
    }
    const entities = this._renderModel?.climateEntities ?? [];
    if (!entities.length) return;
    const nextShow = !this._showClimateHistory;
    if (nextShow) void this._ensureSensorPopupElement();
    this._showClimateHistory = nextShow;
    if (!this._showClimateHistory) {
      this._destroyPopupCharts();
      this._expandedSensorChartKeys = new Set();
    }
  };

  private _handleDevicePointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    const device = this._deviceFromEvent(event);
    if (!device) return;
    this._press.start(() => {
      // Re-lookup by key to get the latest computed state at hold time.
      const target = this._deviceByKey.get(device.key);
      if (target) this._executeAction(target.config.hold_action, target);
    });
  };

  private _handleDevicePointerUp = (event: PointerEvent): void => {
    event.stopPropagation();
    const device = this._deviceFromEvent(event);
    if (!device) return;
    const didTap = this._press.commitTap();
    if (didTap) {
      this._executeAction(device.config.tap_action, device);
    } else {
      event.preventDefault();
    }
  };

  private _handleDeviceKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const device = this._deviceFromEvent(event);
    if (!device) return;
    event.preventDefault();
    event.stopPropagation();
    this._executeAction(device.config.tap_action, device);
  };

  private _handleDeviceImageLoad = (event: Event): void => {
    const src = (event.currentTarget as HTMLElement | null)?.dataset.src;
    if (src) this._imageFit.handleLoad(event, src);
  };

  private _deviceFromEvent(event: Event): ComputedDeviceModel | undefined {
    const key = (event.currentTarget as HTMLElement | null)?.dataset.deviceKey;
    return key ? this._deviceByKey.get(key) : undefined;
  }

  private _swallowClick = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
  };

  private _executeAction(action: SmartRoomActionConfig | undefined, device: ComputedDeviceModel): void {
    const resolved = action?.action ?? this._defaultAction(device);
    // Use config.entity (not device.key) as the entity ID — key is now index-prefixed.
    const targetEntity = action?.entity ?? device.config.entity;

    if (resolved === "none") return;

    if (resolved === "button") {
      if (action?.service) {
        const [domain, service] = action.service.split(".");
        if (domain && service) {
          this.hass.callService(domain, service, {
            ...(action.data ?? {}),
            entity_id: targetEntity,
          });
          return;
        }
      }

      const entity = this.hass.states[targetEntity];
      if (canToggle(entity)) {
        const [domain] = entity.entity_id.split(".");
        this.hass.callService(domain, "toggle", { entity_id: entity.entity_id });
      }
      return;
    }

    if (resolved === "more-info") {
      this._showMoreInfo(targetEntity);
      return;
    }

    if (resolved === "custom") {
      this._openPopupOrInfo(targetEntity, action?.popup ?? device.config.tap_action?.popup);
    }
  }

  private _defaultAction(device: ComputedDeviceModel): SmartRoomActionType {
    return device.config.tap_action?.action ?? "none";
  }

  private _openPopupOrInfo(entityId: string, popup?: PopupConfig): void {
    const browserMod = (this.hass.services as Record<string, Record<string, unknown>>).browser_mod;
    if (browserMod?.popup && popup) {
      this.hass.callService("browser_mod", "popup", {
        title: popup.title ?? "Details",
        size: popup.size ?? "normal",
        content: popup.content ?? popup.card,
      });
      return;
    }

    if (entityId) this._showMoreInfo(entityId);
  }

  private _showMoreInfo(entityId: string): void {
    fireEvent(this, "hass-more-info", { entityId });
  }

  private _toggleExpanded(): void {
    this._expanded = !this._expanded;
    this._everExpanded ||= this._expanded;
    this._persistExpanded();
  }

  /** Rebuilds the cached list of automation entity IDs for the current room. */
  private _rebuildAutomationIds(): void {
    if (!this._config?.ui?.automation_badge_enabled || !this._config.room_id?.trim()) {
      this._automationEntityIds = [];
      this._lastEntityRegistry = undefined;
      return;
    }
    const entityRegistry = (this.hass as HomeAssistantExtended | undefined)?.entities ?? EMPTY_ENTITY_REGISTRY;
    this._automationEntityIds = resolveAreaAutomationIds(entityRegistry, this._config.room_id);
    this._lastEntityRegistry = entityRegistry;
  }

  private _rebuildTrackedEntityIds(): void {
    this._trackedEntityIds = this._config
      ? createTrackedEntityIds(this._config, this._automationEntityIds)
      : [];
  }

  private _refreshAutomationTracking(): boolean {
    if (!this._config?.ui?.automation_badge_enabled || !this._config.room_id?.trim()) {
      const hadAutomationIds = this._automationEntityIds.length > 0;
      if (hadAutomationIds) {
        this._automationEntityIds = [];
        this._rebuildTrackedEntityIds();
      }
      this._lastEntityRegistry = undefined;
      return hadAutomationIds;
    }

    const entityRegistry = (this.hass as HomeAssistantExtended | undefined)?.entities ?? EMPTY_ENTITY_REGISTRY;
    if (entityRegistry === this._lastEntityRegistry) return false;

    const previous = this._automationEntityIds.join("|");
    this._automationEntityIds = resolveAreaAutomationIds(entityRegistry, this._config.room_id);
    this._lastEntityRegistry = entityRegistry;
    const changed = previous !== this._automationEntityIds.join("|");
    if (changed) this._rebuildTrackedEntityIds();
    return changed;
  }

  private _trackedEntityRefsChanged(): boolean {
    if (!this.hass) return false;
    const ids = this._trackedEntityIds;
    const states = this.hass.states;

    if (this._trackedEntityRefs.length !== ids.length) {
      this._changedEntityIds = new Set(ids);
      this._syncTrackedEntityRefs();
      return true;
    }

    const changedEntityIds = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      if (this._trackedEntityRefs[i] !== states[ids[i]]) {
        changedEntityIds.add(ids[i]);
      }
    }

    if (!changedEntityIds.size) return false;
    this._changedEntityIds = changedEntityIds;
    this._syncTrackedEntityRefs();
    return true;
  }

  private _syncTrackedEntityRefs(): void {
    if (!this.hass) {
      this._trackedEntityRefs = [];
      return;
    }
    const states = this.hass.states;
    this._trackedEntityRefs = this._trackedEntityIds.map((entityId) => states[entityId]);
  }

  private _restoreExpanded(): void {
    if (!this._config) return;

    const defaultExpanded = this._getInitialExpandedState();
    if (this._config.expander?.persist_state === false) {
      this._expanded = defaultExpanded;
      this._everExpanded = defaultExpanded;
      return;
    }

    const stored = window.localStorage.getItem(storageKey(this._config, "expanded"));
    this._expanded = stored ? stored === "true" : defaultExpanded;
    this._everExpanded = this._expanded;
  }

  private _persistExpanded(): void {
    if (!this._config || this._config.expander?.persist_state === false) return;
    window.localStorage.setItem(storageKey(this._config, "expanded"), String(this._expanded));
  }

  private _restoreAutomationPanel(): void {
    if (!this._config) return;
    if (this._config.expander?.persist_state === false) {
      this._showAutomationPanel = false;
      return;
    }
    const raw = window.localStorage.getItem(storageKey(this._config, "automation-panel"));
    this._showAutomationPanel = raw === "true";
  }

  private _persistAutomationPanel(): void {
    if (!this._config || this._config.expander?.persist_state === false) return;
    window.localStorage.setItem(storageKey(this._config, "automation-panel"), String(this._showAutomationPanel));
  }

  private _getInitialExpandedState(): boolean {
    const expander = this._config?.expander;
    if (!expander) return false;
    if (expander.initial_state === "open") return true;
    if (expander.initial_state === "conditional" && this.hass) {
      return evaluateCondition(this.hass.states, expander.condition);
    }
    return false;
  }
}

if (!window.customCards) {
  window.customCards = [];
}

window.customCards.push({
  type: "smart-area-card",
  name: "Smart Area",
  preview: true,
  description: "🏠 Compact room overview — sensors, devices, automations & alerts in one glance.",
});

if (!customElements.get("smart-area-card")) {
  customElements.define("smart-area-card", SmartAreaCard);
}
