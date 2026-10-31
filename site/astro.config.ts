import { defineConfig } from "astro/config";
import markvault from "./integrations/markvault.ts";

export default defineConfig({
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: [markvault()],
  devToolbar: { enabled: false },
  server: { port: 4321 },
});
