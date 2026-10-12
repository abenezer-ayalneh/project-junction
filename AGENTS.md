# Development environment policy

- Perform all development and testing on the user's local machine.
- Do not use staging or remote hosts for development, routine verification, or acceptance testing, and do not deploy to staging unless the user explicitly requests it.
- If a check cannot be completed locally, report the limitation instead of falling back to staging. Historical staging runbooks and acceptance plans do not authorize remote work.
- Include this policy in delegated agent instructions and handoffs so every agent working on this project follows it.

# Project memory: phase execution

- Git workflow preference (2026-10-12): use `main` as the integrated local baseline and one temporary `codex/` branch per implementation chunk. Start each chunk from clean, updated `main`; merge locally verified work and evidence before starting another chunk. Keep at most two active work branches. Use separate worktrees for simultaneous work. Exclude package stores from commits.

- User preference (2026-10-12): start chunked delivery at Phase 02. Phases 02–06 have ordered implementation chunks in their requirement documents.
- When asked to do the next thing on a phase, select and complete exactly one next unfinished chunk, then stop. Resume an in-progress chunk first; do not execute the entire phase or automatically continue to another chunk/phase.
- Read `docs/STATUS.md` for the active phase/next chunk and the requested phase document for scope, dependencies and evidence. If no phase is specified, use that recorded active phase.
- Preserve existing work; source files alone do not establish completion. Verify locally, update the phase chunk status and dated evidence plus affected docs and `docs/STATUS.md`, then report the next chunk. Keep blocked chunks open and record the missing dependency instead of skipping.
- The workflow is documented in `docs/requirements/MULTIPHASE-REQUIREMENTS.md#single-chunk-workflow`; phase/public-release gates remain separate from local chunk completion.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
