import { css } from "lit";

export const smartRoomCardStyles = css`
  :host {
    /* — color tokens — */
    --smart-room-active: var(--accent-color, #ffd700);
    --smart-room-alert: #ff3b30;
    --smart-room-camera: #ff3b30;
    --smart-room-success: #34c759;
    --smart-room-warning: #ff9f43;
    --smart-room-surface: rgba(10, 16, 28, 0.42);
    --smart-room-text: var(--primary-text-color, #fff);
    --smart-room-muted: rgba(255, 255, 255, 0.76);
    --smart-room-border: rgba(255, 255, 255, 0.12);
    --smart-room-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);

    /* — spacing scale — */
    --sr-space-1: 4px;
    --sr-space-2: 8px;
    --sr-space-3: 12px;
    --sr-space-4: 16px;
    --sr-space-5: 24px;

    /* — radius scale — */
    --sr-radius-sm: 10px;
    --sr-radius-md: 14px;
    --sr-radius-lg: 18px;
    --sr-radius-full: 999px;

    /* — font-size scale — */
    --sr-text-xs: 0.7rem;
    --sr-text-sm: 0.72rem;
    --sr-text-base: 0.82rem;
    --sr-text-md: 0.92rem;
    --sr-text-lg: 1.28rem;
    --sr-text-title: 2.3rem;

    display: block;
  }

  ha-card {
    position: relative;
    overflow: hidden;
    border-radius: var(--sr-radius-lg);
    padding: 14px;
    color: var(--smart-room-text);
    border: 2px solid transparent;
    box-shadow: var(--smart-room-shadow);
    transition:
      transform 160ms ease,
      box-shadow 180ms ease,
      border-color 180ms ease;
  }

  :host([alert]) ha-card {
    border-color: var(--smart-room-alert);
    box-shadow:
      0 0 24px rgba(255, 59, 48, 0.32),
      var(--smart-room-shadow);
  }

  :host([pressed]) ha-card {
    transform: scale(0.992);
  }

  /* ── Room background (dark-mode <img> path) ─────────────────────── */
  .room-frame {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    border-radius: inherit;
  }

  .room-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
    transition: filter 600ms ease;
  }

  .room-image--dark {
    filter: brightness(0.38) saturate(0.5);
  }

  .room-mask {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.18) 0%,
      rgba(0, 0, 0, 0.42) 100%
    );
  }

  .shell {
    position: relative;
    z-index: 1;
    display: grid;
    gap: var(--sr-space-2);
    min-height: 0;
  }

  .summary-zone {
    position: relative;
    display: grid;
    gap: 6px;
    padding: 4px 2px 0;
    border-radius: 0;
    background: transparent;
  }

  .header {
    position: relative;
    z-index: 2;
    display: grid;
    gap: var(--sr-space-1);
  }

  .integration-banner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sr-space-3);
    align-items: start;
    padding: var(--sr-space-3);
    border-radius: 16px;
    background: rgba(7, 11, 20, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(14px) saturate(120%);
    -webkit-backdrop-filter: blur(14px) saturate(120%);
  }

  .integration-copy {
    display: grid;
    gap: var(--sr-space-1);
    min-width: 0;
  }

  .integration-title {
    font-size: var(--sr-text-md);
    font-weight: 800;
    color: white;
  }

  .integration-text,
  .integration-list {
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.82);
    line-height: 1.45;
    margin: 0;
  }

  .integration-list {
    padding-left: 1.1rem;
  }

  .integration-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 var(--sr-space-3);
    border-radius: var(--sr-radius-full);
    text-decoration: none;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sr-space-3);
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: var(--sr-space-2);
    font-size: var(--sr-text-title);
    font-weight: 800;
    color: white;
    line-height: 1.05;
    flex: 1;
    min-width: 0;
  }

  .header-alerts {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    flex-shrink: 0;
  }

  .header-states {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sr-space-2);
    flex: 1;
    min-width: 0;
  }

  .title-line ha-icon {
    --mdc-icon-size: 1em;
  }

  /* ── Unified header badge base ─────────────────────────────────── */
  .active-pill,
  .media-pill,
  .header-pill,
  .camera-rec,
  .automation-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--sr-radius-full);
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(255, 255, 255, 0.22);
    color: white;
    font-size: var(--sr-text-sm);
    line-height: 1;
    white-space: nowrap;
    vertical-align: middle;
  }

  .active-pill ha-icon,
  .media-pill ha-icon,
  .header-pill ha-icon,
  .automation-badge ha-icon {
    --mdc-icon-size: 15px;
    flex-shrink: 0;
  }

  /* ── Badge color variants ───────────────────────────────────────── */
  .header-pill-white {
    color: rgba(255, 255, 255, 0.92);
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.22);
  }

  .header-pill-green {
    color: var(--smart-room-success);
    border-color: color-mix(in srgb, var(--smart-room-success) 40%, transparent);
    background: color-mix(in srgb, var(--smart-room-success) 22%, transparent);
  }

  .header-pill-red {
    color: var(--smart-room-alert);
    border-color: color-mix(in srgb, var(--smart-room-alert) 55%, transparent);
    background: color-mix(in srgb, var(--smart-room-alert) 32%, transparent);
  }

  .header-pill-orange {
    color: var(--smart-room-warning);
    border-color: color-mix(in srgb, var(--smart-room-warning) 40%, transparent);
    background: color-mix(in srgb, var(--smart-room-warning) 22%, transparent);
  }

  /* Camera-rec: solid opaque fill (recording-active indicator) */
  .camera-rec {
    background: rgba(255, 59, 48, 0.9);
    border-color: transparent;
    font-weight: 800;
    letter-spacing: 0.04em;
    box-shadow: 0 0 10px rgba(255, 59, 48, 0.4);
  }

  /* Automation badge: HA primary color */
  .automation-badge {
    font: inherit;
    font-size: var(--sr-text-sm);
    border-color: color-mix(in srgb, var(--primary-color, #1565c0) 55%, transparent);
    background: color-mix(in srgb, var(--primary-color, #1565c0) 32%, transparent);
    cursor: default;
  }

  /* ── Interactive states ─────────────────────────────────────────── */
  .header-pill-button {
    appearance: none;
    -webkit-appearance: none;
    cursor: default;
  }

  .header-pill-clickable,
  .automation-badge-clickable {
    cursor: pointer;
    transition: opacity 140ms ease, transform 140ms ease;
  }

  .header-pill-clickable:hover,
  .automation-badge-clickable:hover {
    opacity: 0.8;
    transform: scale(1.08);
  }

  .climate {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--sr-space-1);
    color: white;
    text-align: right;
    line-height: 1;
    flex-shrink: 0;
    align-self: flex-start;
  }

  .climate-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sr-space-1);
    justify-content: flex-end;
    white-space: nowrap;
  }

  .climate-item ha-icon {
    --mdc-icon-size: 16px;
  }

  .climate-button {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .climate-static {
    cursor: default;
    pointer-events: none;
  }

  .temp,
  .climate-item.primary {
    font-size: var(--sr-text-lg);
    font-weight: 700;
  }

  .humidity {
    color: rgba(255, 255, 255, 0.82);
  }

  .glass {
    backdrop-filter: blur(20px) saturate(130%);
    -webkit-backdrop-filter: blur(20px) saturate(130%);
  }

  .expander {
    display: grid;
    gap: 0;
  }

  .expander-shell {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 220ms ease;
  }

  .expander-shell.open {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  .expander-inner {
    min-height: 0;
    overflow: hidden;
  }

  .device-zone {
    position: relative;
    padding: var(--sr-space-2) 0 0;
    border-radius: 0;
  }

  .device-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
    gap: 10px;
    z-index: 1;
  }

  .tile {
    position: relative;
    height: 110px;
    padding: 0;
    border-radius: var(--sr-radius-md);
    border: 1px solid transparent;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.15);
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    text-align: inherit;
    font: inherit;
    color: inherit;
    touch-action: manipulation;
    transition:
      transform 160ms ease,
      opacity 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .tile:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.85);
    outline-offset: 2px;
  }

  .tile.active {
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 0 0 18px rgba(255, 255, 255, 0.08);
  }

  .tile.active-accent {
    border-color: var(--smart-room-tile-accent);
    box-shadow: 0 0 25px color-mix(in srgb, var(--smart-room-tile-accent) 25%, transparent);
  }

  .tile.outlined {
    border-color: var(--smart-room-tile-accent, transparent);
    box-shadow: 0 0 18px color-mix(in srgb, var(--smart-room-tile-accent, transparent) 26%, transparent);
  }

  .tile.alert {
    border-color: var(--smart-room-alert-accent, var(--smart-room-alert));
    box-shadow: 0 0 20px color-mix(in srgb, var(--smart-room-alert-accent, var(--smart-room-alert)) 35%, transparent);
  }

  .tile.offline {
    opacity: 0.46;
    background: rgba(20, 20, 20, 0.1);
  }

  .tile.tile-error {
    opacity: 0.6;
    cursor: default;
    border-color: var(--smart-room-alert);
    box-shadow: 0 0 14px color-mix(in srgb, var(--smart-room-alert) 20%, transparent);
  }

  .tile-visual {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .tile-visual img {
    width: 65%;
    height: auto;
    max-width: 65%;
    max-height: 90%;
    object-fit: contain;
    object-position: center center;
    pointer-events: none;
  }

  .tile-header,
  .tile-footer {
    position: absolute;
    left: var(--sr-space-2);
    right: var(--sr-space-2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sr-space-2);
    z-index: 1;
  }

  .tile-header {
    top: var(--sr-space-2);
  }

  .tile-footer {
    bottom: var(--sr-space-1);
    font-size: 0.86rem;
    color: white;
    justify-content: flex-end;
  }

  .tile-label {
    position: absolute;
    left: 10px;
    bottom: var(--sr-space-2);
    right: 52px;
    z-index: 1;
    color: white;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .tile-name {
    font-size: var(--sr-text-base);
    font-weight: 700;
    line-height: 1;
  }

  .tile-state {
    font-size: var(--sr-text-xs);
    opacity: 0.82;
    text-transform: capitalize;
    line-height: 1;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.76rem;
  }

  .tile-header .badge ha-icon {
    --mdc-icon-size: 15px;
  }

  .tile-entity-icon {
    --mdc-icon-size: 13px;
    opacity: 0.82;
  }

  .tile-footer .badge {
    font-weight: 700;
  }

  .tile-footer .badge ha-icon {
    --mdc-icon-size: 12px;
  }

  .alert-bar {
    display: flex;
    align-items: center;
    gap: var(--sr-space-2);
    padding: 7px 10px;
    border-radius: var(--sr-radius-md);
    background: rgba(255, 59, 48, 0.32);
    backdrop-filter: blur(10px) saturate(120%);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    border: 1px solid rgba(255, 59, 48, 0.55);
    color: #fff7f5;
    font-size: 0.84rem;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    box-shadow: 0 8px 20px rgba(255, 59, 48, 0.16);
  }

  .alert-bar ha-icon {
    color: var(--smart-room-alert);
    --mdc-icon-size: 18px;
    flex: 0 0 auto;
    align-self: center;
  }

  .alert-lines {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .climate-history-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sr-space-2);
  }

  .climate-charts {
    display: flex;
    flex-direction: column;
    gap: var(--sr-space-2);
  }

  .climate-charts > * {
    border-radius: var(--sr-radius-md);
    overflow: hidden;
    --ha-card-border-radius: var(--sr-radius-md);
    --ha-card-background: rgba(10, 16, 28, 0.55);
    --ha-card-border-width: 0;
  }

  .climate-history-more {
    display: inline-flex;
    align-items: center;
    gap: var(--sr-space-2);
    align-self: flex-start;
    padding: 6px 12px;
    border-radius: var(--sr-radius-full);
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.84rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }

  .climate-history-more:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .climate-history-more ha-icon {
    --mdc-icon-size: 16px;
  }

  .automation-panel {
    display: flex;
    align-items: flex-start;
    gap: var(--sr-space-2);
    padding: 7px 10px;
    border-radius: var(--sr-radius-md);
    background: rgba(10, 132, 255, 0.28);
    backdrop-filter: blur(10px) saturate(120%);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    border: 1px solid rgba(10, 132, 255, 0.5);
    color: #e8f4ff;
    font-size: 0.84rem;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    box-shadow: 0 8px 20px rgba(10, 132, 255, 0.14);
  }

  .automation-panel ha-icon {
    color: #5fb3ff;
    --mdc-icon-size: 18px;
    flex: 0 0 auto;
    align-self: center;
  }

  .automation-list {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .automation-item {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .automation-item-disabled {
    opacity: 0.42;
    font-weight: 400;
  }

  .automation-last-run {
    font-weight: 400;
    opacity: 0.78;
  }

  .active-pill {
    color: var(--smart-room-active);
    border-color: color-mix(in srgb, var(--smart-room-active) 40%, transparent);
    background: color-mix(in srgb, var(--smart-room-active) 22%, transparent);
  }

  .active-pill ha-icon {
    color: var(--smart-room-active);
  }

  .media-main {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }

  .badge-count {
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    line-height: 1;
  }


  .media-waves {
    display: inline-flex;
    align-items: flex-end;
    gap: 1px;
    height: 12px;
  }

  .media-waves span {
    display: block;
    width: 2px;
    border-radius: var(--sr-radius-full);
    background: white;
    animation: smart-room-wave 0.9s ease-in-out infinite;
  }

  .media-waves span:nth-child(1) {
    height: 6px;
  }

  .media-waves span:nth-child(2) {
    height: 10px;
    animation-delay: 0.15s;
  }

  .media-waves span:nth-child(3) {
    height: 7px;
    animation-delay: 0.3s;
  }

  .slash {
    position: absolute;
    width: 140%;
    height: 2px;
    background: rgba(255, 255, 255, 0.7);
    transform: rotate(-45deg);
    top: 50%;
    left: -20%;
    z-index: 2;
  }

  .hidden-slot {
    display: none;
  }

  @media (max-width: 480px) {
    .title-line {
      font-size: 2.02rem;
    }

    .temp {
      font-size: 1.12rem;
    }

    .active-pill {
      min-height: 22px;
      font-size: 0.74rem;
    }
  }

  @keyframes smart-room-wave {
    0%,
    100% {
      transform: scaleY(0.65);
      opacity: 0.6;
    }

    50% {
      transform: scaleY(1.15);
      opacity: 1;
    }
  }
`;
