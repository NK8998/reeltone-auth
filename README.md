# ReelTone Auth

NestJS and TypeScript service for ReelTone sign-in. It uses `oidc-provider` for downstream OpenID Connect and PostgreSQL for Auth accounts, email challenges, sessions, and grants. The [workspace Compose stack](../util/README.md) runs it alongside Reviews.

## Run locally

Start PostgreSQL with the [local Compose setup](../util/README.md#local-development). This service uses the `reeltone_auth` login on host port 5433. Generate keys and create `.env` once per local checkout.

```sh
npm ci
cp .env.example .env
npm run keys:generate
# Copy the printed AUTH_SECRET into .env.
# Set SMTP_USER and SMTP_PASS in .env.
npm run build
npm run migration:deploy
npm run dev
```

Set `SMTP_USER` and `SMTP_PASS` to your SMTP2GO SMTP credentials. Auth uses `mail.smtp2go.com:587` with STARTTLS and sends sign-up codes and password reset links from `MAIL_FROM`. Use a sender or domain verified in SMTP2GO. For local testing with codes printed in the Auth terminal, set `MAIL_TRANSPORT=console`. [SMTP2GO SMTP relay settings](https://developers.smtp2go.com/docs/smtp-relay)

In a second terminal, run `npm run preview` and open [localhost:3100](http://localhost:3100). This is a local OIDC test client. The profile page is at [localhost:3000/account](http://localhost:3000/account) after sign-in. It accepts an HTTPS profile picture URL.

## OAuth providers

Use `http://localhost:3000` as the local homepage URL and `https://auth.reeltone.site` as the production homepage URL. Register the exact callback below for each upstream provider. Use separate upstream app credentials for local and production environments.

| Provider | Local callback | Production callback |
| --- | --- | --- |
| Google | `http://localhost:3000/social/google/callback` | `https://auth.reeltone.site/social/google/callback` |
| GitHub | `http://localhost:3000/social/github/callback` | `https://auth.reeltone.site/social/github/callback` |

1. In Google Auth Platform, configure Branding and Audience, then create a **Web application** client under **Clients**. Add the local URL in the table to **Authorized redirect URIs**. If required by the Audience settings, add your Google account as a test user. [Google OAuth client setup](https://developers.google.com/workspace/guides/create-credentials)
2. In GitHub, open **Settings → Developer settings → OAuth Apps** and register an OAuth app. Use `http://localhost:3000` as the homepage and the local GitHub callback in the table. Generate a client secret on the app’s settings page. [GitHub OAuth app setup](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the local `.env`. Restart Auth and open the preview. The sign-in page displays each provider whose credentials are configured.

On first social sign-in, the user chooses their ReelTone username and verifies their contact email. An existing verified ReelTone email requires the original sign-in method.

Auth uses the provider's OAuth `state` to find the original OIDC request and return to its registered app callback. A provider callback with no state returns to the Auth homepage. The homepage lists the apps in `OIDC_CLIENTS`. Use `client_name` and `client_uri` to set each app's display name and homepage. If they are omitted, Auth uses the client ID and the first registered redirect's origin.

## Deploy

Build and publish this image, then configure the [production Compose stack](../util/README.md#production). Provide `AUTH_SECRET`, `AUTH_JWKS` (private JSON key set), `MAIL_FROM`, and `OIDC_CLIENTS` through the production runtime environment. Configure mail with `SMTP_URL` or with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`. A nonempty `SMTP_URL` takes precedence. Keep the signing keys and cookie secret stable across container replacements. Use a distinct client secret for each production application.

Register exact production callback URLs in `OIDC_CLIENTS`. Production clients use `client_secret_basic`, and all clients use authorization code flow with S256 PKCE. Applications discover Auth from `https://auth.reeltone.site/.well-known/openid-configuration` and enforce their own permissions. A password reset revokes the affected Auth sessions and tokens. Downstream applications own revocation of their own session cookies.
