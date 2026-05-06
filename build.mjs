import { build } from "esbuild";

await build({
  entryPoints: {
    "smart-area-card": "src/smart-area-card.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  target: "es2021",
  minify: true,
  sourcemap: false,
  logLevel: "info",
  loader: {
    ".png": "file",
  },
  assetNames: "assets/[name]",
});
