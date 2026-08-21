# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until 1.0.0 the public API may change in minor releases. The one thing 1.0.0
was waiting on is done: IANA registered tag 44252 on 2026-08-19 — see
[WORKPLAN.md](WORKPLAN.md), WP8.

## [Unreleased]

### Changed

- **Tag 44252 is registered with IANA**, assigned 2026-08-19. Everything that
  called it pending says so now. Section 8 of the specification quotes the
  entry as published rather than the request that was sent, and the two are not
  word for word: the registry reads *quantity **value** with unit of measure,
  SI prefix and **GUM** measurement uncertainty*. Both differences are
  improvements, and the registry is the authority for that line. No code
  changed — the number lives in one constant, `METROLOGICAL_VALUE_TAG`, and the
  contingency that constant existed for never arose.

## [0.10.0] — 2026-08-21

**The version meant for npm.** Everything through 0.9.1 was tagged in this
changelog and in the git history and never left the repository. Whether this one
leaves it is a hand operation with multi-factor authentication and a maintainer
at the keyboard — see [docs/releasing.md](docs/releasing.md) for why it is not a
workflow's to do.

A minor rather than a patch, and deliberately: the canonical text output changes
shape, and encodings that 0.9.x accepted are now refused. Under 0.x that is what
a minor number is for.

The [cross-implementation conformance suite](https://github.com/Vanaheimr/MCBORConformanceTests)
compared this library against the C# reference implementation and the
specification, and the specification decided every point on which the two
implementations disagreed. This release implements those decisions.

### Added

- **The exact JSON text path**: `mcborToJsonText` and `jsonTextToMcbor` /
  `jsonTextToCbor` convert between CBOR and JSON *text* with the digits as
  written, in both directions — integers of any size, decimal fractions with
  their scale (`4([-2, 1999])` ↔ `19.99`), floats written with their point
  (`1.0`), tag 1 as an ISO 8601 instant, tags 2/3/4/37 and the text tags per
  metrological-text.md §3.1. JavaScript's native JSON tree cannot carry any
  of that exactly (`JSON.parse` rounds `1.10` and 2^53+1 before a library
  sees a digit), so the tree-based `mcborToJson`/`jsonToMcbor` remain as the
  documented lossy convenience.
- `dist=t` is accepted for `dist=student-t` on input.
- **The specification's test vectors run as part of this suite.** The
  specification carries a machine-readable conformance annex
  (`test-vectors/`) now; `npm run fetch:spec` fetches it together with the
  documents, and `tests/spec-vectors.test.ts` executes every normative entry
  — golden encodings, must-reject inputs, text renderings and the exact JSON
  conversion. Like the other specification-bound suites it skips where the
  annex is absent.
- **A reproducer for a fault in the platform**, not in this library:
  `scripts/v8-json-key-repro.mjs` shows `JSON.parse` returning the wrong object
  key on Node 26.3.0. V8 caches an object's property keys against the keys of
  the object it parsed before; a key ending in an escaped backslash poisons
  that cache, and the next object with the same preceding key gets the poisoned
  key back in place of its own. Already reported as
  [nodejs/node#63785](https://github.com/nodejs/node/issues/63785) and forwarded
  to V8 as [issue 521080746](https://issues.chromium.org/issues/521080746); the
  narrowing this project added is in the script and in
  [WORKPLAN.md](WORKPLAN.md), WP8. It is plain JavaScript with no imports,
  deliberately: nothing of this library is in it, which is the whole point.
  Nothing in `src/` calls `JSON.parse` either — the JSON *text* reader here is
  this project's own scanner — so the library is unaffected. This is what stood
  behind the property failure listed as unexplained under 0.9.1.
- A nightly job runs that reproducer on Node 20, 22, 24 and latest and
  **reports rather than fails**, there being nothing here to fix. It answers
  what one machine could not: which versions carry this, and when it stops.
- `MCBOR_PROPERTY_RUNS` scales the property suites for a campaign, as
  `MCBOR_FUZZ_RUNS` already scales the fuzz corpus. Together with the pinned
  seed it is what turned that fault from a ghost into an afternoon.

### Changed

- **The canonical text output follows metrological-text.md**: integer unit
  exponents are written with a caret (`9.81 m·s^-2`; superscripts remain
  accepted input), the explicit scale is `×10^3` (superscript scale remains
  accepted input), the degrees of freedom are written `ν=` (`nu=` remains
  accepted, and is what the ASCII mode writes), and a dimensionless reading
  states the unit `1` (`42 1`) — a bare number is prose, not a reading, which
  also stops the JSON conversion from tagging every numeric string.
- **A decimal fraction's exponent is negative on the wire** (specification
  §3.1): the decoder rejects `4([0, 500])` and `4([2, 5])`, the encoder
  refuses models holding them, and scientific text input whose exponent
  leaves no decimal places denotes the integer it equals (`5.0e2 V` is
  `500 V`).
- A unit exponent of zero (`m^0`, `[[15, 0]]`) is rejected.
- A prefix no longer folds onto a symbol that carries a power: `km²` is
  rejected instead of being read as 10³ m².
- A bare space no longer separates the factors of a product: the space's one
  job is separating the number from its unit, and `5 m s` stays prose
  (metrological-text §2.6 — the last open tolerance question, decided).
  Whitespace *around* `·` and `*` remains tolerated.

### Fixed

- The text parser enforces two rules its grammar already stated, found by the
  conformance suite: the space between the number and its unit is required
  (`5.0mA` is no longer read as a reading), and stating the same uncertainty
  extension twice (`k=2, k=3`) is an error instead of last-one-wins.
- **`assertStable` no longer calls a repeating failure a counterexample.** It
  reports that the failure repeated, and then says what that does and does not
  mean — a process that has fallen into a fault stays in it and repeats just as
  faithfully, so repetition is not proof that the input is the cause. The
  remedy is one line long, *replay the input in a fresh process*, and it was
  never printed. It is now. On a failure the round-trip property also asks the
  platform outright, and says `THE PLATFORM LOST IT` where `JSON.parse` did not
  return what `JSON.stringify` wrote.

## [0.9.1] — 2026-08-18

Documentation, examples and the release machinery (WP8). No API change: the
freeze declared in 0.9.0 holds.

### Added

- `examples/`: six runnable programs, each printing something a reader can check
  against the specification — a reading on the wire, a document through JSON, a
  calibration certificate, a foreign 713-byte signed record, a private-use unit,
  and the signatures over the worked example.
- **The signature example verifies all four signatures over the specification's
  worked record**, and does something stronger than verify: because the
  specification signs deterministically (RFC 6979), re-signing the
  `Sig_structure` this library builds reproduces the recorded signature byte for
  byte. A construction that differed by one byte could not. All three key
  identifiers are recomputed too, as RFC 9679 thumbprints over this library's
  own canonical encoding.
- `@noble/curves` for that one example, in `examples/package.json` rather than
  the library's own, so a root `npm ci` never installs a cryptography library to
  test a data format. Without it the example says so and exits cleanly.
- `tests/examples.test.ts` runs every example and checks its output.
  Documentation that is not executed rots, and a rotted example is the first
  thing a reader meets.
- `tests/bundle.test.ts` loads the built bundle in a context with **no Node
  globals at all** — no `process`, no `require`, no `Buffer` — which is a
  stricter environment than a browser, so "runs in a browser" stops being a
  claim. It also asserts what the published tarball contains.
- API documentation: `npm run docs:api` (typedoc), and a CI job that builds it.
- `docs/releasing.md`: what publishing takes and what 1.0.0 is waiting for.

### Fixed

- The build wrote the `sourceMappingURL` comment twice into every bundle, once
  itself and once through esbuild. `scripts/finish-build.ts` keeps one.
- The published package would have carried the generated API reference — 272
  files of HTML that belong on a website, tripling the tarball. The `files`
  manifest names `docs/*.md` now, and a test asserts no HTML is in it.
- `npm run verify` builds before it tests rather than after, because one test is
  about the build artefact and would otherwise have skipped in CI.
- Summaries for the nine option interfaces that had documented members and no
  documented whole.
- The root type check tried to check `examples/`, which imports a dependency the
  root package deliberately does not have — so `npm run verify` passed only on a
  machine that had run `npm install --prefix examples`, and failed everywhere
  else. The examples are a package of their own now, with their own
  `tsconfig.json` and `npm run typecheck:examples`, run by the CI job that
  installs them. Found by the release workflow on the first attempt, which is
  what a release workflow is for.
- `npm run verify` is now what CI runs, rather than a list of steps repeated in
  the workflow file beside it. Twice a check existed in one and not the other,
  and both times the gap was invisible until a release failed: the API
  documentation build was a CI step alone, so a README link added afterwards
  broke it where nobody was looking. The script is the definition now, and it
  builds the documentation too.
- A README link pointed at the `examples/` directory rather than at a file,
  which typedoc refuses to resolve.
- **`npm run verify` failed on a fresh clone.** The suites that compare against
  the specification are written to skip where the document is absent, and one of
  them read it while the suite was being *collected* — which happens even for a
  suite about to be skipped, so the guard suppressed the tests and the read
  threw first. It failed everywhere except a machine that already had a working
  copy lying about, which is how it survived to break two release attempts. A CI
  job now runs `verify` on a bare clone, deliberately without fetching the
  specification, so the promise the README makes is one something checks.

### Known — **since closed, see Unreleased**

- One property in `tests/json/roundtrip.test.ts` has failed twice under load
  with a counterexample that does not reproduce — replaying it passes, and some
  two million further executions found nothing. The property is therefore not a
  function of its input, and the value the tool reports is not the cause. The
  three properties there now go through a helper that repeats the computation
  before reporting and says which of the two it is, so the next occurrence is
  diagnostic rather than misleading. **The fault is open**; see WORKPLAN.md,
  WP8, for what has been ruled out.

  *Closed on 2026-08-20, and the diagnosis above is half right. The property is
  a function of its input; the platform underneath it is not. V8 caches an
  object's property keys against the previous object's, and a key ending in an
  escaped backslash poisons that cache — reproduced with no library in sight by
  `scripts/v8-json-key-repro.mjs`, and already upstream as nodejs/node#63785.*

## [0.9.0] — 2026-08-18

**The API freeze.** Nothing new to do; everything that was here, held against
input designed to break it. `docs/conformance.md` maps every normative clause
of the specification to the code that enforces it and the test that proves it,
and a test keeps that document from drifting away from the code.

Two defects and one silent loss came out of the fuzzing, all three in code that
passed every test written for it. They are listed under *Fixed* below, and the
first of them is the one that mattered.

### Added

- Fuzz suites under `tests/fuzz` (WP7): golden vectors damaged one edit at a
  time, random bytes, text from the grammar's own alphabet, and generated JSON
  documents. Every input must produce a value or a typed `McborError`; a
  `RangeError`, a `TypeError` or anything else is re-thrown as the defect it
  is. `MCBOR_FUZZ_RUNS` sizes the corpus, and the nightly workflow runs two
  hundred thousand cases per property.
- Two of those suites measure how often the corpus is *accepted*. Every other
  property has the form "if it was accepted, then …" and would hold vacuously
  over a corpus that had stopped reaching the decoder, so a fuzzer gone quiet
  now fails instead of passing.
- Resource-bound tests for every field of `DecodeLimits`, each with the input
  that just exceeds it and the one that just does not, and each timed: nine
  bytes claiming 2^64−1 items must cost nine bytes to refuse.
- `docs/conformance.md`, and `tests/conformance.test.ts` to hold it to the
  code. Adding an error code without saying which clause it enforces now fails
  the build.
- `InvariantError`, deliberately not an `McborError`: the hierarchy says the
  input was wrong, and this says the library is. It replaces the `?? ''`
  fallbacks behind the text parser's mandatory capture groups — each of those
  was a silent wrong answer where the reasoning was mistaken, and a branch no
  test could ever reach.
- `npm run test:fuzz`, and `docs/` in the published package.

### Fixed

- **A rational unit exponent that is not in lowest terms was accepted by strict
  mode and silently reduced.** `[20, 2]` decoded and re-encoded as `10`, so a
  signed document changed its bytes on the way through — which is the one thing
  a strict decoder exists to prevent. It is now `ERR_UNIT_EXPONENT_NOT_REDUCED`
  in strict mode, and reduced as before in lenient mode, which is what the
  specification requires of a decoder. Found by the round-trip property, not by
  a hand-written case.
- **A JSON member named `__proto__` was lost, and could replace the prototype
  of the object it was converted into.** `mcborToJson` assigned member names,
  and assignment does not mean what it appears to for that one name: the member
  vanished, and a map under it became the returned object's prototype — an
  object reporting no keys while answering to the ones the document supplied.
  Members are now defined rather than assigned, which is what `JSON.parse`
  does.
- **A `Date` became `{}` instead of its instant.** `jsonToMcbor` now consults
  `toJSON`, once per value as the serialisation algorithm does, so a value
  converts to what `JSON.stringify` would have written. A timestamp is the
  commonest non-primitive in a measurement record.
- The error code for a value too large to hold as a number was
  `ERR_UNIT_EXPONENT_DENOMINATOR` wherever it was raised — including for an SI
  prefix and for a probability distribution, which sent the reader to the wrong
  clause. Each caller now states its own code.

### Changed

- `sameNumericValue` is removed. It was a one-line wrapper around
  `compareDecimal`, unused and untested; at an API freeze, speculative surface
  is surface that has to be kept.

### Coverage

99.8 % of statements and 99.5 % of branches, and **100 % of both in `src/codec`
and `src/text`**, which was the acceptance criterion for this work package.
Three branches in the whole library are unreachable by any input; each is a
guard whose removal would turn an impossible state into a silent wrong answer,
and each is named with its reason in `docs/conformance.md` rather than hidden
behind an ignore comment.

## [0.3.0] — 2026-08-18

Whole documents between CBOR and JSON, with every metrological value as one
string. This completes what the library set out to do: read and write mCBOR,
and carry it through JSON without losing a decimal place.

### Added

- `mcborToJson` and `jsonToMcbor`, and `jsonToCbor` for a document embedded in
  a larger one (WP6). A metrological value becomes a string; everything else
  takes the JSON form it ordinarily would.
- A stated round-trip guarantee: a document of readings, text, integers within
  ±(2^53 − 1), booleans, nulls, arrays and text-keyed maps comes back
  byte-identical. Byte strings, floats, dates and big integers are one-way,
  because JSON has no room for what made them what they were, and each is
  either an error or an option that says so.
- An integer beyond the safe range is refused rather than rounded
  (`ERR_JSON_PRECISION`). Nanosecond timestamps pass 2^53, so this is not an
  exotic case, and the nearest double is a different number.
- `readings` decides which JSON strings are metrological values: `'auto'`
  tries every candidate against the grammar, `'none'` tries none, and a
  predicate decides per path. The `'auto'` hazard — a prose field holding
  `"1 h"` becomes one hour — is documented and tested rather than hidden.

### Fixed

- The test timeout, which the default of five seconds made load-dependent. A
  property test running a hundred thousand cases takes seconds, and one that
  fails only on a busy machine reports a timeout with no counterexample, which
  reads exactly like a real defect.

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
