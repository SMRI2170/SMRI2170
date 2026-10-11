# SMRI Shared Quality CI

Reusable, read-only GitHub Actions quality gates, hosted in the public `SMRI2170/SMRI2170` repository (until a dedicated shared CI repository can be created).

## Entry points

| Reusable workflow | Purpose | Default |
| --- | --- | --- |
| `reusable-security.yml` | Full-history secret detection, Semgrep SAST, Trivy vulnerability/misconfiguration/secret scans | All three blocking |
| `reusable-flutter.yml` | `flutter analyze --fatal-infos`, Dart format, unit/widget tests + LCOV threshold, Android debug build | Enabled (coverage minimum 0%) |
| `reusable-kmp.yml` | Gradle common tests, Android build, Android lint and optional iOS Kotlin compiler | Android enabled, iOS opt-in |
| `reusable-node.yml` | npm clean install, ESLint, TS typecheck, tests, production build and high+ vulnerability audit | Enabled |
| `reusable-zkp.yml` | Go vet and tests, Hardhat compile/tests, npm high+ audit, optional Go race tests | Enabled (race opt-in) |

## Quick start

Add a caller to **the target repository** at `.github/workflows/shared-quality.yml`:

```yaml
name: Shared quality
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: shared-quality-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  security:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-security.yml@main
    permissions:
      contents: read
  flutter:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-flutter.yml@main
    permissions:
      contents: read
    with:
      working_directory: .
      check_format: true
      min_coverage: 75
```

Use a **commit SHA instead of `@main`** once a tested revision is selected, and update that pin intentionally. Pin third-party actions to reviewed commit SHAs in production. Never pass arbitrary code or untrusted PR content as workflow inputs.

## Rollout rules

1. Implement in a branch and make a PR; do not replace a working repository-specific CI until shared jobs pass.
2. Do not duplicate existing Semgrep/Gitleaks/Trivy jobs: replace those jobs only after the central ones pass.
3. Start with a baseline coverage threshold of 0, measure LCOV, then increase the enforced threshold to the current baseline and raise it gradually. For new projects target 75-85% line coverage, emphasizing tests for important paths rather than a vanity metric.
4. Strict format checks are on by default. Set `check_format: false` temporarily for legacy code and create a follow-up formatting PR.
5. Run security scans on untrusted code only with `contents: read`; **no `pull_request_target`** or deploy secrets. This shared CI never deploys or signs packages.
6. Gitleaks scans historical commits. A previous credential leak must be **revoked/rotated**; rewriting history does not revoke secrets.
7. High-risk changes require human approval even with green automated tests (cryptography/circuits, authentication, data migration, signing/release).
8. Keep fast checks required for PR merge. Schedule expensive iOS/device/performance/Go race checks separately where appropriate.
9. In private repositories, confirm Actions policy and billing allow public reusable workflows. Runners and billing belong to the **calling** repository.
10. Use required status checks / rulesets when available; manual review remains required otherwise.

## Examples

### Kotlin Multiplatform

```yaml
jobs:
  kmp:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-kmp.yml@main
    permissions:
      contents: read
    with:
      working_directory: .
      gradle_command: gradle
      ios_enabled: true
```

### Node / Next.js

```yaml
jobs:
  web:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-node.yml@main
    permissions:
      contents: read
    with:
      working_directory: .
      run_audit: true
```

### Go / gnark / Hardhat

```yaml
jobs:
  proof:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-zkp.yml@main
    permissions:
      contents: read
    with:
      go_directory: aggregator
      contracts_directory: contracts
      run_race_detector: false
```

## Definition of Done

- Functional change + negative/failure tests
- Lint/typecheck/unit/build all green
- Relevant security scan green; findings triaged without blanket suppression
- Contract/backward compatibility checked, docs changed as needed
- CI output linked in PR; reviewer signs off on risky changes
- Release/mobile-device checks passed before distribution

Note: default npm audit and Gitleaks can expose legacy debt. Track findings as blocking remediation rather than silently bypassing the gate.

## Universal entrypoint (2026-10)

The recommended **single caller** for any programming-language stack is:

```yaml
name: Universal quality
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pull-requests: read
jobs:
  quality:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-quality.yml@<FULL-40-CHAR-PIN>
    permissions:
      contents: read
      pull-requests: read
```

Replace the placeholder with the full tested commit SHA of the shared CI repository. Do not use `@main` in production.

The universal entrypoint composes **existing SAST/secret/vulnerability checks**, **zizmor + actionlint**, **Syft SPDX SBOM and license reporting**, **PR policy checks**, and **optional release artifact integrity**. Consumers need not know their language to invoke the common entrypoint. Stack-specific compilers/tests remain in the owning project or as separately called language-focused reusable workflows.

### Applicability and failure semantics

- A repository with no `.github/workflows/*.yml|yaml` gets a visible **Not applicable** message for workflow security audits. If workflow files are detected, a failed audit fails CI; errors are **not silently skipped**.
- Syft performs filesystem/package-manifest analysis independent of language. An empty inventory produces a prominent warning, not a false claim of being dependency-free. For application repositories with reliable package manifests, enable `fail_if_no_packages` when invoking `reusable-sbom.yml` directly.
- Licenses: explicit denied identifiers fail; missing SPDX license declarations are counted and reported. Dual-license expressions with a non-denied OR alternative are flagged for manual review rather than automatically rejected. This is a **triage aid, not a legal compliance guarantee**. Use `fail_on_unknown_license: true` for projects that have completed license metadata cleanup.
- PR policy applies on pull requests; other events print **Not applicable**. Titles must follow Conventional Commits; descriptions must include a Testing/テスト/検証 section; workflow/security/auth/cryptography/DB migration changes also require a Risk/リスク section. Large changes above 100 files or 3000 changed lines are blocked. Keep PR scope small.
- Release verification is **opt-in** through `artifact_name`. If omitted, the optional job is skipped by design. If supplied, the artifact must exist in the same workflow run; missing files/checksum mismatches fail. The gate never executes artifact contents or deploys.
- All third-party actions are pinned to complete Git commit SHAs; external CLI tooling versions are intentionally specified. Jobs run with read-only token permissions, except PR metadata access for the PR gate and read-only Actions artifact access for release validation.
- **Known platform limit**: GitHub Actions billing and access policy in private repositories can prevent any job from starting, independently of code quality. Do not treat such runs as passing quality checks.

### Independent release integrity verification

```yaml
jobs:
  verify:
    uses: SMRI2170/SMRI2170/.github/workflows/reusable-release.yml@<FULL-40-CHAR-PIN>
    permissions:
      contents: read
      actions: read
    with:
      artifact_name: release-package
      # expected_sha256: <TRUSTED_DIGEST>  # Optional; for exactly one artifact file
```

Publishers can verify a release artifact in the **same workflow run** that produced it. Verification emits SHA256SUMS and artifact-manifest.json as an Actions artifact. A checksum calculated after download without a separately trusted expected digest provides an inventory, **not cryptographic proof of origin**. Signing, Google Play/TestFlight upload, GitHub Release publication, and production deployments are purposefully kept in project-specific release pipelines.

### Recommended rollout

1. Run the universal entrypoint in a trial PR without replacing currently green jobs.
2. Correct real findings (especially workflow permissions, mutable Action tags, exposed secrets).
3. Establish thresholds for unknown licenses/manifest availability based on measured inventory and selected ecosystems.
4. Enable required status checks on the stable reusable workflow job names where repository plan permits.
5. Pin consumers to the validated central commit SHA and update intentionally via reviewed PRs.
