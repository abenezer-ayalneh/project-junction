# Environment Separation and No Data Promotion

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-109`, `DEC-120`, `DEC-139`, `DEC-168`–`DEC-170`

Local, staging, portfolio production/demo, and a future commercial environment are separate trust, credential, network, storage, telemetry, and data domains. Data flows only from intentionally generated synthetic fixtures into non-commercial environments. It never flows from demo to staging, portfolio production, or commercial production; it never flows from commercial production to demo. Backups inherit their environment boundary.

Each environment needs unique accounts/keys, storage prefixes, databases, monitoring projects, provider sandbox/live configuration, and access groups. Schema and code artifacts may be promoted through controlled release gates; data, sessions, secrets, provider identities, and demonstration evidence are not promotion artifacts. Any exception requires a new explicit risk-reviewed decision.
