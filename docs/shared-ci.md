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
