---
name: review-npm-stage
description: Review pending npm staged publishes before approval by downloading and integrity-checking staged and previous package tarballs, semantically reviewing their complete diffs, checking supply-chain evidence, identifying breaking/API changes, and safely approving single packages or pnpm workspace release batches. Use after npm stage publish, when asked to inspect an npm staged package, or before approving an npm stage.
---

# Review npm Stage

Review the exact artifacts uploaded to npm staging. Treat malware detection as the primary goal. Never describe an incomplete review as safe.

## Prerequisites

Require Node.js 22.18 or newer, npm 11.15 or newer, `tar`, registry access, and
permission to view the staged packages. Require `pnpm` only for automatic pnpm
workspace discovery.

Use the committed `dist/review-stage.mjs`; do not install dependencies or run the TypeScript sources. Resolve this skill's directory to an absolute path, then invoke the dist file while keeping the working directory at the package or workspace being reviewed.

Run all bundled commands with the user's existing npm configuration. Before
accessing a stage, the bundle checks `npm whoami` against the selected
registry. If npm reports that the user is not authenticated, it runs
`npm login --auth-type=web`, captures npm's official login URL, opens it
immediately in the default browser with the bundled `open` package, and
verifies `npm whoami` again after the user completes npm's official login
flow. Never request, print, store, or relay npm credentials or an npm OTP.

## Collect the review artifacts

Run the collector from the package or workspace:

```sh
node /absolute/path/to/review-npm-stage/dist/review-stage.mjs collect
```

Use an explicit workspace path or filters when needed:

```sh
node /absolute/path/to/review-npm-stage/dist/review-stage.mjs collect --pnpm-workspace /path/to/repo --pnpm-filter './packages/**'
```

Pass `--registry URL` only when the intended registry is not already selected by npm configuration. The command prints a small JSON envelope containing `reviewDir` and `reviewFile`; do not stream tarballs or full patches into the conversation.

The collector must:

- Support only post-CI collection from the current package or pnpm workspace.
- Read exact package names and versions from local manifests, then match them
  against `npm stage list`. Never infer a target from the newest pending stage
  alone and never require CI to capture a stage UUID.
- Query `npm stage list` immediately. For a single package, return its exact
  immutable stage as soon as it appears. For a workspace, return immediately
  only when every candidate matches. If the match is partial, keep polling
  until the set remains unchanged for at least two polling intervals and five
  seconds, or until the total timeout; report the matched count and every
  missing candidate as a warning. Treat that warning as `needs-confirmation`;
  do not assume the missing candidates are outside the release.
- Download the staged tarball with `npm stage download` while resolving and downloading the baseline in parallel.
- Select the highest published SemVer below the target, including prereleases.
- Download the exact baseline tarball directly from the registry URL in its version metadata.
- Verify registry, npm, and locally computed integrity values before diffing.
- Diff only the two verified local tarballs.
- Keep all artifacts in its private temporary review directory.

## Perform the review

Read `references/review-rubric.md` before deciding. Then read `review.json` and every package patch referenced by it.

Review in this order:

1. Read the complete diff and determine whether it introduces malicious, trojan, or otherwise unsafe behavior.
2. Investigate every newly installable external dependency.
3. Identify explicit breaking changes and check the release-version policy.
4. Summarize added, removed, and changed APIs briefly.

Judge the changed code in context. The collector deliberately does not use a
fixed list of suspicious keywords or APIs, so do not assume that a clean
collector result makes the diff safe.

Apply these artifact rules before reviewing patch bodies:

- Skip source map contents (`*.map`). They do not make coverage incomplete.
- Do not inspect lockfile contents. If a package tarball contains a lockfile,
  report the exact path as a packaging warning.
- Skip clearly bundled or minified file contents. Report their exact paths,
  mark coverage `incomplete`, use `needs-confirmation`, and ask the user to
  confirm the package manually.

Do not execute package code, lifecycle scripts, binaries, examples, or tests. Do not install package contents. The collector's lockfile-only dependency audit is the only allowed dependency resolution step.

For a pnpm batch:

- Review every package before approving any package.
- Treat a newly added dependency on another staged package as an internal batch edge and review that package's artifact.
- Treat a missing, unpublished workspace dependency, an unresolved cycle, or a partial review as ineligible for automatic approval.

## Write the verdict

Create `verdict.json` inside the review directory. Follow `references/verdict.schema.json` exactly.

Set `batchDecision` to:

- `high-confidence` only when every patch and relevant artifact was completely reviewed, all evidence sources succeeded, no unresolved risk remains, and breaking changes use a compliant version.
- `needs-confirmation` when the review is useful but has warnings, opaque content, incomplete evidence, or a versioning problem.
- `block` when evidence indicates malicious behavior or an unacceptable supply-chain risk.

Copy each package's `patchSha256` from `review.json`. Mark coverage `complete` only after reading the entire corresponding patch and resolving every finding from the diff and supporting evidence. Do not infer completeness from deterministic collector checks alone.

Treat `automaticApprovalChecksPassed` and `automaticApprovalBlockers` as
deterministic blockers for automatic approval, not as claims that manual
approval is impossible. Review snapshot, package-set, patch-hash, and verdict
validation are non-bypassable invariants.

## Report and approve

Report concisely in the user's language:

- Package or batch identity, baseline versions, and coverage.
- Malware/security findings first, with file evidence.
- New dependency risks.
- Breaking changes and version-policy warnings.
- Short API additions, removals, and changes.

When the verdict is `high-confidence`, run:

```sh
node /absolute/path/to/review-npm-stage/dist/review-stage.mjs approve --review-dir REVIEW_DIR --verdict REVIEW_DIR/verdict.json
```

When automatic approval is unavailable, show the exact package names, versions, stage IDs, and risks. Ask for explicit confirmation. Only after confirmation run:

```sh
node /absolute/path/to/review-npm-stage/dist/review-stage.mjs approve --review-dir REVIEW_DIR --verdict REVIEW_DIR/verdict.json --manual-confirmed
```

The approve command revalidates the review snapshot, package set, and patch
hashes and verifies npm authentication again. It then loads the user's npm
configuration and sends `POST /-/stage/STAGE_ID/approve` directly for each
exact immutable UUID in dependency order; it never runs the
`npm stage approve` CLI or refetches stage metadata.

If the registry requires web 2FA, open its `authUrl` immediately with the
bundled `open` package, poll `doneUrl`, and retry the request with the returned
short-lived token. Never open the general Staged Packages page or ask the user
to perform the approval manually. Never request, print, persist, or relay npm
credentials or an OTP.

Never continue to later packages after an approval failure.

## Clean up

After success, cancellation, or a final decision not to publish, remove the private review artifacts with:

```sh
node /absolute/path/to/review-npm-stage/dist/review-stage.mjs cleanup --review-dir REVIEW_DIR
```

Use only this cleanup command. It validates the review sentinel before deleting anything.
