// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Set SITE_URL in Cloudflare Pages (Settings > Environment variables) once the domain is known.
const site = process.env.SITE_URL || 'https://ahmed-ibrahim.pages.dev';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  integrations: [sitemap()],
  vite: { build: { assetsInlineLimit: 0 } },
});
