# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until 1.0.0 the public API may change in minor releases. Version 1.0.0 is gated
on the IANA registration of tag 44252 — see [WORKPLAN.md](WORKPLAN.md), WP8.

## [Unreleased]

### Added

- Project scaffolding: Apache-2.0 license, tsup build (ESM + CJS + type
  declarations), Vitest, ESLint flat configuration, GitHub Actions workflows
  for CI, nightly runs and releases (WP0).
- The unit registry of specification Section 4: all 50 registered units with
  their symbols, aliases, SenML mappings and the affine marker, as the data
  file `src/registry/units.json` with generated TypeScript lookup tables (WP1).
- `UnitRegistry` with lookup by identification and by symbol, NFC normalisation
  of symbols, and registration of private-use identifications (32768..65535).
- `METROLOGICAL_VALUE_TAG`, the single place where the tag number 44252 lives.

### Fixed

- Specification errata: four prose passages in Section 4 of `spec/README.md`
  carried unit identifications from an earlier numbering that contradicted the
  registry table — the alias list, the SenML paragraph, the percent reference
  and the note on mass. Corrected against the table, which the byte-level
  examples of Section 5 confirm. A test now parses the specification and fails
  if data file and specification ever diverge again. The specification is a
  working copy and is not committed here, so that test skips where `spec/` is
  absent rather than failing.
