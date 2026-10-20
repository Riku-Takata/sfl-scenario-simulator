import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

const siteUrl = process.env.SITE_URL
  ? process.env.SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://sfl-simulator.vercel.app";

export default defineConfig({
  site: siteUrl,
  output: "static",
  integrations: [react(), sitemap()],
  server: {
    port: 3002,
    host: true,
  },
});
