import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "asset-stub",
      load(id) {
        if (/\.(png|jpg|jpeg|svg|gif|webp)$/.test(id)) {
          return "export default '';";
        }
      },
    },
  ],
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
