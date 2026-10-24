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
  // Use the standard /_vercel endpoints on both build hosts. Vercel otherwise
  // injects deployment-specific observability routes into the HTML, breaking
  // byte-for-byte verification of the HomeServer release.
  vite: {
    define: {
      "import.meta.env.PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG": "undefined",
      "import.meta.env.PUBLIC_VERCEL_OBSERVABILITY_BASEPATH": "undefined",
    },
  },
  server: {
    port: 3002,
    host: true,
  },
});
