import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiApp, type ApiDb } from './createApp.js';
import { loadEnvFileIfPresent } from './envFile.js';
import { loadServerConfig } from './serverConfig.js';
import { registerMiniAppStaticFrontend } from './staticFrontend.js';
import { createStaticUsdtRubRateProvider } from '../rates/rateQuoteService.js';

loadEnvFileIfPresent();

const config = loadServerConfig(process.env);
const { prisma } = await import('../db/prisma.js');

const app = createApiApp({
  db: prisma as unknown as ApiDb<unknown>,
  enableAdminRoutes: config.enableAdminRoutes,
  adminApiToken: config.adminApiToken,
  adminActorIds: config.adminActorIds,
  adminSessionSecret: config.adminApiToken,
  telegramBotToken: config.telegramBotToken,
  telegramInitDataMaxAgeSeconds: config.telegramInitDataMaxAgeSeconds,
  allowMiniAppDevAuth: config.allowMiniAppDevAuth,
  corsAllowedOrigins: config.miniAppCorsOrigins,
  rateProvider: createStaticUsdtRubRateProvider(config.rates),
});

registerMiniAppStaticFrontend(app, { rootDir: resolveMiniAppBuildRoot() });

await app.listen({ port: config.port, host: config.host });

function resolveMiniAppBuildRoot(): string {
  const compiledBuildRoot = fileURLToPath(new URL('../../mini-app', import.meta.url));
  if (existsSync(compiledBuildRoot)) {
    return compiledBuildRoot;
  }

  return fileURLToPath(new URL('../../dist/mini-app', import.meta.url));
}
