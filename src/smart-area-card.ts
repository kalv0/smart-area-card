import { LitElement, TemplateResult, html, nothing } from "lit";
import { property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard } from "custom-card-helpers";
import { fireEvent } from "custom-card-helpers";
import {
  buildRoomBackgroundImage,
  canToggle,
  evaluateCondition,
  getBatteryColor,
  getBatteryIcon,
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
import { createCardSignature, resolveAreaAutomationIds } from "./helpers/room-model";
import { computeRenderModel } from "./helpers/compute-render-model";
import { warnOnInvalidConfig } from "./helpers/validate-config";
import { PressController } from "./controllers/press-controller";
import { ImageFitController } from "./controllers/image-fit-controller";
import "./smart-area-card-editor";

declare global {
  interface HTMLElementTagNameMap {
    "smart-area-card": SmartAreaCard;
  }

  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}


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
        header_climate_more_info: true,
        show_entity_icons: false,
        show_area_icon: false,
        keep_background_on_until_sunset: false,
        automation_badge_enabled: false,
        blur: true,
        glassmorphism: true,
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
  @state() private _alertsHidden = false;

  private _renderModel?: RenderModel;
  private _lastSignature = "";
  /** Cached automation entity IDs for the current room. Rebuilt on config change. */
  private _automationEntityIds: string[] = [];

  private readonly _press = new PressController(this);
  private readonly _imageFit = new ImageFitController(this);
  private readonly _onPressClear = (): void => this._press.clear();

  public setConfig(config: SmartRoomCardConfig): void {
    if (!config?.room) {
      throw new Error("`room` is required.");
    }

    this._config = {
      devices: [],
      room_id: "",
      ui: {
        blur: true,
        glassmorphism: true,
        battery_threshold: 20,
        battery_alerts_enabled: true,
        header_climate_more_info: true,
        show_entity_icons: false,
        show_area_icon: false,
        keep_background_on_until_sunset: false,
        automation_badge_enabled: false,
      },
      expander: {
        enabled: true,
        initial_state: "closed",
        persist_state: true,
      },
      ...config,
    };

    warnOnInvalidConfig(this._config);
    this._rebuildAutomationIds();
    this._restoreExpanded();
    this._restoreAutomationPanel();
    this._restoreAlertPanels();
  }

  public getCardSize(): number {
    if (!this._expanded) return 4;
    const deviceRows = Math.ceil((this._config?.devices?.length ?? 0) / 3);
    return 4 + Math.max(deviceRows, 1);
  }

  protected updated(changedProps: Map<string, unknown>): void {
    if (this._showClimateHistory) {
      if (changedProps.has("_showClimateHistory") || changedProps.has("_config")) {
        this._buildPopupCharts();
      } else if (changedProps.has("hass")) {
        this.shadowRoot?.querySelectorAll(".sensor-popup-chart > *").forEach((el) => {
          (el as HTMLElement & { hass: HomeAssistant }).hass = this.hass;
        });
      }
    }
  }

  private _buildPopupCharts(): void {
    const items = this._renderModel?.climateItems ?? [];
    const HistoryCard = customElements.get("hui-history-graph-card") as (new () => HTMLElement) | undefined;
    if (!HistoryCard) return;
    for (const item of items) {
      const entityId = this._entityIdForKey(item.key);
      if (!entityId) continue;
      const container = this.shadowRoot?.querySelector<HTMLElement>(`.sensor-popup-chart[data-key="${item.key}"]`);
      if (!container) continue;
      container.innerHTML = "";
      const card = new HistoryCard() as HTMLElement & { hass: HomeAssistant; setConfig(c: unknown): void };
      card.hass = this.hass;
      card.setConfig({ type: "history-graph", entities: [{ entity: entityId }], hours_to_show: 24 });
      container.appendChild(card);
    }
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

  protected willUpdate(changedProps: Map<string, unknown>): void {
    if (changedProps.has("hass") || changedProps.has("_config")) {
      if (this._config && this.hass) {
        // Rebuild automation IDs when hass first becomes available after setConfig
        if (changedProps.has("hass") && !this._automationEntityIds.length && this._config.ui?.automation_badge_enabled) {
          this._rebuildAutomationIds();
        }
        try {
          this._renderModel = computeRenderModel(this._config, this.hass, this._automationEntityIds);
          // Auto-reset hidden flag when all alerts clear so next alert always shows.
          if (this._alertsHidden && this._totalAlertCount() === 0) {
            this._alertsHidden = false;
            this._persistAlertPanels();
          }
        } catch (err) {
          console.error("[smart-area-card] computeRenderModel failed:", err);
        }
      }
    }
    this.toggleAttribute("alert", Boolean(this._renderModel?.hasAlert && !this._expanded));
    this.toggleAttribute("pressed", this._press.pressed);
  }

  protected shouldUpdate(changedProps: Map<string, unknown>): boolean {
    if (!changedProps.size) return true;
    if (
      changedProps.has("_config") ||
      changedProps.has("_expanded") ||
      changedProps.has("_showAutomationPanel") ||
      changedProps.has("_showClimateHistory") ||
      changedProps.has("_alertsHidden")
    ) {
      return true;
    }
    if (changedProps.has("hass")) {
      const hassExt = this.hass as HomeAssistantExtended;
      const signature = this._config
        ? createCardSignature(this._config, this.hass.states, this._automationEntityIds)
        : "";
      if (signature !== this._lastSignature) {
        this._lastSignature = signature;
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
    const cardStyles = {
      "--smart-room-active": colors?.active ?? "#ffd700",
      "--smart-room-alert": colors?.alert ?? "#ff3b30",
      "--smart-room-camera": colors?.camera ?? "#ff3b30",
      "--smart-room-surface": colors?.surface ?? "rgba(10, 16, 28, 0.42)",
      "--smart-room-text": colors?.text ?? "white",
      "--smart-room-muted": colors?.muted ?? "rgba(255,255,255,0.76)",
      ...(model.roomImageUrl
        ? {}
        : {
            backgroundImage: buildRoomBackgroundImage(model.roomBackground),
            backgroundSize: model.roomBackground ? "cover, cover" : "auto",
            backgroundPosition: model.roomBackground ? "top center, top center" : "center",
            backgroundRepeat: "no-repeat",
          }),
    };

    return html`
      <ha-card
        style=${styleMap(cardStyles)}
        aria-expanded=${this._config.expander?.enabled !== false ? String(this._expanded) : nothing}
        @click=${this._handleCardClick}
      >
        ${model.roomImageUrl ? html`
          <div class="room-frame">
            <img class="room-image${model.roomImageDark ? " room-image--dark" : ""}" src=${model.roomImageUrl} alt="" aria-hidden="true" />
            <div class="room-mask"></div>
          </div>
        ` : nothing}
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

  private _renderHeader(): TemplateResult {
    const model = this._renderModel!;
    const room = this._config!.room;
    const climateItems = model.climateItems.map((item) => html`
      <div class="climate-item ${item.className}">
        <ha-icon icon=${item.icon}></ha-icon>
        ${item.value}
      </div>
    `);

    const totalAlerts = this._totalAlertCount();
    const alertBadge = totalAlerts > 0
      ? html`<div class="header-alerts"><button class="header-pill header-pill-red header-pill-button header-pill-clickable" @click=${(e: Event) => this._handleAlertBadgeClick(e)}><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${totalAlerts > 1 ? html`<span class="badge-count">${totalAlerts}</span>` : nothing}</button></div>`
      : nothing;

    return html`
      <section class="header">
        <div class="header-top">
          <div class="title-line">
            ${alertBadge}
            ${this._config?.ui?.show_area_icon && model.areaIcon ? html`<ha-icon icon=${model.areaIcon}></ha-icon>` : nothing}
            <span>${room}</span>
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

          ${this._config?.ui?.header_climate_more_info === false
            ? html`<div class="climate climate-static">${climateItems}</div>`
            : html`<button class="climate climate-button" @click=${this._handleClimateClick}>${climateItems}</button>`}
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

    if (!flatPanels.length || this._alertsHidden) return nothing;

    return html`${flatPanels.map(({ icon, message }) => html`
      <section class="alert-bar">
        <ha-icon icon=${icon}></ha-icon>
        <div class="alert-lines"><div>${message}</div></div>
      </section>
    `)}`;
  }

  private _handleAlertBadgeClick(event: Event): void {
    event.stopPropagation();
    this._alertsHidden = !this._alertsHidden;
    this._persistAlertPanels();
  }

  private _renderAutomationBadge(): TemplateResult | typeof nothing {
    if (!this._config?.ui?.automation_badge_enabled) return nothing;
    const count = this._renderModel?.badgeCounts?.automation ?? 0;
    if (!count) return nothing;
    return html`<button class="automation-badge automation-badge-clickable" aria-label="${count} automations enabled" @click=${this._handleAutomationBadgeClick}><ha-icon icon="mdi:home-automation"></ha-icon><span class="badge-count">${count}</span></button>`;
  }

  private _handleAutomationBadgeClick = (event: Event): void => {
    event.stopPropagation();
    this._showAutomationPanel = !this._showAutomationPanel;
    this._persistAutomationPanel();
  };

  private _renderSensorPopup(): TemplateResult | typeof nothing {
    const items = this._renderModel?.climateItems ?? [];
    if (!items.length) return nothing;
    const roomName = this._config?.room ?? "Sensors";
    const close = (e: Event): void => { e.stopPropagation(); this._showClimateHistory = false; };

    const POPUP_META: Record<string, { label: string; color: string }> = {
      temperature:    { label: "Temperature",  color: "#f59e0b" },
      humidity:       { label: "Humidity",     color: "#3b82f6" },
      co2:            { label: "CO₂",          color: "#10b981" },
      voc:            { label: "VOC",           color: "#8b5cf6" },
      pm25:           { label: "PM2.5",        color: "#ec4899" },
      pm10:           { label: "PM10",         color: "#db2777" },
      aqi:            { label: "Air Quality",  color: "#14b8a6" },
      presence:       { label: "Presence",     color: "#f97316" },
      noise:          { label: "Noise",        color: "#64748b" },
      illuminance:    { label: "Illuminance",  color: "#eab308" },
      power:          { label: "Power",        color: "#fb923c" },
      energy:         { label: "Energy",       color: "#16a34a" },
      carbon_monoxide:{ label: "CO",           color: "#dc2626" },
      radon:          { label: "Radon",        color: "#7c3aed" },
      moisture:       { label: "Moisture",     color: "#0ea5e9" },
    };

    return html`
      <div class="sensor-popup-overlay" @click=${close}>
        <div class="sensor-popup" @click=${(e: Event) => e.stopPropagation()}>
          <div class="sensor-popup-header">
            <div class="sensor-popup-header-icon"><ha-icon icon="mdi:gauge"></ha-icon></div>
            <span class="sensor-popup-title">${roomName}</span>
            <button class="sensor-popup-close" @click=${close} aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="sensor-popup-body">
            ${items.map((item) => {
              const entityId = this._entityIdForKey(item.key);
              const meta = item.key.startsWith("custom_")
                ? { label: this._config?.sensors?.custom?.[Number(item.key.slice(7))]?.name ?? item.key, color: "#94a3b8" }
                : (POPUP_META[item.key] ?? { label: item.key, color: "#94a3b8" });
              return html`
                <div class="sensor-popup-item ${entityId ? "sensor-popup-item--clickable" : ""}"
                  ${entityId ? html`@click=${(e: Event) => { e.stopPropagation(); fireEvent(this, "hass-more-info", { entityId }); }}` : nothing}>
                  <div class="sensor-popup-item-row">
                    <div class="sensor-popup-item-icon" style="--sensor-accent:${meta.color}">
                      <ha-icon icon=${item.icon}></ha-icon>
                    </div>
                    <div class="sensor-popup-item-meta">
                      <div class="sensor-popup-item-label">${meta.label}</div>
                      <div class="sensor-popup-item-value">${item.value}</div>
                      ${entityId ? html`<div class="sensor-popup-item-updated">${this._relativeTime(this.hass.states[entityId]?.last_updated)}</div>` : nothing}
                    </div>
                    ${entityId ? html`<ha-icon class="sensor-popup-item-chevron" icon="mdi:chevron-right"></ha-icon>` : nothing}
                  </div>
                  ${entityId ? html`<div class="sensor-popup-chart" data-key=${item.key}></div>` : nothing}
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  private _renderAutomationPanel(): TemplateResult | typeof nothing {
    if (!this._showAutomationPanel) return nothing;
    const automations = this._renderModel?.areaAutomations ?? [];
    if (!automations.length) return nothing;
    return html`
      <section class="automation-panel">
        <ha-icon icon="mdi:home-automation"></ha-icon>
        <div class="automation-list">
          ${automations.map((a) => html`
            <div class=${a.enabled ? "automation-item" : "automation-item automation-item-disabled"}>
              ${a.name}<span class="automation-last-run"> - ${_formatLastTriggered(a.lastTriggered)}</span>
            </div>
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
            ${this._expanded || this._everExpanded ? this._renderGrid() : nothing}
          </div>
        </div>
      </section>
    `;
  }

  private _renderGrid(): TemplateResult {
    return html`
      <section class="device-zone">
        <div class="device-grid">
          ${this._renderModel?.devices.map((device) => this._renderDeviceSafe(device))}
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
        class="tile ${classMap({
          glass: this._config?.ui?.glassmorphism !== false,
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
        @pointerdown=${(event: PointerEvent) => this._handleDevicePointerDown(event, device)}
        @pointerup=${(event: PointerEvent) => this._handleDevicePointerUp(event, device)}
        @pointerleave=${this._onPressClear}
        @pointercancel=${this._onPressClear}
        @click=${this._swallowClick}
        @keydown=${(event: KeyboardEvent) => this._handleDeviceKeyDown(event, device)}
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
                  style=${this._imageFit.styleFor(device.image!)}
                  @load=${(event: Event) => this._imageFit.handleLoad(event, device.image!)}
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
    this._showClimateHistory = !this._showClimateHistory;
  };

  private _handleDevicePointerDown(event: PointerEvent, device: ComputedDeviceModel): void {
    event.stopPropagation();
    this._press.start(() => {
      // Re-lookup by key to get the latest computed state at hold time.
      const target = this._renderModel?.devices.find((d) => d.key === device.key);
      if (target) this._executeAction(target.config.hold_action, target);
    });
  }

  private _handleDevicePointerUp(event: PointerEvent, device: ComputedDeviceModel): void {
    event.stopPropagation();
    const didTap = this._press.commitTap();
    if (didTap) {
      this._executeAction(device.config.tap_action, device);
    } else {
      event.preventDefault();
    }
  }

  private _handleDeviceKeyDown(event: KeyboardEvent, device: ComputedDeviceModel): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    this._executeAction(device.config.tap_action, device);
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
      return;
    }
    const entityRegistry = (this.hass as HomeAssistantExtended | undefined)?.entities ?? {};
    this._automationEntityIds = resolveAreaAutomationIds(entityRegistry, this._config.room_id);
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

  private _restoreAlertPanels(): void {
    if (!this._config) return;
    if (this._config.expander?.persist_state === false) {
      this._alertsHidden = false;
      return;
    }
    this._alertsHidden = window.localStorage.getItem(storageKey(this._config, "alerts-closed")) === "true";
  }

  private _persistAlertPanels(): void {
    if (!this._config || this._config.expander?.persist_state === false) return;
    window.localStorage.setItem(storageKey(this._config, "alerts-closed"), String(this._alertsHidden));
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
