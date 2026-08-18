# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until 1.0.0 the public API may change in minor releases. Version 1.0.0 is gated
on the IANA registration of tag 44252 — see [WORKPLAN.md](WORKPLAN.md), WP8.

## [Unreleased]

### Added

- A minimal, deterministic CBOR implementation (RFC 8949) under `src/cbor`:
  reader, deterministic writer, resource limits, diagnostic notation and a
  document walker (WP2). No runtime dependencies.
- The decoder has a strict mode, on by default, which requires the
  deterministic encoding of RFC 8949 Section 4.2.1 — shortest arguments,
  definite lengths, sorted and unique map keys, bignums only where a basic
  integer will not do, floats in the shortest width that preserves them — and
  a lenient mode that accepts and normalises those spellings while still
  rejecting anything malformed or over a limit.
- `encode` takes `mapKeys: 'preserve'` and `floats: 'preserve'` for
  re-serialising a document this library did not produce. A signed document
  whose maps are not sorted must keep the order it was signed in.
- Integers of any magnitude are one type: major types 0 and 1 and the bignum
  tags 2 and 3 all decode to a `bigint`, and the writer picks the preferred
  encoding for the magnitude. Nothing above the core has to care where the
  64-bit boundary falls, which matters because a metrological mantissa may
  cross it.
- Golden vectors from the worked example of the specification, extracted
  mechanically by `npm run extract:example` rather than transcribed.
- The domain model under `src/model` (WP3): exact decimal numbers, the 25 SI
  prefixes, unit references with rational exponents, GUM measurement
  uncertainty, and `MetrologicalValue` itself. Every normative requirement of
  specification Sections 3.1 to 3.4 is a typed error with a stable code and the
  clause it enforces.
- `divideDecimal` and `standardUncertainty` require the caller to state the
  scale and the rounding. Deriving `u = U / k` is a metrological decision, and
  a library that picked a precision for a measurement result would be asserting
  something the measurement does not say.
- `MetrologicalValue.compareQuantity` compares mantissa and total exponent, so
  `5.0 mA` and `0.005 A` compare equal while their encodings stay distinct. It
  refuses two different units, because the registry carries no conversion
  factors, and refuses an interval scale across two prefixes, because an offset
  rather than a factor separates those.

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
