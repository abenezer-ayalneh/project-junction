# Identity, Vendors, Memberships, and Locations

> **Status:** Planned domain behavior; no identity or Vendor system exists yet.

## Identity boundary

Project Junction separates authentication identity from marketplace roles. Better Auth establishes a real `User`; the application resolves Customer identity, Vendor memberships, Staff linkage, and Platform grants into a typed `AccessContext`. A User may be both Customer and member of several Vendors. `[DEC-010, DEC-070, DEC-071, DEC-129]`

Real sign-in supports verified email/password and Google. Phone is optional and cannot be the sole assumed identity mechanism. Browser authentication uses a secure revocable cookie rather than a local-storage bearer token. `[DEC-068, DEC-071]`

Vendor Owner/Finance and every Platform role require MFA. Sensitive operations require recent authentication; the policy includes payment-method removal and must extend to comparable identity, finance, and authority changes. `[DEC-069, DEC-151]`

## Vendor aggregate

A Vendor represents one business seller. It owns:

- structured Storefront profile and branding;
- Vendor memberships and role assignments;
- one or more optional Locations;
- selected Platform-defined commercial/aftercare policies;
- provider/KYB onboarding references appropriate to the environment; and
- operational status sufficient to determine whether it may publish and accept new commitments.

The planning session did not confirm exact Vendor lifecycle state names, transition deadlines, or a detailed suspension/remediation workflow. Those must remain proposed design until confirmed; documentation must not present the assistant-authored lifecycle from the previous plan as a User decision.

## Membership and role policy

Preset least-privilege roles are Owner, Manager, Catalog, Fulfillment, Scheduler, Service Staff, and Finance, optionally Location-scoped. `[DEC-067]`

Role grants are additive only inside the same Vendor and allowed Location set. They do not transfer between a User’s Vendor memberships. Platform authority is separately granted and is never inferred from Vendor ownership.

Every membership change must be audited with actor, target User, Vendor, roles, Location scope, before/after values, and recent-auth/MFA evidence where required.

## Staff linkage

Staff is a Vendor scheduling profile, not an authentication role by itself. It may link to a User membership when operational access is needed. Staff qualification, allocation, and public visibility remain distinct:

- qualification controls which Services the Staff member can perform;
- allocation controls which Booking they are assigned;
- role grants control what screens/actions their User may access; and
- opt-in controls whether the Staff profile is public. `[DEC-019, DEC-150]`

A non-public Staff member may still satisfy an “any qualified Staff” allocation without exposing identity to public discovery. `[DEC-150]`

## Location aggregate

A Location belongs to exactly one Vendor and provides the operational anchor for:

- normalized structured address, contact, landmark, instructions, and map pin;
- Product stock and pickup;
- Staff schedules and in-person appointment availability;
- delivery zones, fee/minimum/free-threshold/ETA rules; and
- Vendor role scoping. `[DEC-017, DEC-054, DEC-055, DEC-067]`

MapTiler/MapLibre supplies map presentation and discovery assistance. Project Junction owns normalized pins and polygons and provides manual pin placement; raw provider payloads are not the domain record. `[DEC-095, DEC-128]`

## Verification posture

Public demo Vendor verification is synthetic. It must not accept real documents, call real registries, or imply that a fictional Vendor passed KYB. Sumsub may be demonstrated only in a private sandbox and must be described as such. Smile ID is not an Ethiopian KYB provider for this plan. `[DEC-066]`

A future real environment requires a new provider contract and legal/KYB determination; no portfolio state is portable proof. `[DEC-066, DEC-109]`

## Core authorization rules

- Catalog work requires Catalog/Manager/Owner authority in the active Vendor.
- Stock and fulfillment work requires Fulfillment/Manager/Owner and the affected Location.
- Schedule/Booking work requires Scheduler, assigned Service Staff, Manager, or Owner according to action and Location.
- Vendor finance views/actions require Finance/Owner and MFA/recent-auth where sensitive.
- Owner-level identity/security/provider changes cannot be performed by operational roles.
- A suspended/restricted Vendor must not accept new commitments; exact continuation access for existing Customer obligations is an unresolved policy to document before implementation.

These capability-to-role examples refine the confirmed least-privilege intent but do not authorize new role names. `[DEC-067, DEC-069]`

## Required records

- `UserRef` and verified identity state;
- `Vendor` and operational eligibility state;
- `VendorMembership` with role set and optional Location scope;
- `Location` with normalized address/pin;
- `Staff` with optional User link and public-consent state;
- KYB/provider references separated by environment;
- role/session/recent-auth/MFA audit events; and
- synthetic Demo Workspace/Persona bindings kept outside real identity.

## Acceptance invariants

- one User may switch between Customer and several Vendor memberships without authority leakage; `[DEC-010]`
- removing a membership invalidates future Vendor authorization and revokes/refreshes cached grants;
- Location-scoped authority cannot read or mutate another Location’s private operations;
- public profile queries never reveal non-consenting Staff; `[DEC-150]`
- public demo cannot generate real auth/KYB state; `[DEC-066, DEC-107]`
- no real session token is readable from local storage; and `[DEC-071]`
- every high-assurance role/action enforces MFA and recent-auth policy. `[DEC-069]`
