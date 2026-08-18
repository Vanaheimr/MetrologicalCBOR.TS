# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until 1.0.0 the public API may change in minor releases. Version 1.0.0 is gated
on the IANA registration of tag 44252 — see [WORKPLAN.md](WORKPLAN.md), WP8.

## [Unreleased]

## [0.2.0] — 2026-08-18

The text format: a reading as one line of text, and back again without losing
anything. `docs/text-format.md` is its grammar, frozen with this release.

### Added

- `formatMetrologicalValue` and `parseMetrologicalValue`, and the grammar they
  implement (WP5). Text is a second encoding of a reading rather than a
  rendering of one: what is written reads back to the same canonical bytes.
- The renderer checks its own output before folding a prefix into a symbol or
  writing a superscript, because both can spell a different unit. The centi-day
  would fold into `cd`, which is the candela, and the metre cubed would be
  written `m³`, which is the registered cubic metre. Both now take the
  unambiguous form instead.
- The parser resolves a token as a whole symbol before splitting a prefix off
  it, which is what makes `cd` the candela, `min` the minute and `das` a
  decasecond. Only the leading factor of a product may carry a prefix, since a
  prefix applies to the quantity as a whole.
- ASCII input and output throughout: `+/-`, `*`, `^2`, `x10^3`. Both spellings
  of micro and of the ohm are accepted on input.

### Changed

- An uncertainty no longer has a `form` to choose. A map holding nothing but a
  magnitude says exactly what a bare number says, and Section 6 does not allow
  one uncertainty two encodings, so the form follows from what is stated:
  `uncertaintyForm` derives it, the encoder follows it, and a strict decoder
  rejects the redundant map (`ERR_UNCERTAINTY_REDUNDANT_MAP`). The ambiguity
  surfaced because the text format could not express it.

## [0.1.0] — 2026-08-18

The first version that reads and writes CBOR tag 44252. All ten examples of
specification Section 5 encode and decode byte for byte, in both directions.

The text format and the document-level JSON conversion are not here yet; see
[WORKPLAN.md](WORKPLAN.md), WP5 and WP6.

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
- The codec for tag 44252 (WP4): `decodeMetrologicalValue`,
  `encodeMetrologicalValue`, and the `…FromCbor` / `…ToCbor` pair for a reading
  embedded in a larger document.
- Decoding is strict by default and additionally rejects two spellings the
  specification does not bless, because Section 6 requires one encoding per
  reading and each of these would be a second: a single named unit written as a
  one-element product, and a prefix of 0 written where nothing follows it.
  Lenient mode reads both and normalises them.
- Encoding takes `units: 'preserve'` to reproduce a symbolic unit as it
  arrived. A symbolic unit is discouraged but legal, and a signature over one
  has to survive.
- A rational unit exponent is reduced on decoding, so `[2, 1]` is the integer
  exponent 2 and `[-2, 4]` is `[-1, 2]`.
- An uncertainty map holding a key this version of the specification does not
  define is rejected rather than ignored: an uncertainty only partly understood
  is not one to pass on as though it were understood entirely.

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
