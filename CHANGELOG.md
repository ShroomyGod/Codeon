# Changelog

Every Codeon release is documented here. Release notes explain not only what changed, but why the workflow changed and where its boundaries are.

Version scheme: bug fixes increment patch versions; substantial feature releases increment the minor version. Every version gets its own tag and its own GitHub release (`1.2.0` lives under `v1.2.0` alone).

## v1.2.0

### 1.2.0 — 2026-10-10

- Maintenance release.

## Unreleased — startup fix (not yet released)

Fixed a fatal startup crash that shipped in 1.1.2: `registerIpc` registered the `projects:setMapCorrection` channel twice, so Electron threw during bootstrap and quit before any window opened. Removed the duplicate handler and an unreachable duplicate `knowledge_lookup` case in the tool runner. Added `tests/startup.test.ts`, which fails the suite if an IPC channel, tool definition, or runner case is ever registered twice, or if `INVOKE_CHANNELS` and the `ApiMap` drift apart. Also fixed a latent type error (`ResponseMode` not re-exported from `@shared/types`).

## Unreleased — experimental features and next-generation development

Sixteen local-first workflow tools join the agent catalog (`modify_plan`, `prototype`, `balance_scan`, `economy_analyze`, `procgen_analyze`, `combat_review`, `sync_analyze`, `docs_generate`, `onboard`, `migrate_plan`, `trace_requirements`, `failure_record`, `task_queue`, `review_report`, `workflow`, `api_check`), each mirrored by a typed `analysis:*` IPC channel and renderer wrappers in `src/renderer/src/analysis.ts`, with validated persistence channels (`prototypes:save`, `requirements:save`, `failures:save`, `tasks:save`, `docs:save`) and optional `Project`/`Settings` fields.

What this adds: plain-language change planning with affected systems, clarifications, and stated assumptions; isolated versioned mechanic prototypes with tunable parameters and a review-gated promotion path; balancing discovery with previews, snapshots, and preserve-local guarantees; economy analysis with loop/cheap-upgrade detection and shown-math hypotheticals; procedural-generation review with seed determinism, reachability risks, and validation plans; animation/combat review with unverified asset IDs, track conflicts, and combo tables; multiplayer sync analysis with static-vs-runtime labels and an authority map; source-traceable documentation with staleness hashes and selective regeneration; onboarding guides that admit unknowns; seven staged migration kinds with exact patches and rollback; evidence-gated requirements traceability; local-only failure analysis with pattern suggestions; a task queue with one-writer-per-file conflicts and terminal cancellation; LCS-based diffs, move-aware tree diffs, and per-change approval reports; configurable per-task-type workflows with per-prompt overrides; and sourced-only API awareness with staleness tracking.

Boundaries are enforced in code: planning-only tools never mutate the game, prototypes never execute, simulations stay theoretical, asset IDs stay unverified, unknown APIs stay unknown, failure history stores paths not source and never uploads, cancelled tasks are terminal, and screenshots report unmeasurable without captures. See `docs/IMPLEMENTATION_PRIORITIES.md` for the audit, dependencies, acceptance criteria, and verification.

## Unreleased — development-intelligence expansion

Codeon now understands whole games, not just individual scripts. Nine read-only local analysis tools (`project_search`, `project_map`, `impact_analysis`, `dataflow`, `health_check`, `simulation_plan`, `refactor_plan`, `feature_evaluate`, `knowledge_lookup`) run over the cached snapshot without touching Studio, and are also available to future UI through typed `analysis:*` IPC channels (`src/renderer/src/analysis.ts`). The agent prompt directs the model to prefer them before touching Studio.

What this adds: a continuously updated project map (systems, remotes, modules, UI, dependencies, execution paths) that labels source evidence vs inference and detects stale relationships; semantic + structural search with file paths, line ranges, and filters; pre-edit impact reports with safe ordering and post-change comparison; static data-flow graphs that never claim to be runtime observations; an evidence-based health dashboard with per-category ratings and no overall score; structured gameplay test planning that never equates reasoning with testing in Roblox; a bounded Studio diagnostics loop (retry limits, originals preserved); feature tracking that never auto-completes; behaviour-preserving refactor planning that lands through the existing review queue; nine advisory genre profiles; twelve versioned knowledge packs with cited sources; evidence-based model capability profiles; enforceable inference budgets (steps, tokens, retries, time, fallback); secret-free cross-project templates; accessibility/productivity helpers; a versioned plugin registry that describes but never executes third-party code; and backup/migration/rebuild tooling that never deletes project files. See `docs/IMPLEMENTATION_PRIORITIES.md` for the complete/partial/missing audit and verification status.

Boundaries from the spec are enforced in code, not just documented: no fabricated usage metrics (estimates are labelled), no parameter-count ranking, no forced architectures, no mixed project contexts, no overall quality score. All new project/settings fields are optional, so existing data loads unchanged.

This change also fixes three pre-existing working-tree type errors: an undefined `commit` handler in the properties panel (blur would have thrown at runtime), an un-narrowed editor spread in the renderer store, and two handled-but-unexposed property-override IPC channels that the preload bridge was blocking.

## v1.1.0

### 1.1.3 — 2026-10-10

- Maintenance release.

### 1.1.2 — 2026-10-10

- Maintenance release.

### 1.1.1 — 2026-10-10

- Maintenance release.

### Codeon 1.1.0 — 2026-10-10

Codeon 1.1.0 makes the project more inspectable, safer to experiment with, and easier to build upon. The release is organized around three connected ideas: *context should be chosen and explained; generated code should face deterministic checks before it can mutate a place; and command-line experiments should run in the same Studio datamodel the developer intends to inspect.* These are guardrails for informed development—not a claim that static scanning can certify code as harmless.

#### Context Inspector: smaller, understandable model requests

The composer now previews the cached project files that retrieval believes are relevant, reports why a file matched (open editor, pinned selection, explicit mention, direct reference, or query relevance), and estimates the source-token budget. Checked files can be pinned alongside automatic retrieval, or the user can switch to checked-files-only mode. Exclusion rules remain authoritative: excluded paths cannot be selected into the prompt. Reading or opening source adds it to the project snapshot so it can participate in later retrieval.

For hosted providers, project source, project instructions and recent Studio output stay out of the request unless the user grants explicit, one-request consent. The approved source set is computed from the exact previewable retrieval result and revalidated in the main process; the renderer does not get to widen it by naming extra cached paths. Consent is consumed when a request starts. Local providers continue to work without the hosted-provider gate. The Inspector describes the context estimate before consent, so people can compare what they intend to send rather than discovering it in hindsight.

This balances useful context against two common failure modes: sending an entire place when only a couple scripts matter, and silently omitting the one script the user expected the model to see. The retrieval is deterministic and deliberately bounded; it is not a filesystem crawler or a complete Luau dependency analyzer.

#### Command bars for Studio and live playtests

A small Edit command bar runs short Luau snippets in Studio's Edit datamodel. The Playtest panel has a separate command bar where the target can be chosen between Client and Server, making it practical to exercise client/server trust boundaries while a Run-mode simulation is active. The selected target must be among the datamodels Studio reports as available. Results and errors are shown next to the command; commands are length-limited and run inside a protected call, with large printed results clipped.

These command bars are direct developer experiments, not agent-generated edits: run them only in a place and test session where you understand their effects. They are guarded by the same deterministic high-confidence exploit-primitive check as generated code, but they are not an undo transaction or a replacement for change review. Agent mutations remain behind Codeon's existing review queue and approvals.

#### A reusable Codeon core, with license carried into the package

The shared core now has a dependency-free public entry point covering bounded project-context retrieval, path exclusions, Luau safety scanning, command and instance/property snippet helpers, and the data types needed to consume those functions. `npm run build:core` produces a small ESM package, declarations, package metadata and a copy of the project license at `dist/core/`. This is a buildable starting point for experiments and derivative apps; it is not a promise that the Electron desktop shell is itself a stable plugin API.

Copies and redistributions remain subject to the Codeon Community License. The generated package carries the same license rather than shedding it during copying. Keep attribution and share-alike obligations intact when making another build.

#### Deterministic safety checks and their limits

Before the agent queues or sends supported code mutations, Codeon scans for known executor-only APIs and dynamic `loadstring` execution, and blocks these high-confidence unsupported primitives. Strict policy can additionally surface review warnings for client-authoritative state changes, suspicious RemoteEvent flows, remote asset-module requires, HTTP requests, and loops without an obvious yield. Findings retain short evidence lines and appear with the project-context step so the developer can investigate them.

Warnings are intentionally not automatic proof of a vulnerability: syntax and intent are contextual. The scanner is not a sandbox, exploit detector, malware classifier, Luau parser, or proof that an application is secure. It can miss obfuscated or novel behavior and can produce false positives. Keep Roblox server authority, Studio review, least privilege, and human testing in the loop. A command bar is powerful precisely because it can directly affect the selected Studio datamodel.

#### Other 1.1.0 updates

- Project-specific instructions, context exclusions, pinned paths, and selection mode are stored with their project rather than disappearing when switching projects.
- Script reads and editor saves refresh the local per-project snapshot; user-editable commands and project source pass through the safety gate before reaching Studio.
- Hosted-provider context includes safety findings only for files that are both approved for that request and actually retrieved, avoiding evidence leaks from files outside the user's consent.
- Provider requests preserve endpoint-specific headers, enabling providers that require compatible client identification.
- The first-party source stays under the existing Codeon Community License; no new third-party runtime dependency is required for the shared core.

#### Upgrade and verification notes

The on-disk project schema remains compatible; the new per-project settings are optional fields and older projects use empty/default values. Context selection persists across restarts. Before using a command bar against a valuable place, save a copy or use a disposable test place. For hosted models, leave consent off when source should remain local; a prompt-only request still works.

Version: **1.1.0** · Feature release · New release line: **v1.1.0**
