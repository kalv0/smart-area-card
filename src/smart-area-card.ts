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
  storageKeyForConfig,
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
import { createCardSignature } from "./helpers/room-model";
import { computeRenderModel } from "./helpers/compute-render-model";
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
  door_open:   { pillClass: "header-pill header-pill-orange", icon: "mdi:door-open" },
  door_closed: { pillClass: "header-pill header-pill-green",  icon: "mdi:door-closed" },
  lock_open:   { pillClass: "header-pill header-pill-red",    icon: "mdi:lock-open-variant" },
  lock_closed: { pillClass: "header-pill header-pill-green",  icon: "mdi:lock" },
  presence:    { pillClass: "header-pill header-pill-white",  icon: "mdi:account" },
  fire:        { pillClass: "header-pill header-pill-red",    icon: "mdi:fire-alert" },
  water:       { pillClass: "header-pill header-pill-red",    icon: "mdi:water-alert" },
  plug_off:    { pillClass: "header-pill header-pill-white",  icon: "mdi:power-plug-off-outline" },
  low_battery: { pillClass: "header-pill header-pill-red",    icon: "mdi:battery-alert-variant-outline" },
};

function _formatLastTriggered(lastTriggered: string | null | undefined): string {
  if (!lastTriggered) return "nunca ejecutada";
  const date = new Date(lastTriggered);
  if (isNaN(date.getTime())) return "nunca ejecutada";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(diffMs / 86400000);
  if (days < 30) return `hace ${days}d`;
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
        automation_badge_tap_navigate: true,
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

  private _renderModel?: RenderModel;
  private _lastSignature = "";

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
        automation_badge_tap_navigate: true,
      },
      expander: {
        enabled: true,
        initial_state: "closed",
        persist_state: true,
      },
      ...config,
    };

    this._restoreExpanded();
  }

  public getCardSize(): number {
    return this._expanded ? 7 : 4;
  }

  protected willUpdate(changedProps: Map<string, unknown>): void {
    if (changedProps.has("hass") || changedProps.has("_config")) {
      if (this._config && this.hass) {
        try {
          this._renderModel = computeRenderModel(this._config, this.hass);
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
    if (changedProps.has("_config") || changedProps.has("_expanded") || changedProps.has("_showAutomationPanel")) {
      return true;
    }
    if (changedProps.has("hass")) {
      const hassExt = this.hass as HomeAssistantExtended;
      const signature = this._config ? createCardSignature(this._config, this.hass.states, hassExt.entities) : "";
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

    const colors = this._config.ui?.colors;
    const cardStyles = {
      "--smart-room-active": colors?.active ?? "#ffd700",
      "--smart-room-alert": colors?.alert ?? "#ff3b30",
      "--smart-room-camera": colors?.camera ?? "#ff3b30",
      "--smart-room-surface": colors?.surface ?? "rgba(10, 16, 28, 0.42)",
      "--smart-room-text": colors?.text ?? "white",
      "--smart-room-muted": colors?.muted ?? "rgba(255,255,255,0.76)",
      backgroundImage: buildRoomBackgroundImage(this._renderModel.roomBackground),
      backgroundSize: this._renderModel.roomBackground ? "cover, cover" : "auto",
      backgroundPosition: this._renderModel.roomBackground ? "top center, top center" : "center",
      backgroundRepeat: "no-repeat",
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
            ${this._renderModel.hasAlert ? this._renderAlertBar() : nothing}
            ${this._renderAutomationPanel()}
          </section>
          ${this._renderExpander()}
        </div>
      </ha-card>
    `;
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

    return html`
      <section class="header">
        <div class="header-top">
          <div class="title-line">
            ${this._config?.ui?.show_area_icon && model.areaIcon ? html`<ha-icon icon=${model.areaIcon}></ha-icon>` : nothing}
            ${this._renderHeaderBadge("door_open")}
            ${this._renderHeaderBadge("door_closed")}
            ${this._renderHeaderBadge("lock_open")}
            ${this._renderHeaderBadge("lock_closed")}
            ${this._renderHeaderBadge("presence")}
            ${this._renderHeaderBadge("fire")}
            ${this._renderHeaderBadge("water")}
            ${this._renderHeaderBadge("plug_off")}
            ${this._renderHeaderBadge("low_battery")}
            <span>${room}</span>
            ${this._renderAutomationBadge()}
            ${this._renderHeaderBadge("light")}
            ${this._renderHeaderBadge("rec")}
            ${this._renderHeaderBadge("playing")}
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
        return cfg ? html`<span class="${cfg.pillClass}"><ha-icon icon=${cfg.icon}></ha-icon>${countLabel}</span>` : nothing;
      }
    }
  }

  private _renderAlertBar(): TemplateResult {
    return html`
      <section class="alert-bar">
        <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
        <div class="alert-lines">
          ${(this._renderModel?.alertReasons ?? []).map((reason) => html`<div>${reason}</div>`)}
        </div>
      </section>
    `;
  }

  private _renderAutomationBadge(): TemplateResult | typeof nothing {
    if (!this._config?.ui?.automation_badge_enabled) return nothing;
    const count = this._renderModel?.badgeCounts?.automation ?? 0;
    if (!count) return nothing;
    const label = `${count} automations enabled`;
    const navigates = this._config.ui?.automation_badge_tap_navigate !== false;
    const content = html`<ha-icon icon="mdi:home-automation"></ha-icon><span class="badge-count">${count}</span>`;
    if (navigates) {
      return html`<button class="automation-badge automation-badge-clickable" aria-label=${label} @click=${this._handleAutomationBadgeClick}>${content}</button>`;
    }
    return html`<span class="automation-badge" aria-label=${label}>${content}</span>`;
  }

  private _handleAutomationBadgeClick = (event: Event): void => {
    event.stopPropagation();
    this._showAutomationPanel = !this._showAutomationPanel;
  };

  private _getAreaAutomations(): Array<{ name: string; enabled: boolean; lastTriggered?: string | null }> {
    const roomId = this._config?.room_id?.trim();
    if (!roomId || !this.hass) return [];
    const entityRegistry = (this.hass as HomeAssistantExtended).entities ?? {};
    const automations = Object.values(this.hass.states).filter((entity) => {
      if (!entity.entity_id.startsWith("automation.")) return false;
      return entityRegistry[entity.entity_id]?.area_id === roomId;
    });
    const enabled = automations.filter((e) => e.state === "on");
    const disabled = automations.filter((e) => e.state !== "on");
    const toItem = (e: (typeof automations)[0]) => ({
      name: String(e.attributes.friendly_name ?? e.entity_id),
      enabled: e.state === "on",
      lastTriggered: e.attributes.last_triggered as string | null | undefined,
    });
    return [...enabled.map(toItem), ...disabled.map(toItem)];
  }

  private _renderAutomationPanel(): TemplateResult | typeof nothing {
    if (!this._showAutomationPanel) return nothing;
    const automations = this._getAreaAutomations();
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
          ${this._config?.ui?.show_entity_icons ? html`<ha-icon class="tile-entity-icon" icon=${device.icon}></ha-icon>` : nothing}
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
    if (this._config?.expander?.enabled === false) {
      return;
    }
    this._toggleExpanded();
  };

  private _handleClimateClick = (event: Event): void => {
    event.stopPropagation();
    if (this._config?.ui?.header_climate_more_info === false) {
      this._toggleExpanded();
      return;
    }

    const entities = this._renderModel?.climateEntities ?? [];
    if (!entities.length) {
      return;
    }

    this._openPopupOrInfo(entities[0], {
      title: "Clima",
      size: "wide",
      card: {
        type: "entities",
        entities,
      },
    });
  };

  private _handleDevicePointerDown(event: PointerEvent, device: ComputedDeviceModel): void {
    event.stopPropagation();
    this._press.start(() => {
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
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
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
    const targetEntity = action?.entity ?? device.key;

    if (resolved === "none") {
      return;
    }

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

    if (entityId) {
      this._showMoreInfo(entityId);
    }
  }

  private _showMoreInfo(entityId: string): void {
    fireEvent(this, "hass-more-info", { entityId });
  }

  private _toggleExpanded(): void {
    this._expanded = !this._expanded;
    this._everExpanded ||= this._expanded;
    this._persistExpanded();
  }

  private _restoreExpanded(): void {
    if (!this._config) return;

    const defaultExpanded = this._getInitialExpandedState();
    if (this._config.expander?.persist_state === false) {
      this._expanded = defaultExpanded;
      this._everExpanded = defaultExpanded;
      return;
    }

    const stored = window.localStorage.getItem(storageKeyForConfig(this._config));
    this._expanded = stored ? stored === "true" : defaultExpanded;
    this._everExpanded = this._expanded;
  }

  private _persistExpanded(): void {
    if (!this._config || this._config.expander?.persist_state === false) {
      return;
    }
    window.localStorage.setItem(storageKeyForConfig(this._config), String(this._expanded));
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
