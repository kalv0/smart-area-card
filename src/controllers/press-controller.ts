import type { ReactiveController, ReactiveControllerHost } from "lit";

export class PressController implements ReactiveController {
  private readonly _host: ReactiveControllerHost;
  private _timer?: number;
  private _longPressTriggered = false;
  private _tapHandled = false;

  pressed = false;

  constructor(host: ReactiveControllerHost) {
    this._host = host;
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.clear();
  }

  start(onLongPress: () => void, delayMs = 420): void {
    this.pressed = true;
    this._longPressTriggered = false;
    this._tapHandled = false;
    this._host.requestUpdate();
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => {
      this.pressed = false;
      this._longPressTriggered = true;
      this._tapHandled = true;
      this._host.requestUpdate();
      onLongPress();
    }, delayMs);
  }

  commitTap(): boolean {
    if (this._longPressTriggered || this._tapHandled) {
      this._longPressTriggered = false;
      this._tapHandled = false;
      this.clear();
      return false;
    }
    this._tapHandled = true;
    this.clear();
    return true;
  }

  clear(): void {
    this.pressed = false;
    window.clearTimeout(this._timer);
    this._host.requestUpdate();
  }
}
