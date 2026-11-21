import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import type { ClientMetadata, Configuration } from 'oidc-provider';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

function credentials(name: string) {
  const id = process.env[`${name}_CLIENT_ID`];
  const secret = process.env[`${name}_CLIENT_SECRET`];
  if (!id && !secret) return;
  if (!id || !secret) throw new Error(`Set both ${name} OAuth credentials`);
  return { id, secret };
}

const production = process.env.NODE_ENV === 'production';
const issuer = new URL(required('AUTH_ISSUER'));
const localHttp = !production && issuer.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(issuer.hostname);
if (issuer.href !== `${issuer.origin}/` || (issuer.protocol !== 'https:' && !localHttp)) {
  throw new Error('AUTH_ISSUER must be an HTTPS origin or a local HTTP origin in development');
}
const secret = required('AUTH_SECRET');
if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET must contain at least 32 bytes');

function json(value: string, name: string): unknown {
  try { return JSON.parse(value); } catch { throw new Error(`${name} must contain valid JSON`); }
}

const jwks = json(process.env.AUTH_JWKS || readFileSync(required('AUTH_JWKS_FILE'), 'utf8'), 'Auth signing keys') as Configuration['jwks'];
if (!jwks?.keys.some((key) => typeof key.kid === 'string' && 'd' in key)) {
  throw new Error('Provide a private OIDC signing key with a key ID');
}
const registeredClients = json(process.env.OIDC_CLIENTS ?? '[]', 'OIDC_CLIENTS');
if (!Array.isArray(registeredClients)) throw new Error('OIDC_CLIENTS must be a JSON array');
const clients = registeredClients.map((value: ClientMetadata): ClientMetadata => {
  if (!value.client_id || !value.redirect_uris?.length) throw new Error('Each client needs a client ID and redirect URI');
  if (production && (value.token_endpoint_auth_method !== 'client_secret_basic' ||
      typeof value.client_secret !== 'string' || Buffer.byteLength(value.client_secret) < 32)) {
    throw new Error('Production web clients require a client_secret_basic secret of at least 32 bytes');
  }
  for (const redirect of [...value.redirect_uris, ...(value.post_logout_redirect_uris ?? [])]) {
    const url = new URL(redirect);
    if (production && url.protocol !== 'https:') throw new Error('Production client redirects must use HTTPS');
  }
  return { ...value, response_types: ['code'], grant_types: ['authorization_code'] };
});
if (new Set(clients.map((client) => client.client_id)).size !== clients.length) throw new Error('Duplicate OIDC client ID');

const applications = clients.flatMap((client) => {
  const url = new URL(client.client_uri ?? client.redirect_uris![0]);
  const webUrl = url.protocol === 'https:' || (!production && url.protocol === 'http:');
  if (!webUrl || url.username || url.password) {
    if (client.client_uri) throw new Error(`Invalid homepage URL for OIDC client ${client.client_id}`);
    return [];
  }
  return [{ name: client.client_name ?? client.client_id, url: client.client_uri ? url.href : url.origin }];
});

const consoleMail = process.env.MAIL_TRANSPORT === 'console' && !production;
if (process.env.MAIL_TRANSPORT === 'console' && production) throw new Error('Production must use SMTP');
const smtp = consoleMail ? undefined : new URL(required('SMTP_URL'));
if (smtp && smtp.protocol !== 'smtp:' && smtp.protocol !== 'smtps:') throw new Error('Use an SMTP or SMTPS URL');
if (production && smtp?.protocol === 'smtp:') smtp.searchParams.set('requireTLS', 'true');

export const config = {
  production,
  secure: issuer.protocol === 'https:',
  issuer: issuer.origin,
  host: process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
  port: Number(process.env.PORT ?? 3000),
  trustProxy: process.env.AUTH_TRUST_PROXY === '1',
  secret,
  jwks,
  clients,
  applications,
  mailFrom: required('MAIL_FROM'),
  smtpUrl: smtp?.href,
  google: credentials('GOOGLE'),
  github: credentials('GITHUB'),
};

export function digest(purpose: string, value: string): Buffer {
  return createHmac('sha256', config.secret).update(purpose).update('\0').update(value).digest();
}
