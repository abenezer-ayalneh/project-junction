# Documentation Conventions

## Authority

Each decision has one normative home. Other documents link to that home instead of restating the rule. This prevents policy, requirements, and architecture from drifting apart.

The current normative library is exactly the required suite listed in `docs/MANIFEST.md` (plus the root `README.md` and `CONTEXT-MAP.md`). Earlier lowercase working papers created while the conversation was being normalized are retained as non-normative historical drafts only. They are not an authority, may contain superseded wording, and must not be used to infer a decision or requirement. The manifest’s `legacy working papers` section names them explicitly.

## Status metadata

Every substantive document begins with a short status line containing:

- `Document status`: draft, reviewed, accepted, or superseded.
- `System claim`: specified, derived default, implemented, verified, or requires future validation.
- `Decision coverage`: relevant `DEC-*` ranges or IDs.
- `Normative owner`: the document responsible for the rule.

## Identifiers

| Prefix       | Meaning                      |
| ------------ | ---------------------------- |
| `SRC-CHAT-*` | Conversation source item     |
| `DEC-*`      | Decision                     |
| `REQ-P##-*`  | Future phase requirement     |
| `POL-*`      | Business policy              |
| `INV-*`      | Cross-context invariant      |
| `STATE-*`    | Lifecycle definition         |
| `API-*`      | API/interface convention     |
| `EVT-*`      | Domain event                 |
| `ADR-*`      | Architecture decision record |
| `CTL-*`      | Security or privacy control  |
| `TST-*`      | Test or acceptance scenario  |
| `RUN-*`      | Runbook                      |
| `REF-*`      | External evidence/reference  |

## Provenance rules

- A direct User selection is `USER-CONFIRMED`.
- A prior choice replaced by a later direct choice is `SUPERSEDED`, not deleted.
- A recommendation introduced by the assistant without a direct selection is `DERIVED-PLAN-DEFAULT`.
- A statement about law, provider capability, pricing, or deployment reality is `REQUIRES-FUTURE-VALIDATION` unless it has dated evidence.
- “Specified” is never evidence that a system exists or works.

## Writing rules

- Context files define nouns and avoid implementation detail.
- Policy documents define stable business rules and snapshots.
- Requirements describe observable outcomes and acceptance evidence.
- Architecture documents define future system shape and boundaries.
- Procedures include preconditions, steps, validation, rollback/recovery, and a not-yet-executed label.
