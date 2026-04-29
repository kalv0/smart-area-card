import { css } from "lit";

export const calvoRoomCardEditorStyles = css`
  :host {
    /* — editor color tokens — */
    --editor-panel: #1a2028;
    --editor-panel-2: #232b35;
    --editor-panel-3: #2a3440;
    --editor-border: #364150;
    --editor-text: #f5f7fa;
    --editor-muted: #9aa7b6;
    --editor-accent: #3b82f6;
    --editor-light: #f5c84c;
    --editor-camera: #ff6b6b;
    --editor-media: #d7dde6;
    --editor-lock: #ff9f43;
    --editor-custom: #4cc9f0;
    --editor-input: #0b1016;
    --editor-field: #10151b;
    --editor-danger: #b42323;
    --editor-danger-text: #fff4f1;
    --editor-required: #ff7272;
    --editor-success: #16a34a;
    /* — editor radius scale — */
    --editor-radius-sm: 10px;
    --editor-radius-md: 12px;
    --editor-radius-lg: 14px;
    --editor-radius-xl: 18px;
    --editor-radius-full: 999px;

    display: block;
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: 16px;
    color: var(--editor-text);
    overflow: hidden;
    box-sizing: border-box;
    contain: layout paint style;
    isolation: isolate;
  }

  /* ─── Layout ─────────────────────────────────────────── */

  .editor-shell {
    display: grid;
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    overflow: hidden;
    box-sizing: border-box;
    contain: layout paint style;
  }

  .stack,
  .devices-list,
  .conditions-list {
    display: grid;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }

  .stack {
    gap: 16px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    min-width: 0;
    max-width: 100%;
  }

  .row.single {
    grid-template-columns: 1fr;
  }

  .setup-inline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: stretch;
    min-width: 0;
    max-width: 100%;
  }

  /* ─── Area picker block ──────────────────────────────── */
  .area-picker-block {
    display: grid;
    gap: 6px;
  }

  .area-picker-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--editor-muted);
  }

  .area-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }

  /* ─── Reusable required / validation system ────────────────────────── */

  /* .req-outline — apply to any host element that needs a red ring */
  .req-outline {
    outline: 2px solid rgba(220, 38, 38, 0.7);
    outline-offset: 2px;
    border-radius: 8px;
  }

  /* .req-label — section label that turns red when invalid */
  .req-label {
    color: var(--editor-muted);
    transition: color 0.15s;
  }
  .req-label--invalid {
    color: rgba(248, 113, 113, 0.9) !important;
  }

  /* .req-badge — small "Required" pill inside a label */
  .req-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(248, 113, 113, 0.9);
    background: rgba(220, 38, 38, 0.15);
    border: 1px solid rgba(220, 38, 38, 0.35);
    border-radius: 4px;
    padding: 1px 5px;
  }

  /* .req-input-wrap — applied to <label> when its input is in error state */
  .req-input-wrap {
    border-color: rgba(220, 38, 38, 0.6) !important;
    background: rgba(220, 38, 38, 0.05) !important;
  }
  .req-input-wrap input {
    color: rgba(248, 180, 180, 0.95);
  }

  /* .req-error — red message below a field */
  .req-error {
    font-size: 0.72rem;
    color: rgba(248, 113, 113, 0.9);
    margin-top: -4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* .req-autofill-btn — inline link-style autofill button inside .req-error */
  .req-autofill-btn {
    background: none;
    border: 1px solid rgba(248, 113, 113, 0.45);
    color: rgba(248, 113, 113, 0.9);
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .req-autofill-btn:hover {
    background: rgba(220, 38, 38, 0.15);
  }

  /* ─── Background preview ────────────────────────────────────────── */
  .bg-preview {
    position: relative;
    overflow: hidden;
    border-radius: var(--editor-radius-md);
    border: 1px solid var(--editor-border);
    background: rgba(0, 0, 0, 0.28);
  }

  .bg-preview--banner,
  .bg-preview--split {
    height: 140px;
  }

  .bg-preview-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
  }

  /* Diagonal clip: right ~55% is dark, left ~45% is normal — no hard line.
     Overextend to 102% to avoid sub-pixel gap at border-radius edges. */
  .bg-preview-img--dark {
    filter: brightness(0.38) saturate(0.5);
    clip-path: polygon(calc(50% + 22px) -1%, 102% -1%, 102% 102%, calc(50% - 22px) 102%);
  }

  .bg-preview-tag {
    position: absolute;
    top: 6px;
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.72);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }

  .bg-preview-tag--left {
    left: 8px;
  }

  .bg-preview-tag--right {
    right: 8px;
  }

  .bg-preview-room-name {
    position: absolute;
    top: 50%;
    left: 10px;
    transform: translateY(-50%);
    font-size: 3rem;
    font-weight: 800;
    color: white;
    line-height: 1.05;
    text-shadow: 0 2px 8px rgba(0,0,0,0.65);
    pointer-events: none;
    z-index: 2;
  }

  .bg-preview-sensor-strip {
    position: absolute;
    top: 50%;
    right: 10px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    pointer-events: none;
    z-index: 2;
  }

  .bg-preview-sensor-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.82rem;
    white-space: nowrap;
    color: white;
    line-height: 1;
    text-shadow: 0 1px 4px rgba(0,0,0,0.55);
  }

  .bg-preview-sensor-item ha-icon {
    --mdc-icon-size: 16px;
  }

  .bg-preview-sensor-item--primary {
    font-size: 1.28rem;
    font-weight: 700;
  }

  /* ─── Editor header preview ─────────────────────────── */

  .editor-header-preview {
    position: relative;
    border-radius: var(--editor-radius-lg);
    overflow: hidden;
    background: rgba(10, 16, 28, 0.85);
    background-size: cover;
    background-position: top center;
    border: 1px solid var(--editor-border);
  }

  .ehp-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.42) 100%);
  }

  .ehp-top {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
  }

  .ehp-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 2.3rem;
    font-weight: 800;
    color: white;
    line-height: 1.05;
    flex: 1;
    min-width: 0;
    text-shadow: 0 2px 8px rgba(0,0,0,0.55);
  }

  .ehp-title--empty span {
    opacity: 0.35;
    font-style: italic;
  }

  .ehp-title ha-icon {
    --mdc-icon-size: 1em;
    flex-shrink: 0;
  }

  .ehp-sensors {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    color: white;
    text-align: right;
    line-height: 1;
    flex-shrink: 0;
  }

  .ehp-sensor-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    white-space: nowrap;
    font-size: 0.82rem;
    text-shadow: 0 1px 4px rgba(0,0,0,0.55);
  }

  .ehp-sensor-item ha-icon {
    --mdc-icon-size: 16px;
  }

  .ehp-sensor-item--primary {
    font-size: 1.28rem;
    font-weight: 700;
  }

  /* ─── Cards & panels ─────────────────────────────────── */

  .section,
  .device-card,
  .panel,
  .condition-card {
    display: grid;
    gap: 10px;
    background: var(--editor-panel);
    border: 1px solid var(--editor-border);
    border-radius: 18px;
    padding: 14px;
    min-width: 0;
    max-width: 100%;
    width: 100%;
    box-sizing: border-box;
  }

  .panel,
  .condition-card {
    background: var(--editor-panel-3);
    border-radius: 14px;
    padding: 12px;
  }

  .condition-card {
    background: #111722;
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }

  .device-card {
    position: relative;
    border-left: 6px solid var(--editor-custom);
    background: #1f4b58;
    grid-template-columns: 36px 1fr;
    padding: 0;
    overflow: hidden;
    border-color: rgba(76, 201, 240, 0.42);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .device-card[data-type="light"] {
    border-left-color: var(--editor-light);
    background: #5d4812;
    border-color: rgba(245, 200, 76, 0.48);
  }

  .device-card[data-type="camera"] {
    border-left-color: var(--editor-camera);
    background: #5a2323;
    border-color: rgba(255, 107, 107, 0.48);
  }

  .device-card[data-type="media_player"] {
    border-left-color: var(--editor-media);
    background: #414c59;
    border-color: rgba(215, 221, 230, 0.4);
  }

  .device-card[data-type="lock"] {
    border-left-color: var(--editor-lock);
    background: #5c3816;
    border-color: rgba(255, 159, 67, 0.5);
  }

  .device-card.dragging {
    opacity: 0.5;
  }

  .device-card.drop-target {
    outline: 2px dashed var(--editor-accent);
    outline-offset: 2px;
  }

  /* Left order column — same pattern as sensor-row-order */
  .device-order-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 10px 4px;
    background: rgba(0, 0, 0, 0.15);
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    align-self: stretch;
  }

  .device-body {
    display: grid;
    gap: 10px;
    padding: 14px;
    min-width: 0;
  }

  .panel-type-light {
    background: rgba(245, 200, 76, 0.28);
    border-color: rgba(245, 200, 76, 0.58);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .panel-type-camera {
    background: rgba(255, 107, 107, 0.28);
    border-color: rgba(255, 107, 107, 0.58);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .panel-type-media_player {
    background: rgba(215, 221, 230, 0.24);
    border-color: rgba(215, 221, 230, 0.5);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .panel-type-lock {
    background: rgba(255, 159, 67, 0.28);
    border-color: rgba(255, 159, 67, 0.58);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .panel-type-custom {
    background: rgba(76, 201, 240, 0.24);
    border-color: rgba(76, 201, 240, 0.5);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .panel-subgroup-offline {
    background: #4b5563;
    border-color: #94a3b8;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .panel-subgroup-states {
    background: #1d4ed8;
    border-color: #60a5fa;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .panel-subgroup-alerts {
    background: #b91c1c;
    border-color: #f87171;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .panel-grid {
    display: grid;
    gap: 12px;
  }

  .subsection {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(8, 12, 18, 0.42);
    border: 1px solid rgba(255, 255, 255, 0.09);
  }

  .subsection-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #dbe7f3;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* ─── Headers ────────────────────────────────────────── */

  .section-header,
  .panel-header,
  .devices-header,
  .device-header-main,
  .device-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .section-header,
  .device-header,
  .panel-header,
  .devices-header {
    justify-content: space-between;
  }

  .section-header {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .section-collapse-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    pointer-events: none;
  }

  .section-collapse-btn:focus,
  .section-collapse-btn:focus-visible {
    outline: none;
  }

  .section-collapsible {
    display: grid;
    grid-template-rows: 1fr;
    opacity: 1;
    transition: grid-template-rows 0.25s ease, opacity 0.2s ease;
  }

  .section-collapsible--collapsed {
    grid-template-rows: 0fr;
    opacity: 0;
  }

  .section-collapsible-inner {
    min-height: 0;
    overflow: hidden;
    display: grid;
    gap: 10px;
  }

  .device-header {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    align-items: start;
  }

  .climate-title {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    text-align: left;
  }

  .climate-title ha-icon {
    flex: 0 0 auto;
  }

  .climate-title span {
    display: inline-block;
  }

  .device-header-main {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
    padding-left: 0;
    padding-right: 0;
    max-width: 100%;
    overflow: visible;
  }

  .device-header-copy {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding-top: 0;
    max-width: 100%;
    overflow: visible;
  }

  .device-header-copy > * {
    min-width: 0;
  }

  .device-header-actions {
    display: flex;
    justify-content: flex-start;
    gap: 8px;
    margin-top: 0;
    margin-left: 0;
    width: 100%;
  }

  .device-tools {
    position: absolute;
    top: -8px;
    right: 0;
    display: grid;
    gap: 8px;
    align-content: start;
    justify-items: end;
    z-index: 1;
  }

  /* ─── Typography ─────────────────────────────────────── */

  .section-title,
  .device-title,
  .panel-title {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .device-title {
    color: #fff;
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .section-subtitle,
  .device-subtitle,
  .panel-subtitle,
  .hint,
  .collapsed-note,
  .required-note {
    font-size: 0.76rem;
    color: var(--editor-muted);
    line-height: 1.32;
  }

  .collapsed-note {
    padding-left: 30px;
  }

  .device-subtitle {
    color: rgba(255, 255, 255, 0.82);
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .field-title {
    font-size: 0.87rem;
    font-weight: 600;
    color: var(--editor-text);
  }

  .field-help {
    font-size: 0.76rem;
    color: var(--editor-muted);
    line-height: 1.32;
  }

  .required {
    color: var(--editor-required);
  }

  .required-note {
    color: #ff9e9e;
  }

  /* ─── Form elements ──────────────────────────────────── */

  label,
  .field-card {
    display: grid;
    gap: 4px;
    font-size: 0.87rem;
    font-weight: 600;
    background: var(--editor-field);
    border: 1px solid var(--editor-border);
    border-radius: 14px;
    padding: 10px 12px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  ha-entity-picker,
  ha-area-picker,
  ha-selector,
  ha-icon-picker {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  input,
  select,
  textarea,
  button {
    box-sizing: border-box;
    font: inherit;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    padding: 9px 10px;
    border-radius: var(--editor-radius-sm);
    border: 1px solid var(--editor-border);
    background: var(--editor-input);
    color: var(--editor-text);
  }

  textarea {
    min-height: 140px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.82rem;
  }

  input::selection,
  textarea::selection {
    background: rgba(59, 130, 246, 0.35);
    color: #fff;
  }

  .inline-control {
    display: grid;
    gap: 8px;
    background: var(--editor-field);
    border: 1px solid var(--editor-border);
    border-radius: 14px;
    padding: 10px 12px;
  }

  .inline-control.plain {
    background: transparent;
    border: none;
    padding: 0;
  }

  .inline-control-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .inline-trailing {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .inline-color-block {
    display: grid;
    gap: 3px;
  }

  .inline-color-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--editor-muted);
    letter-spacing: 0.02em;
  }

  .icon-picker-row {
    display: grid;
    gap: 10px;
  }

  .color-field {
    display: grid;
    gap: 6px;
  }

  /* ─── Buttons ────────────────────────────────────────── */

  button {
    border: 0;
    border-radius: 12px;
    padding: 10px 14px;
    cursor: pointer;
    color: #fff;
    background: var(--editor-accent);
    font-weight: 700;
  }

  button.secondary {
    background: #334155;
    color: var(--editor-text);
  }

  button.danger {
    background: var(--editor-danger);
    color: var(--editor-danger-text);
  }

  button.icon-button {
    min-width: 40px;
    min-height: 36px;
    padding: 8px 11px;
    line-height: 1;
    border-radius: 12px;
    background: rgba(7, 10, 15, 0.52);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    font-weight: 800;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  }

  button.icon-button:hover {
    background: rgba(7, 10, 15, 0.56);
    border-color: rgba(255, 255, 255, 0.24);
  }

  button.icon-button:disabled {
    opacity: 0.42;
    pointer-events: none;
    cursor: not-allowed;
  }

  /* ─── Device action buttons ──────────────────────────── */

  .device-remove,
  .device-duplicate {
    width: auto;
    min-width: 0;
    min-height: 42px;
    padding: 8px 11px;
    font-size: 0.74rem;
    line-height: 1;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    font-weight: 700;
  }

  .device-remove {
    background: rgba(185, 28, 28, 0.86);
    color: #fff;
    border-color: rgba(255, 190, 190, 0.22);
  }

  .device-remove:hover {
    background: rgba(220, 38, 38, 0.94);
  }

  .device-duplicate {
    background: rgba(30, 41, 59, 0.82);
    color: #f8fbff;
    border-color: rgba(148, 163, 184, 0.3);
  }

  .device-duplicate:hover {
    background: rgba(51, 65, 85, 0.92);
  }

  /* ─── Drag handle ────────────────────────────────────── */

  .drag-handle {
    display: inline-grid;
    place-items: center;
    flex: 1 1 auto;
    width: 28px;
    min-width: 28px;
    padding: 0;
    background: transparent;
    color: var(--editor-muted);
    cursor: grab;
    user-select: none;
    touch-action: none;
    border: 0;
    box-shadow: none;
    font-size: 1.6rem;
    letter-spacing: 1px;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-handle:hover {
    color: var(--editor-text);
    background: transparent;
  }

  .drag-handle:focus-visible {
    outline: 2px solid var(--editor-accent);
    outline-offset: 2px;
    border-radius: 8px;
  }

  /* ─── Pills ──────────────────────────────────────────── */

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: var(--editor-radius-full);
    font-size: 0.76rem;
    font-weight: 800;
    background: #0f1419;
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    width: max-content;
    max-width: 100%;
  }

  .pill ha-icon {
    --mdc-icon-size: 16px;
    flex: 0 0 auto;
  }

  .device-type-pill {
    margin-top: 2px;
    width: fit-content;
    max-width: 100%;
    justify-self: start;
  }

  .device-type-pill::before {
    content: none !important;
  }

  .device-header-actions .pill {
    grid-column: 1 / -1;
  }

  .device-card[data-type="light"] .pill::before    { content: "💡" }
  .device-card[data-type="camera"] .pill::before   { content: "📷" }
  .device-card[data-type="media_player"] .pill::before { content: "▶" }
  .device-card[data-type="lock"] .pill::before     { content: "🔒" }
  .device-card[data-type="custom"] .pill::before   { content: "◌" }

  .device-card[data-type="light"] .pill {
    background: var(--editor-light);
    border-color: var(--editor-light);
    color: #3d2f00;
  }

  .device-card[data-type="camera"] .pill {
    background: var(--editor-camera);
    border-color: var(--editor-camera);
    color: #fff;
  }

  .device-card[data-type="media_player"] .pill {
    background: var(--editor-media);
    border-color: var(--editor-media);
    color: #1f2937;
  }

  .device-card[data-type="lock"] .pill {
    background: var(--editor-lock);
    border-color: var(--editor-lock);
    color: #422500;
  }

  .device-card[data-type="custom"] .pill {
    background: var(--editor-custom);
    border-color: var(--editor-custom);
    color: #08303a;
  }

  /* ─── Type editor ────────────────────────────────────── */

  .type-edit {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    border-radius: var(--editor-radius-full);
    background: rgba(255, 255, 255, 0.22);
    color: inherit;
    font-size: 0.82rem;
    line-height: 1;
    border: 1px solid rgba(255, 255, 255, 0.28);
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .type-edit:hover {
    background: rgba(255, 255, 255, 0.3);
    opacity: 1;
  }

  .type-editor-footer {
    display: grid;
    gap: 8px;
    padding-top: 10px;
  }

  .type-editor-warning {
    background: rgba(180, 35, 35, 0.16);
    border: 1px solid rgba(248, 113, 113, 0.56);
    color: #ffd2d2;
    padding: 10px 12px;
    border-radius: 12px;
  }

  .type-editor-warning.is-active {
    animation: typeDraftShake 0.36s ease-in-out 2;
  }

  @keyframes typeDraftShake {
    0%, 100% { transform: translateX(0) }
    20%      { transform: translateX(-5px) }
    40%      { transform: translateX(5px) }
    60%      { transform: translateX(-4px) }
    80%      { transform: translateX(4px) }
  }

  .type-card {
    position: relative;
    padding: 0;
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
  }

  .type-select {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 10px;
    min-height: 104px;
    width: 100%;
    padding: 14px 14px 12px;
    border-radius: 0;
    background: transparent;
    font-size: 1rem;
    font-weight: 800;
    text-align: left;
    min-width: 0;
    max-width: 100%;
  }

  .type-select-icon {
    display: inline-grid;
    place-items: center;
    --mdc-icon-size: 20px;
  }

  .type-select-label {
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.05;
    word-break: break-word;
  }

  .type-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    min-width: 0;
    max-width: 100%;
  }

  .type-picker-button {
    padding: 14px 12px;
    border-radius: 14px;
  }

  .type-picker-button[data-type="light"]        { background: var(--editor-light); color: #3d2f00 }
  .type-picker-button[data-type="camera"]       { background: var(--editor-camera) }
  .type-picker-button[data-type="media_player"] { background: var(--editor-media); color: #1f2937 }
  .type-picker-button[data-type="lock"]         { background: var(--editor-lock); color: #422500 }
  .type-picker-button[data-type="custom"]       { background: var(--editor-custom); color: #08303a }

  .editor-lock {
    position: fixed;
    inset: 0;
    z-index: 9;
    background: transparent;
  }

  /* ─── Shared dropdown picker ─────────────────────────── */

  .color-control,
  .color-picker,
  .badge-picker {
    position: relative;
  }

  .color-picker summary,
  .badge-picker summary {
    list-style: none;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid var(--editor-border);
    background: var(--editor-field);
    color: var(--editor-text);
    cursor: pointer;
  }

  .color-picker summary::-webkit-details-marker,
  .badge-picker summary::-webkit-details-marker {
    display: none;
  }

  .color-picker[open] summary,
  .badge-picker[open] summary {
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }

  .color-picker-menu,
  .badge-menu {
    margin-top: 6px;
    display: grid;
    gap: 4px;
    padding: 8px;
    border-radius: 12px;
    border: 1px solid var(--editor-border);
    background: var(--editor-field);
    position: absolute;
    left: 0;
    right: 0;
    z-index: 5;
    box-shadow: 0 18px 30px rgba(0, 0, 0, 0.28);
  }

  .color-option,
  .badge-option {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    background: transparent;
  }

  .color-option:hover,
  .badge-option:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .color-swatch {
    width: 12px;
    height: 12px;
    border-radius: var(--editor-radius-full);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .inline-color-picker summary {
    min-width: 132px;
  }

  .badge-icon {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
  }

  .add-picker {
    display: grid;
    gap: 10px;
  }

  /* ─── Tag color picker ───────────────────────────────── */

  .tag-color-picker summary {
    grid-template-columns: 1fr auto;
  }

  .tag-color-picker .color-picker-menu {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .tag-color-picker .color-option {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border-radius: 10px;
  }

  .tag-color-option {
    display: block;
    width: 100%;
    height: 30px;
    min-height: 30px;
    border-radius: 8px;
  }

  /* ─── Toggle header ──────────────────────────────────── */

  .toggle-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .toggle-header-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .toggle-header-title {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--editor-text);
  }

  .toggle-header-desc {
    font-size: 0.72rem;
    line-height: 1.24;
    color: var(--editor-muted);
  }

  /* ─── iOS toggle ─────────────────────────────────────── */

  .ios-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid var(--editor-border);
    background: var(--editor-field);
    min-height: 54px;
  }

  .ios-toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .ios-toggle-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .ios-toggle-title {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--editor-text);
  }

  .ios-toggle-desc {
    font-size: 0.72rem;
    line-height: 1.24;
    color: var(--editor-muted);
  }

  .ios-toggle-switch {
    position: relative;
    flex: 0 0 auto;
    width: 48px;
    height: 30px;
    border-radius: var(--editor-radius-full);
    background: #475569;
    transition: background 0.18s ease;
  }

  .ios-toggle-switch::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: var(--editor-radius-full);
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
    transition: transform 0.18s ease;
  }

  .ios-toggle[data-checked="true"] .ios-toggle-switch {
    background: #34c759;
  }

  .ios-toggle[data-checked="true"] .ios-toggle-switch::after {
    transform: translateX(18px);
  }

  .ios-toggle[data-disabled="true"] {
    opacity: 0.55;
  }

  /* ─── Compact checkbox ───────────────────────────────── */

  .compact-check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 0 0;
  }

  .compact-check input {
    width: 15px;
    height: 15px;
    margin: 2px 0 0;
  }

  .compact-check-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .compact-check-title {
    font-size: 0.79rem;
    font-weight: 700;
    color: var(--editor-text);
  }

  .compact-check-desc {
    font-size: 0.7rem;
    line-height: 1.22;
    color: var(--editor-muted);
  }

  /* ─── Multi-select ───────────────────────────────────── */

  .multi-select {
    display: grid;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
  }

  .multi-select > summary {
    list-style: none;
    display: grid;
    gap: 6px;
    cursor: pointer;
  }

  .multi-select > summary::-webkit-details-marker {
    display: none;
  }

  .multi-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px;
    border-radius: var(--editor-radius-sm);
    border: 1px solid var(--editor-border);
    background: var(--editor-input);
    color: var(--editor-text);
  }

  .multi-select-value {
    font-size: 0.82rem;
    color: var(--editor-text);
  }

  .multi-select-menu {
    display: grid;
    gap: 8px;
    margin-top: 2px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid var(--editor-border);
    background: var(--editor-input);
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .multi-select-search {
    min-height: 38px;
  }

  .multi-select-options {
    display: grid;
    gap: 6px;
    max-height: 260px;
    overflow: auto;
    padding-right: 2px;
  }

  .multi-select-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--editor-radius-sm);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #131a22;
    color: var(--editor-text);
    text-align: left;
  }

  .multi-select-option input {
    width: 16px;
    height: 16px;
    margin: 0;
  }

  .multi-select-option-label {
    font-size: 0.82rem;
    font-weight: 600;
  }

  /* ─── Conditions ─────────────────────────────────────── */

  .condition-card-state {
    background: #0f172a;
    border-color: #60a5fa;
  }

  .condition-card-alert {
    background: #2a0f12;
    border-color: #f87171;
  }

  .stack-separated {
    display: grid;
    gap: 14px;
  }

  .conditions-shell {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    background: var(--editor-input);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .error-chip {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    padding: 0;
    border-radius: 0;
    background: none;
    color: #ff8e8e;
    border: none;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    max-width: max-content;
    white-space: nowrap;
  }

  /* ─── Extra fields ───────────────────────────────────── */

  .extra-field-shell {
    background: #102032;
    border: 1px solid rgba(76, 201, 240, 0.28);
    border-radius: 16px;
    padding: 12px;
    display: grid;
    gap: 10px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  }

  .extra-field-card {
    background: #15283d;
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .entity-selector-tools {
    display: grid;
    gap: 8px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .entity-selector-tools .compact-check {
    padding-top: 0;
  }

  /* ─── Misc ───────────────────────────────────────────── */

  .locked-panel {
    opacity: 0.72;
  }

  .preset-locked {
    opacity: 1;
  }

  .preset-banner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.8rem;
    color: #edf2f7;
    background: rgba(59, 130, 246, 0.18);
    border: 1px solid rgba(96, 165, 250, 0.35);
    border-radius: 12px;
    padding: 10px 12px;
  }

  .preset-copy {
    display: grid;
    gap: 4px;
  }

  .autofill-button {
    min-width: 152px;
    min-height: 54px;
    font-size: 0.92rem;
    border-radius: 14px;
  }

  .autofill-button--full {
    width: 100%;
    min-width: 0;
  }

  .editor-bullet-list {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 4px;
  }

  .editor-bullet-list-green {
    color: #86efac;
  }

  .cta-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 14px;
    border-radius: 12px;
    background: var(--editor-accent);
    color: #fff;
    text-decoration: none;
    font-weight: 800;
  }

  .cta-link-green {
    background: var(--editor-success);
  }

  .enabled-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 16px;
    border-radius: var(--editor-radius-full);
    background: var(--editor-success);
    color: #fff;
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: 0.04em;
  }

  .version-meta {
    display: grid;
    gap: 4px;
    font-size: 0.78rem;
    color: var(--editor-muted);
    text-align: right;
  }

  .standalone-note {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(96, 165, 250, 0.08);
    border: 1px solid rgba(96, 165, 250, 0.22);
    color: rgba(255, 255, 255, 0.82);
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .standalone-note-text {
    min-width: 0;
  }

  .standalone-note-link {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    padding: 0 10px;
    min-height: 28px;
    border-radius: var(--editor-radius-full);
    background: rgba(96, 165, 250, 0.14);
    border: 1px solid rgba(96, 165, 250, 0.3);
    color: #93c5fd;
    font-size: 0.74rem;
    font-weight: 700;
    text-decoration: none;
  }

  .standalone-note-link:hover {
    background: rgba(96, 165, 250, 0.22);
  }

  /* ─── Climate sensor rows ────────────────────────────── */

  .climate-sensor-list {
    display: grid;
    gap: 6px;
  }

  /* wrapper for ordered sensor list (preset + custom) */
  .sensor-ordered-list {
    display: grid;
    gap: 6px;
  }

  .sensor-row-wrapper {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 0;
    border-radius: var(--editor-radius-md);
    border: 1px solid rgba(255, 255, 255, 0.09);
    overflow: hidden;
    transition: opacity 150ms ease;
  }

  .sensor-row-wrapper--primary {
    border-color: rgba(245, 200, 76, 0.5);
    background: rgba(245, 200, 76, 0.04);
  }

  .sensor-row-wrapper.dragging {
    opacity: 0.4;
  }

  .sensor-row-wrapper.drop-target {
    border-color: var(--editor-accent);
  }

  .sensor-primary-badge {
    font-size: 0.85rem;
    color: var(--editor-light);
    line-height: 1;
    user-select: none;
  }

  .sensor-row-order {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 10px 4px;
    background: rgba(255, 255, 255, 0.04);
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    align-self: stretch;
  }

  .sensor-row-wrapper > .sensor-row {
    border: none;
    border-radius: 0;
    padding: 10px;
  }

  .sensor-row {
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(8, 12, 18, 0.42);
    border: 1px solid rgba(255, 255, 255, 0.09);
  }

  .sensor-row-custom {
    border-color: rgba(76, 201, 240, 0.28);
    background: rgba(76, 201, 240, 0.05);
  }

  /* preset sensor header row: icon + label + alert toggle */
  .sensor-row-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* custom sensor main row (icon + name input + entity + toggles + remove) */
  .sensor-row-main {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .sensor-row-icon {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    --mdc-icon-size: 18px;
    color: var(--editor-muted);
  }

  .sensor-row-label {
    flex: 1 1 auto;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--editor-text);
  }

  /* ─── Sensor chip — popup-style colored pill with icon + label ─── */
  .sensor-chip {
    --chip-color: #9aa7b6;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px 5px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--chip-color) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--chip-color) 32%, transparent);
    color: var(--chip-color);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    --mdc-icon-size: 18px;
    flex: 0 1 auto;
    min-width: 0;
  }

  .sensor-chip-input {
    background: none;
    border: none;
    border-radius: 0;
    padding: 0;
    color: inherit;
    font-size: inherit;
    font-weight: inherit;
    width: 110px;
    min-width: 60px;
  }

  .sensor-chip-input:focus {
    outline: none;
    box-shadow: none;
    background: none;
    border: none;
  }

  /* ─── Yellow tip above first sensor ─────────────────────── */
  .sensor-primary-tip {
    font-size: 0.72rem;
    font-weight: 600;
    color: #f59e0b;
    padding: 4px 0 2px 2px;
    letter-spacing: 0.01em;
  }

  /* full-width entity picker block below the header row */
  .sensor-row-body {
    display: grid;
    gap: 4px;
  }

  .show-all-check {
    /* reset label card styling */
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0 2px;
    /* own layout */
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--editor-muted);
    cursor: pointer;
  }

  .show-all-check input {
    width: 13px;
    height: 13px;
    margin: 0;
    flex: 0 0 auto;
  }

  /* entity picker inside sensor-row body */
  .sensor-row-body ha-entity-picker,
  .sensor-row-body ha-selector,
  .sensor-row-body .entity-field-wrap {
    width: 100%;
  }

  /* entity in custom sensor row (inline flex item) */
  .sensor-row-entity {
    flex: 1 1 180px;
    min-width: 0;
  }

  .sensor-row-alert-toggle {
    /* reset label card styling */
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    /* own layout */
    flex: 0 0 auto;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--editor-muted);
    cursor: pointer;
    white-space: nowrap;
  }

  /* strip ios-toggle card styling when nested inline */
  .sensor-row-alert-toggle .ios-toggle {
    padding: 0;
    border: none;
    background: none;
    min-height: 0;
    border-radius: 0;
    gap: 0;
  }

  .sensor-alert-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .sensor-alert-row label {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: 3px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--editor-muted);
  }

  .sensor-alert-row input {
    padding: 5px 8px;
    font-size: 0.8rem;
  }

  .sensor-alert-full {
    grid-column: 1 / -1;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: 3px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--editor-muted);
  }

  .sensor-name-input {
    flex: 1 1 100px;
    width: auto;
    min-width: 80px;
    padding: 5px 8px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .sensor-remove-btn {
    flex: 0 0 auto;
    min-width: 30px;
    min-height: 30px;
    padding: 4px 8px;
    border-radius: 8px;
    background: rgba(185, 28, 28, 0.7);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 800;
    border: 1px solid rgba(255, 190, 190, 0.2);
    line-height: 1;
  }

  .sensor-remove-btn:hover {
    background: rgba(220, 38, 38, 0.9);
  }

  .entity-field-wrap {
    position: relative;
  }

  .entity-field-wrap ha-selector,
  .entity-field-wrap ha-entity-picker {
    display: block;
    width: 100%;
  }

  .entity-clear-x {
    position: absolute;
    right: 44px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 5;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    --mdc-icon-size: 16px;
    transition: background 0.12s, color 0.12s;
  }

  .entity-clear-x:hover {
    background: rgba(185, 28, 28, 0.8);
    color: #fff;
    border-color: transparent;
  }

  .sensor-more-btn {
    width: 100%;
    font-size: 0.8rem;
    padding: 8px 12px;
    min-height: 36px;
  }

  .sensor-add-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    border-radius: var(--editor-radius-md);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
    color: var(--editor-muted);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    box-sizing: border-box;
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }

  .sensor-add-row:hover {
    border-color: rgba(255, 255, 255, 0.38);
    background: rgba(255, 255, 255, 0.07);
    color: var(--editor-text);
  }

  .sensor-row-icon-picker {
    padding-top: 2px;
  }

  /* ─── Responsive ─────────────────────────────────────── */

  @media (max-width: 720px) {
    :host {
      inline-size: 100%;
      max-inline-size: 100%;
      min-inline-size: 0;
      padding: 12px;
      box-sizing: border-box;
      overflow: hidden;
    }

    .editor-shell {
      inline-size: 100%;
      max-inline-size: 100%;
      min-inline-size: 0;
      overflow: hidden;
    }

    .stack,
    .devices-list,
    .conditions-list,
    .section,
    .device-card,
    .panel,
    .condition-card {
      width: 100%;
      max-width: 100%;
    }

    .setup-inline {
      grid-template-columns: minmax(0, 1fr);
    }

    .autofill-button {
      width: 100%;
      min-width: 0;
    }

    .inline-color-picker summary {
      min-width: 0;
    }

    .type-picker-grid {
      grid-template-columns: 1fr;
    }

    .device-tools {
      top: -8px;
      right: 0;
    }

    .device-remove,
    .device-duplicate {
      min-height: 40px;
    }

    .device-header-main {
      padding-right: 0;
      padding-left: 40px;
    }

    .device-header-copy,
    .device-title,
    .device-subtitle,
    .device-header-actions {
      width: 100%;
      max-width: 100%;
    }

    .device-type-pill {
      max-width: calc(100% - 4px);
    }

    .device-header-actions {
      grid-template-columns: repeat(3, max-content);
      justify-content: flex-start;
    }

    .device-card {
      overflow: clip;
    }
  }
`;
