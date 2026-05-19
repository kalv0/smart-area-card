import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant } from "custom-card-helpers";
import { getBatteryColor, getBatteryIcon } from "../helpers";

export type SensorPopupAlertFlag = { label: string; active: boolean };
export type SensorPopupBatteryInfo = { level?: number };
export type SensorPopupItem = {
  key?: string;
  icon: string;
  label?: string;
  value: string;
  entityId?: string;
  updated?: string;
  accent?: string;
  alert?: boolean;
  expanded?: boolean;
  interactive?: boolean;
  blur?: boolean;
  alertFlags?: SensorPopupAlertFlag[];
  batteryInfo?: SensorPopupBatteryInfo;
};
type CardHelpers = { createCardElement?: (config: unknown) => HTMLElement | Promise<HTMLElement> };
type WindowWithCardHelpers = Window & { loadCardHelpers?: () => Promise<CardHelpers> };

export class SmartAreaSensorPopup extends LitElement {
  @property({ attribute: false }) public items: SensorPopupItem[] = [];
  @property({ attribute: false }) public popupStyles: Record<string, string> = {};
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ type: Boolean }) public charts = false;

  private _chartBuildVersion = 0;
  private _cardHelpersPromise?: Promise<CardHelpers | undefined>;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected render(): TemplateResult {
    return html`
      <div class="sensor-popup-overlay" @click=${this._close} @wheel=${this._preventDefault} @touchmove=${this._preventDefault}>
        <div class="sensor-popup" style=${styleMap(this.popupStyles)} @click=${this._stopPropagation} @wheel=${this._stopPropagation} @touchmove=${this._stopPropagation}>
          <div class="sensor-popup-header">
            <span class="sensor-popup-title">Sensors</span>
            <button class="sensor-popup-close" type="button" @click=${this._close} aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="sensor-popup-body">
            ${repeat(this.items, (item, index) => item.key ?? String(index), (item) => this._renderItem(item))}
          </div>
        </div>
      </div>
    `;
  }

  protected updated(changedProps: Map<PropertyKey, unknown>): void {
    if (changedProps.has("items") || changedProps.has("charts")) {
      this._chartBuildVersion += 1;
    }
    if (this.charts && this.hass) {
      void this._buildCharts();
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._destroyCharts();
  }

  private _renderItem(item: SensorPopupItem): TemplateResult {
    const alertFlags = item.alertFlags ?? [];
    const batteryInfo = item.batteryInfo;
    const row = html`
      <span class="sensor-popup-item-icon" style="--sensor-accent:${item.accent ?? "#94a3b8"}">
        <ha-icon icon=${item.icon}></ha-icon>
      </span>
      <span class="sensor-popup-item-meta">
        <span class="sensor-popup-item-label">${item.label ?? "Sensor"}</span>
        <span class="sensor-popup-item-value">${item.value}</span>
        ${item.updated ? html`<span class="sensor-popup-item-updated">${item.updated}</span>` : nothing}
        ${item.entityId ? html`<span class="sensor-popup-item-entity">${item.entityId}</span>` : nothing}
      </span>
      ${alertFlags.length || batteryInfo ? html`
        <span class="sensor-popup-side">
          ${batteryInfo ? html`
            <span class="sensor-popup-battery-tag" style=${`--battery-color:${getBatteryColor(batteryInfo.level)}`}>
              <ha-icon icon=${getBatteryIcon(batteryInfo.level)}></ha-icon>
              ${batteryInfo.level !== undefined ? `${batteryInfo.level}%` : "Battery"}
            </span>
          ` : nothing}
          ${alertFlags.length ? html`
            <span class="sensor-popup-alert-flags">
              <span class="sensor-popup-alert-title">Alerts</span>
              ${alertFlags.map((flag) => html`<span class="sensor-popup-alert-flag ${flag.active ? "sensor-popup-alert-flag--active" : ""}">${flag.label}</span>`)}
            </span>
          ` : nothing}
        </span>
      ` : nothing}
      ${item.interactive ? html`<ha-icon class="sensor-popup-item-arrow" icon=${item.expanded ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon>` : nothing}
    `;

    return html`
      <div class="sensor-popup-item ${item.blur ? "glass" : ""} ${item.alert ? "sensor-popup-item--alert" : ""}">
        ${item.interactive ? html`
          <button
            class="sensor-popup-item-row sensor-popup-item-row--toggle"
            type="button"
            data-key=${item.key ?? ""}
            aria-expanded=${String(item.expanded)}
            @click=${this._toggle}
          >
            ${row}
          </button>
        ` : html`
          <div class="sensor-popup-item-row">${row}</div>
        `}
        ${this.charts && item.interactive ? html`
          <div
            class="sensor-popup-chart ${item.expanded ? "" : "sensor-popup-chart--hidden"}"
            data-key=${item.key}
            data-entity-id=${item.entityId ?? ""}
          ></div>
          ${item.expanded ? html`
            <div class="sensor-popup-actions">
              <button class="sensor-popup-more-button" type="button" data-entity-id=${item.entityId ?? ""} @click=${this._more}>Show more</button>
            </div>
          ` : nothing}
        ` : nothing}
      </div>
    `;
  }

  private _close = (event?: Event): void => {
    event?.stopPropagation();
    this.dispatchEvent(new CustomEvent("sensor-popup-close", { bubbles: true, composed: true }));
  };

  private _toggle = (event: Event): void => {
    event.stopPropagation();
    const key = (event.currentTarget as HTMLElement | null)?.dataset.key;
    if (!key) return;
    this.dispatchEvent(new CustomEvent("sensor-popup-toggle", { detail: { key }, bubbles: true, composed: true }));
  };

  private _more = (event: Event): void => {
    event.stopPropagation();
    const entityId = (event.currentTarget as HTMLElement | null)?.dataset.entityId;
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("sensor-popup-more", { detail: { entityId }, bubbles: true, composed: true }));
  };

  private _stopPropagation = (event: Event): void => {
    event.stopPropagation();
  };

  private _preventDefault = (event: Event): void => {
    event.preventDefault();
  };

  private async _buildCharts(): Promise<void> {
    const buildVersion = this._chartBuildVersion;
    const containers = new Map(
      Array.from(this.querySelectorAll<HTMLElement>(".sensor-popup-chart"))
        .map((container) => [container.dataset.key, container])
    );
    await Promise.all(this.items.map(async (item) => {
      if (!item.interactive || !item.entityId || !item.key) return;
      const container = containers.get(item.key);
      if (!container) return;
      const existing = container.firstElementChild as (HTMLElement & { hass?: HomeAssistant }) | null;
      if (existing?.dataset.entityId === item.entityId) {
        existing.hass = this.hass;
        return;
      }
      container.replaceChildren();
      const card = await this._createHistoryGraphCard(item.entityId);
      if (!card || buildVersion !== this._chartBuildVersion || !this.isConnected) return;
      card.dataset.entityId = item.entityId;
      container.replaceChildren();
      container.appendChild(card);
    }));
  }

  private async _createHistoryGraphCard(entityId: string): Promise<HTMLElement | undefined> {
    const config = { type: "history-graph", entities: [{ entity: entityId }], hours_to_show: 24 };
    this._cardHelpersPromise ??= (window as WindowWithCardHelpers).loadCardHelpers?.().catch(() => undefined);
    const helpers = await this._cardHelpersPromise;
    if (helpers?.createCardElement) {
      const card = await helpers.createCardElement(config) as HTMLElement & { hass?: HomeAssistant };
      card.hass = this.hass;
      return card;
    }

    const HistoryCard = customElements.get("hui-history-graph-card") as (new () => HTMLElement) | undefined;
    if (!HistoryCard || !this.hass) return undefined;
    const card = new HistoryCard() as HTMLElement & { hass: HomeAssistant; setConfig(c: unknown): void };
    card.hass = this.hass;
    card.setConfig(config);
    return card;
  }

  private _destroyCharts(): void {
    this._chartBuildVersion += 1;
    this.querySelectorAll(".sensor-popup-chart").forEach((container) => {
      container.replaceChildren();
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "smart-area-sensor-popup": SmartAreaSensorPopup;
  }
}

if (!customElements.get("smart-area-sensor-popup")) {
  customElements.define("smart-area-sensor-popup", SmartAreaSensorPopup);
}
