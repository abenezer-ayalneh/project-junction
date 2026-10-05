# Local Development Setup

> **Document status:** implemented procedure; live OAuth/browser acceptance pending
> **Decision coverage:** [`DEC-190`](../governance/DECISION-REGISTER.md#dec-190)
> **Normative owner:** local development bootstrap

Local development uses a Junction-only PostgreSQL database, Redis, MinIO, ClamAV, Mailpit, and fresh local accounts. It never imports staging data or uses staging secrets. The services bind to loopback; browser access and Better Auth callbacks use `http://localhost:3000`.

## Configure an ignored local environment

For a first local setup, copy `.env.local.example` to ignored `.env`; if `.env` already exists, merge the local settings rather than overwriting it. Generate a unique local Better Auth secret and add the Google OAuth client values only to that ignored file. Do not commit or paste them into chat.

```sh
cp .env.local.example .env
```

The configuration requires `JUNCTION_RUNTIME_MODE=local`, `FOUNDATION_STORAGE=postgresql`, loopback PostgreSQL and Redis URLs, `BETTER_AUTH_URL=http://localhost:3000`, Mailpit SMTP at `127.0.0.1:1025`, and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. The runtime rejects remote PostgreSQL or Redis endpoints, a non-local callback origin, or missing Google credentials.

## Create a fresh local state and start it

`env:local:reset` removes only this Compose project's named local volumes. Use it for the agreed fresh local accounts/database; it is destructive to the local Junction services.

```sh
pnpm env:local:reset
pnpm env:local:up
set -a; source .env; set +a
pnpm db:migrate:local
pnpm db:auth:migrate
pnpm dev
```

The web development server binds to `127.0.0.1:3000`; the API binds to `127.0.0.1:3001`. Open Mailpit at `http://localhost:8025` to complete email verification and password recovery. Keep the terminal that runs `pnpm dev` open while using the local browser journeys. After changing `.env`, stop the existing `pnpm dev`, source the updated file in that terminal, then start `pnpm dev` again so the API and web server receive the same local OAuth values:

```sh
set -a; source .env; set +a
pnpm dev
```

## Google OAuth Console procedure

1. In Google Cloud Console, create or select a project dedicated to local development. Do not add the localhost callback or credentials to a project used for staging or production.
2. Open **Google Auth Platform → Branding**. Set the app name to `Project Junction Local Development`, then choose the support and developer contact emails inside Google Console; do not put those addresses in repository evidence.
3. Under **Audience**, select **External** and keep the app in **Testing**. Add only the Google accounts that will run the local consent and account-linking checks. See Google’s current [OAuth consent setup guide](https://developers.google.com/workspace/guides/configure-oauth-consent).
4. Open **Google Auth Platform → Clients** and create an OAuth 2.0 **Web application** client. Add `http://localhost:3000` as an authorized JavaScript origin. Google’s [client setup guide](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) notes localhost origins for testing.
5. Add this exact authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
6. Put the client ID and client secret in ignored `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart the local web/API/worker processes.
7. For same-email linking, use a Google tester identity that has not signed in locally yet. First create its email/password account, verify the address in Mailpit, then choose **Continue with Google** using the same address. Confirm one User identity retains its memberships and permissions. Repeat with a separate verified email/password account and a different Google address, and confirm the identities stay separate. A Google redirect URI must match the registered scheme, host, port, and path exactly; see [Google’s web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

The user confirmed a successful new Google-only account login on 2026-10-05 after an earlier attempt returned `/api/auth/error?error=invalid_code`. A reverse-order email/password signup for that existing address correctly received Better Auth's generic duplicate response and sent no email. The user later confirmed that the documented email/password → Mailpit verification → Google sign-in order worked with an unused tester, and that the different-email non-linking case also worked. Both linking outcomes are accepted by user report; membership/permission preservation still needs direct verification. Do not store credentials, cookies, tokens, or personal account data in repository evidence.

## Local reviewer administration

After an email-verified account has an active local session, an operator can issue a local reviewer grant. The command rejects an active Vendor membership and records an audit row. Grant/revoke does not create Vendor ownership or bypass the no-self-approval rule.

```sh
LOCAL_REVIEWER_EMAIL=reviewer@example.test LOCAL_OPERATOR_LABEL=local-dev pnpm local:reviewer grant
LOCAL_REVIEWER_EMAIL=reviewer@example.test LOCAL_OPERATOR_LABEL=local-dev pnpm local:reviewer revoke
```

## Required local acceptance

Before calling the local Phase 00 scope accepted, run the revised cases in [Phase 00 manual acceptance](../quality/PHASE-00-MANUAL-ACCEPTANCE.md): signup, Mailpit verification/recovery, Google callback/linking, sign-out and session revocation/expiry, Owner switching, reviewer grant/revoke, cross-Vendor denial, and publication/live delivery/replay without duplicate business effects. MFA and Didit are a separate [pre-public-release gate](../requirements/PHASE-AND-RELEASE-GATES.md).
