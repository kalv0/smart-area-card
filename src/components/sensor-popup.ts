import { LitElement, css, html, nothing, type TemplateResult } from "lit";
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
const SENSOR_CHART_CACHE = new Map<string, HTMLElement>();

export class SmartAreaSensorPopup extends LitElement {
  static styles = css`
    :host {
      color: white;
      font-family: var(--primary-font-family, inherit);
    }

    .sensor-popup-overlay {
      position: fixed;
      inset: 0;
      z-index: 999;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(6px) saturate(120%);
      -webkit-backdrop-filter: blur(6px) saturate(120%);
      display: flex;
      align-items: center;
      justify-content: center;
      overscroll-behavior: contain;
      touch-action: none;
      animation: popup-fade-in 180ms ease both;
    }

    @keyframes popup-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .sensor-popup {
      background-color: rgba(9, 12, 22, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 22px;
      width: min(520px, calc(100vw - 28px));
      max-height: calc(100dvh - 56px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      touch-action: auto;
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      animation: popup-scale-in 200ms cubic-bezier(0.34, 1.36, 0.64, 1) both;
    }

    @keyframes popup-scale-in {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .sensor-popup-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 20px 20px 16px;
      flex-shrink: 0;
    }

    .sensor-popup-title {
      flex: 1;
      font-size: 1.45rem;
      font-weight: 800;
      color: white;
      line-height: 1.1;
      letter-spacing: 0;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
    }

    .sensor-popup-close {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      --mdc-icon-size: 16px;
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    .sensor-popup-close:hover {
      background: rgba(255, 255, 255, 0.14);
      color: white;
    }

    .sensor-popup-body {
      overflow-y: auto;
      min-height: 0;
      flex: 1 1 auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 11px;
      overscroll-behavior: contain;
    }

    .sensor-popup-item {
      flex: 0 0 auto;
      background: rgba(12, 16, 26, 0.52);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 18px;
      overflow: hidden;
      backdrop-filter: blur(22px) saturate(145%);
      -webkit-backdrop-filter: blur(22px) saturate(145%);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18), 0 1px 0 rgba(255, 255, 255, 0.08) inset;
      transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
    }

    .sensor-popup-item:hover {
      background: rgba(18, 23, 34, 0.58);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    .sensor-popup-item--alert {
      border-color: rgba(255, 69, 58, 0.86);
      box-shadow: 0 0 0 1px rgba(255, 69, 58, 0.28) inset, 0 12px 34px rgba(0, 0, 0, 0.2), 0 0 24px rgba(255, 69, 58, 0.16);
    }

    .sensor-popup-item--alert:hover {
      border-color: rgba(255, 69, 58, 0.86);
    }

    .sensor-popup-item-row {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 14px 14px 10px;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: inherit;
      appearance: none;
      -webkit-appearance: none;
    }

    .sensor-popup-item-row--toggle {
      cursor: pointer;
    }

    .sensor-popup-item-row--toggle:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.75);
      outline-offset: -4px;
    }

    .sensor-popup-item-icon {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--sensor-accent, #94a3b8) 16%, rgba(255, 255, 255, 0.06));
      border: 1px solid color-mix(in srgb, var(--sensor-accent, #94a3b8) 28%, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-size: 22px;
      color: var(--sensor-accent, #94a3b8);
      flex-shrink: 0;
    }

    .sensor-popup-item-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sensor-popup-item-label {
      font-size: 0.76rem;
      color: rgba(255, 255, 255, 0.45);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .sensor-popup-item-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
      line-height: 1.1;
    }

    .sensor-popup-item-entity,
    .sensor-popup-item-updated {
      font-size: 0.76rem;
      color: rgba(255, 255, 255, 0.62);
      line-height: 1.25;
      overflow-wrap: anywhere;
    }

    .sensor-popup-item-updated {
      font-size: 0.84rem;
      color: rgba(255, 255, 255, 0.48);
    }

    .sensor-popup-side {
      display: inline-grid;
      justify-items: end;
      gap: 6px;
      margin-left: auto;
      align-self: center;
      flex: 0 1 auto;
      min-width: 0;
    }

    .sensor-popup-battery-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      width: fit-content;
      padding: 4px 7px;
      border-radius: 999px;
      color: var(--battery-color, rgba(255, 255, 255, 0.76));
      background: color-mix(in srgb, var(--battery-color, rgba(255, 255, 255, 0.76)) 16%, rgba(255, 255, 255, 0.08));
      border: 1px solid color-mix(in srgb, var(--battery-color, rgba(255, 255, 255, 0.76)) 28%, rgba(255, 255, 255, 0.12));
      font-size: 0.68rem;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
    }

    .sensor-popup-battery-tag ha-icon {
      --mdc-icon-size: 13px;
    }

    .sensor-popup-alert-flags {
      display: inline-grid;
      grid-auto-columns: max-content;
      justify-items: start;
      gap: 6px;
      width: fit-content;
      max-width: none;
      padding: 7px 9px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.09);
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset;
      pointer-events: none;
    }

    .sensor-popup-alert-title {
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      line-height: 1;
      text-transform: uppercase;
    }

    .sensor-popup-alert-flag {
      display: block;
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.64rem;
      font-weight: 750;
      line-height: 1.2;
      text-align: left;
      white-space: nowrap;
    }

    .sensor-popup-alert-flag--active {
      color: #ff8a80;
    }

    .sensor-popup-item-arrow {
      --mdc-icon-size: 22px;
      color: rgba(255, 255, 255, 0.66);
      align-self: center;
      margin-left: 2px;
      flex-shrink: 0;
    }

    .sensor-popup-actions {
      display: flex;
      justify-content: flex-end;
      padding: 0 12px 12px;
    }

    .sensor-popup-more-button {
      border: 0;
      border-radius: 999px;
      padding: 7px 13px;
      background: rgba(255, 255, 255, 0.14);
      color: rgba(255, 255, 255, 0.88);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
    }

    .sensor-popup-more-button:hover {
      background: rgba(255, 255, 255, 0.24);
      color: white;
    }

    .sensor-popup-chart {
      padding: 0 10px 12px;
    }

    .sensor-popup-chart--hidden {
      display: none;
    }

    .sensor-popup-chart > * {
      border-radius: 10px;
      overflow: hidden;
      --ha-card-border-radius: 10px;
      --ha-card-background: rgba(0, 0, 0, 0.25);
      --ha-card-border-width: 0;
    }

    .sensor-popup-preload {
      position: fixed;
      left: -10000px;
      top: 0;
      width: min(492px, calc(100vw - 56px));
      min-height: 240px;
      opacity: 0.01;
      pointer-events: none;
      z-index: -1;
    }
  `;

  @property({ attribute: false }) public items: SensorPopupItem[] = [];
  @property({ attribute: false }) public popupStyles: Record<string, string> = {};
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ type: Boolean }) public charts = false;

  private _chartBuildVersion = 0;
  private _cardHelpersPromise?: Promise<CardHelpers | undefined>;
  private _chartItemsSignature = "";

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
          <div class="sensor-popup-preload" aria-hidden="true"></div>
        </div>
      </div>
    `;
  }

  protected updated(changedProps: Map<PropertyKey, unknown>): void {
    const chartItemsSignature = this.items
      .filter((item) => item.interactive && item.entityId && item.key)
      .map((item) => `${item.key}:${item.entityId}`)
      .join("|");
    if (changedProps.has("charts") || chartItemsSignature !== this._chartItemsSignature) {
      this._chartBuildVersion += 1;
      this._chartItemsSignature = chartItemsSignature;
    }
    if (this.charts && this.hass) {
      void this._buildCharts();
    } else {
      this._syncVisibleCharts();
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
          <div class="sensor-popup-chart ${item.expanded ? "" : "sensor-popup-chart--hidden"}" data-key=${item.key}></div>
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
    const preload = this.renderRoot.querySelector<HTMLElement>(".sensor-popup-preload");
    if (!preload) return;
    await Promise.all(this.items.map(async (item) => {
      if (!item.interactive || !item.entityId || !item.key) return;
      const cached = SENSOR_CHART_CACHE.get(item.entityId) as (HTMLElement & { hass?: HomeAssistant }) | undefined;
      if (cached) {
        cached.hass = this.hass;
        if (!cached.parentElement) preload.appendChild(cached);
        return;
      }
      const card = await this._createHistoryGraphCard(item.entityId);
      if (!card || buildVersion !== this._chartBuildVersion || !this.isConnected) return;
      card.dataset.entityId = item.entityId;
      SENSOR_CHART_CACHE.set(item.entityId, card);
      preload.appendChild(card);
    }));
    this._syncVisibleCharts();
  }

  private _syncVisibleCharts(): void {
    const preload = this.renderRoot.querySelector<HTMLElement>(".sensor-popup-preload");
    if (!preload) return;
    const expandedKeys = new Set(this.items.filter((item) => item.expanded).map((item) => item.key));
    this.items.forEach((item) => {
      if (!item.interactive || !item.entityId || !item.key) return;
      const card = SENSOR_CHART_CACHE.get(item.entityId);
      if (!card) return;
      const visible = this.renderRoot.querySelector<HTMLElement>(`.sensor-popup-chart[data-key="${item.key}"]`);
      if (expandedKeys.has(item.key) && visible && card.parentElement !== visible) {
        visible.replaceChildren(card);
      } else if (!expandedKeys.has(item.key) && card.parentElement !== preload) {
        preload.appendChild(card);
      }
    });
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
    this.renderRoot.querySelectorAll(".sensor-popup-chart").forEach((container) => {
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
