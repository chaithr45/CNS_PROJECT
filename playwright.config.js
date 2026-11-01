// playwright.config.js — end-to-end tests in real Chromium (npm run e2e).
// The server is started automatically on port 8199 with --no-open.
import { defineConfig } from '@playwright/test';

export const E2E_PORT = 8199;

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.js$/,
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    launchOptions: {
      // --no-proxy-server: some CI/cloud machines set HTTPS_PROXY, and Chromium would then send
      // ws:// to the LAN IP through that proxy. CipherCam never needs a proxy.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    },
    permissions: ['camera'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `node server/index.js --no-open --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'ignore',
  },
});
