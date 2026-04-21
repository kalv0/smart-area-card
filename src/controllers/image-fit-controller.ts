import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { ImageFitStyle } from "../types/card-model";

export class ImageFitController implements ReactiveController {
  private readonly _host: ReactiveControllerHost;
  private _styles: Record<string, ImageFitStyle> = {};

  constructor(host: ReactiveControllerHost) {
    this._host = host;
    host.addController(this);
  }

  hostConnected(): void {}
  hostDisconnected(): void {}

  styleFor(src: string): string {
    const fit = this._styles[src];
    if (!fit) return "width:auto;height:90%;max-width:65%;";
    return `width:${fit.width};height:${fit.height};`;
  }

  handleLoad(event: Event, src: string): void {
    if (this._styles[src]) return;
    const image = event.currentTarget as HTMLImageElement | null;
    if (!image) return;
    this._styles = {
      ...this._styles,
      [src]: image.naturalHeight > image.naturalWidth
        ? { width: "auto", height: "90%" }
        : { width: "65%", height: "auto" },
    };
    this._host.requestUpdate();
  }
}
