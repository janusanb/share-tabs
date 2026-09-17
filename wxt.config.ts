import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Share Tabs',
    short_name: 'Share Tabs',
    description:
      'Share a group of tabs across Chrome, Firefox, and Safari — no accounts, no server. Copy a manifest, export a file, or scan a QR code.',
    // Only permission we need: reading/opening tabs. No host permissions,
    // no background/service worker, no remote code, no analytics.
    permissions: ['tabs'],
    browser_specific_settings: {
      gecko: {
        // Placeholder id for local development and signing. Replace with
        // your own id (or remove this block) before publishing to AMO.
        id: 'share-tabs@example.com',
        strict_min_version: '109.0',
        // Required by AMO for all new submissions since Nov 3, 2025. This
        // extension collects and transmits nothing — everything happens
        // on-device via copy/paste, file export, or QR code.
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
