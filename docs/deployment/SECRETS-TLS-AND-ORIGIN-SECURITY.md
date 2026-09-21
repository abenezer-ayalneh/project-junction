# Secrets, TLS, and Origin Security

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-069`–`DEC-074`, `DEC-095`–`DEC-097`, `DEC-100`–`DEC-101`, `DEC-110`, `DEC-153`](../governance/DECISION-REGISTER.md)
> **Normative owner:** deployment secret delivery and edge/origin trust

## Secret model

SOPS+age encrypted configuration is decrypted on the host into Docker Compose file secrets; CI receives no app secrets [DEC-110]. An offline age recovery key is stored separately from the VPS and ordinary developer devices. Staging and portfolio production have independent data-encryption, session, database, Redis, provider, webhook, OAuth, object-storage, backup, and VAPID private keys.

Applications read secrets from mounted files rather than environment strings where supported. Files are least-readable, not embedded in images/config output, and removed/replaced through documented rotation. Provider tokens such as connected Google credentials are encrypted at application level with a versioned key reference; the exact cryptographic envelope is a **DERIVED-PLAN-DEFAULT** requiring security review.

## TLS and origin

Cloudflare proxies public traffic. Full Strict validates the origin certificate; Caddy terminates at the origin. Host firewall policy accepts public web traffic only from current verified Cloudflare ranges, while restricted SSH uses separate rules [DEC-097]. Direct-IP/alternate-host requests are rejected, and the application validates expected host/origin.

Authenticated Origin Pulls or an equivalent origin-authentication control is a **DERIVED-PLAN-DEFAULT** unless separately accepted. Edge controls do not replace CSRF, session, authorization, rate limiting, or upload/provider verification.

## Target rotation procedure

**Procedure status: Specified — Not Executed — Not Verified.**

1. Identify secret owner, dependents, current version, compromise status, and whether overlap is supported.
2. Create a new provider/internal secret in the correct environment without exposing it to CI/logs.
3. Encrypt/update the SOPS source and deliver/decrypt it on host.
4. Deploy consumers capable of accepting old/new values where protocol requires overlap.
5. Switch issuance/use, verify health and callbacks, then revoke the old value.
6. Re-encrypt persistent provider tokens if a data-encryption key changed.
7. Audit change, evidence, revocation, and recovery-copy update.

Compromise rotation additionally revokes sessions/tokens, scopes incident impact, preserves security evidence, and follows incident communication policy.

### Future operator command contract

Any future rotation tool receives a secret identifier/version reference only—never the secret value—through a restricted host/operator path, for example:

```sh
pnpm ops:secret:rotate -- --environment=<staging|portfolio> --secret-id=<approved-reference>
pnpm ops:secret:verify -- --environment=<staging|portfolio> --secret-id=<approved-reference>
```

These are **DERIVED-PLAN-DEFAULT** names, not existing scripts. The command interface must reject secret values in arguments, standard input, CI variables, logs, tickets, or generated output. Provider-console creation/revocation and host decryption are manually controlled steps with audit evidence, not automated by documentation.

## Target origin verification

**Procedure status: Specified — Not Executed — Not Verified.**

Verify certificate chain/hostname, Cloudflare proxy status, direct-origin denial, unexpected Host rejection, WebSocket upgrade, HSTS/CSP/security headers, staging privacy, SSH restriction, and fail-closed behavior when origin authentication or secret mount fails.

## Related documents

- [Infrastructure topology](INFRASTRUCTURE-AND-NETWORK-TOPOLOGY.md)
- [Configuration and secrets](../environments/CONFIGURATION-SECRETS-AND-SEED-DATA.md)
