import { createApiApp, type ApiDb } from './createApp.js';
import { loadEnvFileIfPresent } from './envFile.js';
import { loadServerConfig } from './serverConfig.js';
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
  corsAllowedOrigins: config.miniAppCorsOrigins,
  rateProvider: createStaticUsdtRubRateProvider(config.rates),
});

await app.listen({ port: config.port, host: config.host });
