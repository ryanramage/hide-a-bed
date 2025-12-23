# AI Agent Guide

This document orients automation and AI assistants working in hide-a-bed.

## Repository Overview

- **client/** – shipping CouchDB abstraction. See client/README.md for API reference.
- **stub/** – test double for CouchDB. Builds dual ESM/CJS bundles via dualmode.
- **test/** – internal integration tests that exercise client against stub helpers.
- **docs/** (within client) – reference material and diagrams.
- **schema/** and **impl/** (within client) – implementation modules and schema helpers. Files end with .mjs and follow the same coding standards.

## Environment Expectations

- Node.js 22.21.1 and npm 10.8.2 (enforced via Volta in client/package.json).
- Pure ESM codebase; avoid introducing CJS unless packaging requires it.
- Use npm; do not mix yarn or pnpm without prior confirmation.

## Common Workflows

- **Install dependencies**: `npm install` inside each package (client/, stub/, test/).
- **Build client**: `npm run build` inside client/ (runs tsdown then tsc).
- **Build stub**: `npm run build` inside stub/ (cleans, compiles TS, runs dualmode).
- **Run tests**:
  - client/: `npm test`
  - stub/: `npm test`
  - test/: `npm test`
- Tests rely on the shared global setup in `client/test/setup.mts`, which starts an in-memory PouchDB server and tears it down after the suite.
- When writing tests that use the shared database, ensure generated document IDs are unique per test run (for example, prefix with the test title plus `crypto.randomUUID()`) and avoid reusing hard-coded `_id` strings across suites. This keeps parallel runs isolated and prevents conflicts when the shared database still contains documents from previous tests.
- **Lint fixes**: `npm run lint:fix` (StandardJS) per package.

## Coding Guidelines

- Prefer small, pure functions; follow existing module patterns in client/impl.
- StandardJS provides linting rules; keep files eslint-clean.
- Type definitions live under client/types/output. When adjusting TS sources ensure generated `.d.mts` files stay in sync.
- Add focused comments only where non-obvious logic exists.

## Decision Heuristics for Agents

- Before edits, scan related README.md files for domain context.
- If touching CouchDB request logic, verify error handling in client/impl/errors.mts and transactionerrors.mts.
- Mirror existing retry/backoff helpers when adding network calls (see client/impl/retry.mts).
- Update or add tests alongside feature changes. Prefer placing new client tests in client/tests/ and stub tests in stub/tests/.
- Generate unique CouchDB `_id` values per run. Use helpers such as `crypto.randomUUID()` or test-name prefixes so suites do not collide inside the shared `hide-a-bed-test-db` that persists for the life of the test process.
- For cross-package changes, adjust stub/ and test/ as needed to keep APIs aligned.

## Verification Checklist

- Build passes in every affected package.
- Unit/integration tests updated and executed.
- No stray build artifacts (client/cjs, stub/cjs) left uncleaned if not part of change.
- Documentation (README.md, docs/, or schema comments) updated to reflect behavior changes.

## Communication

- Summaries should cite touched paths (e.g., client/impl/query.mjs) and outline risks.
- Note any follow-up tasks or open questions explicitly so maintainers can respond quickly.

Stay concise, surface risks early, and coordinate cross-package impacts when automation runs tasks.
