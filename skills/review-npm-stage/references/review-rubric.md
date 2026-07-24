# npm Staged Publish Review Rubric

Apply this rubric to the artifacts produced by `dist/review-stage.mjs`. The
collector provides evidence and deterministic automatic-approval checks; it
does not replace semantic review.

## 1. Malicious-code review

Read every added or modified line and assess the behavior of the diff
semantically. Follow relevant data and control flow, including package metadata
and generated or opaque artifacts referenced by changed code. Decide whether
the new behavior is intentional, proportionate, and consistent with the
package's purpose.

Do not use a fixed keyword or API checklist as a substitute for understanding
the change. Report concrete behavior with file evidence, and treat content that
cannot be meaningfully reviewed as incomplete coverage.

Use these explicit exclusions:

- Ignore source map bodies (`*.map`) without reducing coverage.
- Do not read lockfile bodies. Report lockfiles shipped in the tarball as a
  packaging warning because published packages should not contain them.
- Do not spend review time reading clearly bundled or minified bodies. List the
  exact paths, mark coverage incomplete, and require manual confirmation.

## 2. New dependency review

Review newly installable names from `dependencies`, `optionalDependencies`, and bundled dependency declarations. A move from dev/peer-only use into an installable field counts as new. A range update to an already installable name does not.

For each new external dependency, check:

- The resolved package name and version match the declared intent; look for typosquatting and npm aliases.
- `npm audit` results and whether audit/metadata collection completed.
- Deprecation, license, repository identity, maintainers, publication timing, integrity/provenance, and install scripts.
- Non-registry sources, newly created packages, abrupt ownership/repository changes, unexplained recent releases, or suspicious package contents.

Missing metadata or failed research is incomplete evidence, not a clean result. Any non-registry dependency, known advisory, deprecated direct dependency, or unreviewed install script prevents a high-confidence verdict.

For an internal pnpm batch dependency, confirm the depended-on package is in the reviewed batch or that its required workspace version is already published. Review the staged internal package rather than treating it as an unrelated third party.

## 3. Breaking changes

Inspect published entry points, exports, type declarations, call signatures, runtime defaults, error behavior, supported engines, module format, CLI flags, and documented contracts.

List only concrete breaking changes. Explain the affected public behavior in one sentence each.

Version policy:

- A breaking change is compliant when the target major is greater than the baseline major.
- For `0.x`, a greater minor is treated as the breaking-release boundary.
- A patch release in `0.x` is not a breaking release.
- Prerelease identifiers do not by themselves satisfy a required major/minor boundary.

Set `breakingVersionCompliant` to `false` if any breaking change violates this policy.

## 4. API summary

Keep the summary short:

- `added`: newly exported functions, classes, types, entry points, commands, or supported inputs.
- `removed`: removed public APIs or entry points.
- `changed`: materially changed signatures or behavior.

Do not restate implementation-only refactors.

## Coverage and decisions

Use `high-confidence` only when:

- Stage identity and integrity automatic-approval checks pass.
- Every package in the batch is reviewed.
- Every patch is read in full and its SHA-256 is copied into the verdict.
- Every security-relevant behavior found in the diff is resolved.
- Dependency audit and metadata research complete without unresolved risk.
- No active opaque content remains unexplained.
- Breaking-version policy passes.

Use `needs-confirmation` for incomplete evidence, bundled or minified content,
benign but active lifecycle behavior, passive binaries needing context, cycles,
or version warnings.

Use `block` for likely malicious behavior, unexpected credential/network/process behavior, integrity mismatch, or unacceptable dependency risk. A user may override only after seeing the exact evidence and explicitly confirming the exact batch.
