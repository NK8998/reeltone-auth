import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { Accounts, Mailer } from './accounts.js';
import { config } from './config.js';
import { Database } from './db.js';
import { InteractionController } from './interactions.js';
import { OidcService } from './oidc.js';
import { SocialLogin } from './social.js';

@Module({
  controllers: [InteractionController],
  providers: [Database, OidcService, Accounts, Mailer, SocialLogin],
})
class AuthModule {}

const server = express();
server.disable('x-powered-by');
if (config.trustProxy) server.set('trust proxy', 1);
server.use(helmet({
  contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.secure ? [] : null } },
  referrerPolicy: { policy: 'no-referrer' },
}));
const app = await NestFactory.create(AuthModule, new ExpressAdapter(server), { bodyParser: false });
app.enableShutdownHooks();

const protocol = app.get(OidcService).provider.callback();
const uiPaths = new Set(['/', '/readyz', '/account', '/forgot-password', '/reset', '/reset-link.js']);
server.use((req, res, next) => {
  if (uiPaths.has(req.path) || req.path.startsWith('/interaction/') || req.path.startsWith('/social/')) {
    res.set('Cache-Control', 'no-store');
    next();
    return;
  }
  void protocol(req, res);
});
server.use(express.urlencoded({ limit: '12kb', parameterLimit: 20, extended: false }));
await app.listen(config.port, config.host);
