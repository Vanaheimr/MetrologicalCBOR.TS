# Conformance

Every normative requirement of the specification, the code that enforces it and
the test that proves the code does.

This document exists so that the claim "reference implementation" is checkable
by somebody who did not write the implementation. A test suite says the code
does what its author expected; a conformance matrix says what the *document*
required and where each requirement went. The two disagree exactly where there
is a bug, and this table is how that disagreement becomes visible.

**Normative input:** [Metrological CBOR (Tag 44252)](https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR),
version 1.0, 2026-08-18, together with [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949)
for the encoding it is written in.

**How to read it.** Line numbers are where the requirement is enforced, not
every place it is relied on. A test id is a file and the name of the test —
`tests/codec/rejection.test.ts` plus the hexadecimal vector, where the suite is
table-driven. "Site" is the throwing site for a requirement that can be
violated, and the constructor or the type for one that cannot.

---

## 1. Section 3 — the tag

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 3 | The tag content MUST be an array of two, three or four data items. Any other length is an error. | [decode.ts:142](../src/codec/decode.ts#L142), [:151](../src/codec/decode.ts#L151) — `ERR_ARITY` | `rejection.test.ts` — `D9ACDC80`, `D9ACDC8105`, `D9ACDC850504000000`, `D9ACDC05` |
| 3 | The item must carry tag 44252. | [decode.ts:137](../src/codec/decode.ts#L137) — `ERR_TAG_MISMATCH` | `rejection.test.ts` — `D8FF820504`, `820504` |
| 3 | The tag number lives in exactly one place. It was put there against the possibility that 44252 was taken at IANA first; it was not — the registration was assigned on 2026-08-19 — so the constant is now simply where the number lives. | [tag.ts](../src/tag.ts) — `METROLOGICAL_VALUE_TAG` | `types.test.ts` — *isTagged takes the tag number either way it is written* |

## 2. Section 3.1 — the reading

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 3.1 | The reading MUST be a CBOR integer, a bignum for an integer beyond the basic range, or a decimal fraction whose mantissa is an integer or a bignum. | [decode.ts:206](../src/codec/decode.ts#L206), [:211](../src/codec/decode.ts#L211), [:218](../src/codec/decode.ts#L218), [:223](../src/codec/decode.ts#L223) — `ERR_VALUE_TYPE`; [reader.ts](../src/cbor/reader.ts) hands bignums over as the integers they are | `rejection.test.ts` — `D9ACDC826161 04`, `D9ACDC82F604`, `D9ACDC82C4812004`, `D9ACDC82C48261610504`, `D9ACDC82C48220616104`; `spec-vectors.test.ts` — `bignum-integer-value` |
| 3.1 | A decimal fraction's exponent MUST be negative: an integral reading is written as an integer (or bignum), and text input whose exponent leaves no decimal places denotes that integer. | [decode.ts](../src/codec/decode.ts) — rejected in both modes; [encode.ts](../src/codec/encode.ts) refuses to write one; [parse.ts](../src/text/parse.ts) — `readNumberText` normalises text input | `text/text-format.test.ts` — *rejects a wire decimal fraction with a non-negative exponent*, *reads an exponent that leaves no decimal places as the integer it equals*; `spec-vectors.test.ts` — `decfrac-exponent-zero`, `decfrac-positive-exponent` |
| 3.1 | It MUST NOT be a binary floating-point number. | [decode.ts:196](../src/codec/decode.ts#L196) — `ERR_VALUE_FLOAT` | `rejection.test.ts` — `D9ACDC82F93C0004`, `D9ACDC82FB3FF199999999999A04` |
| 3.1 | It MUST NOT be a bigfloat (tag 5). | [decode.ts:201](../src/codec/decode.ts#L201) — `ERR_VALUE_BIGFLOAT` | `rejection.test.ts` — `D9ACDC82C582200304` |
| 3.1 | The decimal scale is significant: `4([-1, 50])` and `5` denote different resolutions and both MUST survive a decode/encode round trip unchanged. | [decimal.ts](../src/model/decimal.ts) — `DecimalNumber` keeps mantissa and exponent separately; [encode.ts](../src/codec/encode.ts) writes back the form it was given | `section5-vectors.test.ts` — all ten, both directions; `codec/roundtrip.test.ts` — *the bytes survive the model unchanged*, *the decimal scale of the reading is never touched*; `fuzz/decoder.test.ts` — *reproduces the bytes of every reading it accepts* |
| 3.1 | Encoders SHOULD write integral readings as plain integers and all others as decimal fractions. | [decimal.ts](../src/model/decimal.ts) — `integer` and `decimal` are separate constructors, so the caller states which | `model/decimal.test.ts`; `section5-vectors.test.ts` — vectors 1 and 2 are integers, 3 onwards decimal fractions |
| 7 | Decoders MUST reject values they cannot represent exactly rather than rounding silently. | [decode.ts:238](../src/codec/decode.ts#L238), [decimal.ts:109](../src/model/decimal.ts#L109), [:128](../src/model/decimal.ts#L128) — `ERR_VALUE_EXPONENT_RANGE`, `ERR_VALUE_MANTISSA_RANGE` | `fuzz/limits.test.ts` — *refuses a decimal exponent past the range it reconstructs*; `rejection.test.ts` — `D9ACDC82C4821927110504` |

**No binary floating point anywhere on the path.** Mantissas are `bigint`,
formatting and parsing are exact string arithmetic, and an ESLint rule bans
`Number()`, `parseFloat`, `Number.parseFloat` and `Math.*` in `src/model`,
`src/codec` and `src/text` so that it stays that way. See
[eslint.config.js](../eslint.config.js).

## 3. Section 3.2 — the unit

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 3.2 | Decoders MUST accept both the numeric identification and the symbol. | [decode.ts:263](../src/codec/decode.ts#L263) (id), [:274](../src/codec/decode.ts#L274) (symbol) | `section5-vectors.test.ts` — vector 7 is symbolic; `codec/roundtrip.test.ts` generates both spellings and every alias |
| 3.2 | An identification greater than 65535 is an error. | [decode.ts:266](../src/codec/decode.ts#L266), [registry/index.ts:102](../src/registry/index.ts#L102) — `ERR_UNIT_ID_OUT_OF_RANGE` | `rejection.test.ts` — `D9ACDC82051A00011170` |
| 3.2, 7 | An unregistered identification is an error — decoders MUST reject rather than substitute a placeholder. | [registry/index.ts:108](../src/registry/index.ts#L108) — `ERR_UNIT_UNKNOWN` | `rejection.test.ts` — `D9ACDC820519FFFF`, `D9ACDC8205182D` |
| 3.2, 7 | An unknown symbol is an error. | [registry/index.ts:144](../src/registry/index.ts#L144) — `ERR_UNIT_UNKNOWN` | `rejection.test.ts` — `D9ACDC820566706172736563` |
| 4 | The identification 0 is reserved and never valid on the wire. | [registry/index.ts:95](../src/registry/index.ts#L95) — `ERR_UNIT_ID_RESERVED` | `rejection.test.ts` — `D9ACDC820500` |
| 3.2 | The denominator of a rational exponent MUST be positive. | [unit.ts:79](../src/model/unit.ts#L79) — `ERR_UNIT_EXPONENT_DENOMINATOR` | `rejection.test.ts` — `D9ACDC820581820F820100`, `D9ACDC820581820F820120` |
| 3.2 | The numerator MUST NOT be zero. | [unit.ts:84](../src/model/unit.ts#L84) — `ERR_UNIT_EXPONENT_ZERO` | `rejection.test.ts` — `D9ACDC820581820F820003` |
| 3.2 | A rational exponent MUST be in lowest terms with a denominator greater than one; decoders MUST reject `[-2, 4]` and `[2, 1]` rather than reduce them. | [decode.ts](../src/codec/decode.ts) — `ERR_UNIT_EXPONENT_NOT_REDUCED` in strict mode (the default); lenient mode normalises, as its documented opt-out | `rejection.test.ts` — *rejects a rational exponent that is not in lowest terms, and reduces it leniently*; `model/unit.test.ts`; `spec-vectors.test.ts` — `non-reduced-rational`, `rational-denominator-one` |
| 3.2 | A unit exponent MUST NOT be zero. | [unit.ts:84](../src/model/unit.ts#L84) — `ERR_UNIT_EXPONENT_ZERO`, integer and rational alike | `model/unit.test.ts` — *rejects the exponent zero*; `spec-vectors.test.ts` — `integer-exponent-zero` |
| 3.2 | A single named unit MUST be written in the named form, and decoders MUST reject the one-element product. | [encode.ts](../src/codec/encode.ts) never writes one; [decode.ts:311](../src/codec/decode.ts#L311) refuses to read one in strict mode (the default) — `ERR_UNIT_SINGLE_AS_PRODUCT` | `rejection.test.ts` — *rejects a single named unit written as a one-element product*; `spec-vectors.test.ts` — `single-unit-as-product` |
| 3.2 | A product of powers is an array of factors, in display order. | [unit.ts](../src/model/unit.ts) — `unitProduct` keeps the order; [decode.ts:291](../src/codec/decode.ts#L291) | `section5-vectors.test.ts` — vectors 8 and 10; `text/text-format.test.ts` |
| 3.2 | Rational powers are supported (`V·Hz^-1/2`, `Pa·m^1/2`, `Ω·s^-1/2`). | [unit.ts](../src/model/unit.ts) — `UnitExponent`; [format.ts](../src/text/format.ts), [parse.ts](../src/text/parse.ts) | `section5-vectors.test.ts` — vector 10; `text/text-format.test.ts` |

## 4. Section 3.3 — the prefix

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 3.3 | Only the 25 canonical exponents are valid; any other is an error. | [prefix.ts:167](../src/model/prefix.ts#L167) — `ERR_PREFIX_INVALID` | `rejection.test.ts` — `D9ACDC83050404`, `D9ACDC83050423`, `D9ACDC830504181F`; `model/prefix.test.ts` |
| 3.3 | When absent, the prefix is 0. | [decode.ts](../src/codec/decode.ts) — a three-item array leaves it at `SIPrefix.None` | `section5-vectors.test.ts` — vectors 1, 2 and 8 |
| 3.3 | When `uncertainty` is present, `prefix` MUST be written explicitly, even when it is 0. | [encode.ts](../src/codec/encode.ts) writes it whenever an uncertainty follows | `rejection.test.ts` — *accepts a prefix of 0 where an uncertainty follows it*; `section5-vectors.test.ts` — vector 6 |
| 3.3 | A prefix of 0 MUST be omitted when no uncertainty follows, and decoders MUST reject the redundant form. | [encode.ts](../src/codec/encode.ts) omits it; [decode.ts](../src/codec/decode.ts) — `ERR_PREFIX_REDUNDANT` in strict mode (the default) | `rejection.test.ts`; `spec-vectors.test.ts` — `redundant-prefix-zero` |
| 3.3 | The prefix applies to the quantity as a whole, not to one factor of a compound unit. | [value.ts](../src/model/value.ts) — the prefix is a property of the reading, not of a factor; [parse.ts:245](../src/text/parse.ts#L245) — only the leading factor of a text product may carry one | `text/text-format.test.ts` — *tokenising a unit*; `docs/text-format.md` |
| 3.3 | Consumers MUST NOT convert a prefixed affine reading by scaling alone. | [value.ts:210](../src/model/value.ts#L210), [:215](../src/model/value.ts#L215) — `compareQuantity` refuses an affine unit across two prefixes | `model/value.test.ts`; `registry/specification.test.ts` — the affine marker against the specification table |
| 3.3 | Encoders SHOULD write absolute temperatures with prefix 0. | Not enforced — a SHOULD about the producer's intent, which the format cannot distinguish from a temperature difference | — |

## 5. Section 3.4 — the uncertainty

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 3.4 | The uncertainty MUST NOT be negative. | [uncertainty.ts:174](../src/model/uncertainty.ts#L174) — `ERR_UNCERTAINTY_NEGATIVE` | `rejection.test.ts` — `D9ACDC8405040020` |
| 3.4 | It is expressed in the same unit and prefix as the value. | [value.ts](../src/model/value.ts) — the uncertainty has no unit of its own to disagree with | `model/value.test.ts`; `text/text-format.test.ts` |
| 3.4 | A bare number is the standard uncertainty, i.e. a coverage factor of 1. | [uncertainty.ts](../src/model/uncertainty.ts) — `coverageFactor` absent means 1 | `section5-vectors.test.ts` — vectors 5 and 6 |
| 3.4 | Key 1, the magnitude, is required. | [decode.ts:474](../src/codec/decode.ts#L474) — `ERR_UNCERTAINTY_NO_MAGNITUDE` | `rejection.test.ts` — `D9ACDC8405040 0A0` |
| 3.4 | The coverage probability is a fraction in ]0, 1]. | [uncertainty.ts:185](../src/model/uncertainty.ts#L185) — `ERR_UNCERTAINTY_PROBABILITY` | `rejection.test.ts` — `D9ACDC84050400A2010103 00`, `… 02` |
| 3.4 | The effective degrees of freedom are positive. | [uncertainty.ts:190](../src/model/uncertainty.ts#L190) — `ERR_UNCERTAINTY_DEGREES_OF_FREEDOM` | `rejection.test.ts` — `D9ACDC84050400A2010105 00` |
| 3.4 | The coverage factor is positive. | [uncertainty.ts:179](../src/model/uncertainty.ts#L179) — `ERR_UNCERTAINTY_COVERAGE_FACTOR` | `rejection.test.ts` — `D9ACDC84050400A2010102 00` |
| 3.4 | Distributions are 1..5; 0 means "not stated" and MUST be omitted rather than written. | [uncertainty.ts:86](../src/model/uncertainty.ts#L86), [decode.ts:451](../src/codec/decode.ts#L451) — `ERR_UNCERTAINTY_DISTRIBUTION` | `rejection.test.ts` — `… 010400` (the zero), `… 010406` (unknown), `… 01046161` (not an integer) |
| 3.4 | A map key other than 1..5 MUST be rejected: an unknown key could state anything, and dropping it would silently change what the uncertainty says. | [decode.ts](../src/codec/decode.ts) — `ERR_UNCERTAINTY_UNKNOWN_KEY` | `rejection.test.ts`; `spec-vectors.test.ts` — `unknown-map-key` |
| 3.4 | The magnitude is kept as reported, together with the coverage factor it belongs to, rather than normalised to u. | [uncertainty.ts](../src/model/uncertainty.ts) — the magnitude is stored verbatim; `standardUncertainty` derives u and requires the caller to state the scale and the rounding | `model/uncertainty.test.ts`; `section5-vectors.test.ts` — vector 9 |
| 3.4 | Rounding is a presentation decision and stays with the producer; the format performs none. | [decimal.ts:383](../src/model/decimal.ts#L383) — `ERR_VALUE_INEXACT`: a division without a stated scale is refused | `model/decimal.test.ts` |
| 7 | A missing uncertainty means "not stated", never "zero". | [value.ts](../src/model/value.ts) — `uncertainty` is `Uncertainty \| undefined`, and `undefined` is not 0 | `model/value.test.ts`; `codec/roundtrip.test.ts` |
| 3.4 | Asymmetric uncertainties and correlations are out of scope. | Not implemented, deliberately — see Section 8 below | — |

## 6. Section 4 — the unit registry

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 4 | The numeric identifications are stable and MUST NOT be renumbered. | [units.json](../src/registry/units.json) is the single source; [units.generated.ts](../src/registry/units.generated.ts) is derived and never hand-edited | `registry/specification.test.ts` parses the specification itself and compares both directions — table rows, aliases, the affine marker, the SenML mapping, the unit-factor examples |
| 4 | `0` is reserved. | [registry/index.ts:95](../src/registry/index.ts#L95) | `registry/registry.test.ts` |
| 4 | 1..32767 are assigned by the specification; 32768..65535 are private use. | [units.generated.ts](../src/registry/units.generated.ts) — `UNIT_ID_PRIVATE_USE_MIN`, `UNIT_ID_SPECIFICATION_MAX`; [registry/index.ts:191](../src/registry/index.ts#L191) — `ERR_UNIT_ID_NOT_PRIVATE_USE` | `registry/registry.test.ts`; `registry/specification.test.ts` |
| 4 | Decoders MUST accept the aliases; encoders SHOULD emit the symbol of the table. | [registry/index.ts](../src/registry/index.ts) — `bySymbol` resolves aliases; the registry stores one canonical symbol per unit | `registry/registry.test.ts`; `registry/specification.test.ts` |
| 4 | Symbols are compared after NFC normalisation, so U+2126 OHM SIGN and U+03A9 are one symbol. | [registry/index.ts](../src/registry/index.ts) — `normalize('NFC')` on registration and on lookup | `registry/registry.test.ts`; `text/text-format.test.ts` — *Unicode* |

## 7. Sections 6 and 7 — determinism and robustness

| Clause | Requirement | Site | Test |
|---|---|---|---|
| 6 | The encoding of a metrological value is a function of its value, scale, unit, prefix and uncertainty alone. | [encode.ts](../src/codec/encode.ts); [writer.ts](../src/cbor/writer.ts) — deterministic by construction | `codec/roundtrip.test.ts` — *the encoding is a function of the reading alone*, *the canonical encoding is stable under re-decoding*; `cbor/roundtrip.test.ts` — *encoding is a function of the value alone* |
| 6 | RFC 8949 Section 4.2.1 in full: shortest arguments, definite lengths, sorted and unique map keys, shortest float width. | [reader.ts:261](../src/cbor/reader.ts#L261), [:273](../src/cbor/reader.ts#L273), [:335](../src/cbor/reader.ts#L335), [:352](../src/cbor/reader.ts#L352), [:436](../src/cbor/reader.ts#L436), [:479](../src/cbor/reader.ts#L479) | `cbor/rfc8949-vectors.test.ts` — Appendix A; `cbor/reader.test.ts`; `cbor/writer.test.ts`; `fuzz/decoder.test.ts` — *accepts, in strict mode, only bytes it would itself have written* |
| 6 | Two readings denoting the same quantity in different representations intentionally do not produce the same bytes. | [value.ts](../src/model/value.ts) — `compareQuantity` compares mantissa and total exponent and is separate from equality of representation | `model/value.test.ts` — `5.0 mA` and `0.005 A` compare equal and encode differently |
| 6 | Comparison should be exact and unbounded rather than converting to a common prefix. | [value.ts](../src/model/value.ts) — `bigint` throughout, no conversion | `model/value.test.ts` |
| 7 | Decoders MUST reject unknown unit identifications rather than substituting a placeholder. | [registry/index.ts:108](../src/registry/index.ts#L108) | `rejection.test.ts`; `registry/registry.test.ts` — `byId` throws, `tryById` returns `undefined` where the caller prefers that |
| 7 | Decoders MUST bound the resources spent on reconstructing a value. | [limits.ts](../src/cbor/limits.ts) — `DecodeLimits`; [reader.ts:713](../src/cbor/reader.ts#L713) — `ERR_CBOR_LIMIT_EXCEEDED` | `fuzz/limits.test.ts` — every field of `DecodeLimits`, each with the input that just exceeds it and the one that just does not, and each timed |
| 7 | The security considerations of RFC 8949 apply. | [reader.ts](../src/cbor/reader.ts) — no allocation on a claimed length before the bytes behind it are counted | `fuzz/limits.test.ts` — *a length that nothing backs*, nine bytes claiming 2^64−1 items |
| — | Every input yields a value or a typed refusal, and never a third thing. | [errors.ts](../src/errors.ts) — one hierarchy, stable codes; [invariant.ts](../src/invariant.ts) — an `InvariantError` is deliberately *not* one of them | `fuzz/decoder.test.ts`, `fuzz/text.test.ts`, `fuzz/json.test.ts` — mutated golden vectors, random bytes, text from the grammar's own alphabet, and generated JSON |

## 8. Section 6a — what this tag does not carry

Out of scope by the specification's own division of labour, and therefore out
of scope here. Not gaps.

| | |
|---|---|
| The kind of quantity (`N·m` versus `J`) | Belongs beside the value in the carrying structure |
| Traceability metadata — instant, instrument, certificate, operator | Belongs to the carrying document; the worked example shows it as sibling map entries |
| Correlations between quantities | A property of a set of values, not of one |
| Unit conversion (Wh→J, °C→K) | The registry carries no conversion factors, and the specification warns against naive affine scaling |
| COSE signing and verification | [WORKPLAN.md](../WORKPLAN.md) §1: a verification *demo* may live in `examples/` with dev-only dependencies, never in the library |

## 9. metrological-text.md Section 3 — the JSON conversion

The document-level conversion between CBOR and JSON is specified in
[metrological-text.md](https://github.com/OpenChargingTechnology/Whitepapers/blob/master/MetrologicalCBOR/metrological-text.md),
Section 3. Its defining requirement — the digits of a JSON number as written,
in both directions — is something JavaScript's native JSON tree cannot carry,
so this library has two pairs of entry points: the exact **text** pair
([text.ts](../src/json/text.ts) — `mcborToJsonText`, `jsonTextToMcbor`) is
the conforming converter, and the tree pair
([to-json.ts](../src/json/to-json.ts), [from-json.ts](../src/json/from-json.ts))
is the documented lossy convenience beside it.

| Clause | Requirement | Site | Test |
|---|---|---|---|
| text 3.1 | Tag 44252 becomes one JSON string in the metrological text format. | [text.ts](../src/json/text.ts) — `writeTag`; [to-json.ts](../src/json/to-json.ts) | `json/text.test.ts` — *writes a reading as one string*; `json/conversion.test.ts`; `spec-vectors.test.ts` — the documents suite |
| text 3.1 | Integers are exact JSON numbers, however large — including beyond 2⁵³, and bignums. | [text.ts](../src/json/text.ts) — digits from `bigint`, never through a double | `json/text.test.ts` — *writes integers of any size exactly* |
| text 3.1 | A decimal fraction outside a reading is a number with its scale. | [text.ts](../src/json/text.ts) — `decimalFractionText` | `json/text.test.ts` — *writes a decimal fraction with its scale*; `spec-vectors.test.ts` |
| text 3.1 | A float always carries a decimal point or exponent, so it reads back as a decimal fraction rather than an integer. | [text.ts](../src/json/text.ts) — `floatText` | `json/text.test.ts` — *writes a float with its point* |
| text 3.1 | Tag 1 becomes the instant it denotes, UTC with millisecond precision; tag 0 and the text tags pass through as the strings they wrap; tag 37 is a UUID; tag 55799 is transparent. | [text.ts](../src/json/text.ts) — `epochText`, `uuidText`, `writeTag` | `json/text.test.ts`; `spec-vectors.test.ts` |
| text 3.2 | Numbers never become binary floats: an integer becomes a CBOR integer or bignum, everything else an exact decimal fraction from the digits as written; an exponent that leaves no decimal places denotes the integer it equals. | [text.ts](../src/json/text.ts) — `parseNumber`, a JSON number reader of its own | `json/text.test.ts` — *reads a fractional number as an exact decimal fraction, never a float*; `spec-vectors.test.ts` — the json-to-cbor suite |
| text 3.2 | Strings are try-parsed against the anchored grammar; a full match becomes tag 44252, everything else stays a string. | [text.ts](../src/json/text.ts) — `readingOrText`; [from-json.ts](../src/json/from-json.ts) | `json/text.test.ts` — *keeps a bare numeric string a string*; `json/conversion.test.ts` |
| text 3.3 | What round-trips does so byte for byte; what does not is a stated one-way conversion, never a silent loss. | [text.ts](../src/json/text.ts) | `json/text.test.ts` — *the exact round trip*; `json/roundtrip.test.ts`; `spec-vectors.test.ts` — `roundtrip` and `roundtripHex` |

## 10. Where this implementation stood ahead of the specification

This section used to list five spellings this library refused although the
document allowed them. On 2026-08-18 the specification decided them — via
the [cross-implementation conformance suite](https://github.com/Vanaheimr/MCBORConformanceTests)
— and four became normative decoder rejections, now listed in their sections
above: the one-element product and the unreduced rational exponent (Section
3.2, where the earlier "decoders MUST *reduce*" became "decoders MUST
*reject*"), the redundant prefix 0 (Section 3.3), and the unknown
uncertainty-map key (Section 3.4). The fifth, `4([0, 5])` where `5` would
do, is subsumed by the stronger new rule of Section 3.1 that a decimal
fraction's exponent is negative on the wire.

The unreduced exponent is worth remembering by name: it was found by the
fuzz suite during WP7, through the property a signature depends on — strict
mode used to accept `[20, 2]` and write `10` back, so decoding and
re-encoding a signed document changed its bytes. That finding is what argued
the specification into *reject* rather than *reduce*.

What genuinely remains stricter than any MUST:

| Spelling | Code | Why it is refused |
|---|---|---|
| An uncertainty map holding nothing but a magnitude | `ERR_UNCERTAINTY_REDUNDANT_MAP` | Section 3.4 calls the bare number the compact form; a map that states no more gives one uncertainty two encodings, which Section 6 does not allow — but the document stops short of a decoder MUST |

And one mode is now *weaker* than the document, deliberately and visibly:
**lenient mode** (`strict: false`) still reads the one-element product, the
redundant prefix and the unreduced exponent and normalises them. Since the
specification made those decoder MUSTs, lenient mode is an explicit opt-out
for reading legacy or foreign bytes, not a conforming decoder profile; the
default remains strict, which is the profile the specification RECOMMENDS in
its Section 6.

## 11. Coverage

Measured by `npm run test:coverage` over `src/**`, excluding generated files.

| | Statements | Branches | Functions |
|---|---|---|---|
| Whole library | 99.8 % | 99.5 % | 100 % |
| `src/codec/` | **100 %** | **100 %** | **100 %** |
| `src/text/` | **100 %** | **100 %** | **100 %** |

Three branches in the whole library are not covered, and none of them can be
reached by any input. Each is a guard whose removal would turn an impossible
state into a silent wrong answer, so each stays, uncovered and named here
rather than hidden behind an ignore comment:

| Site | Why it cannot be reached |
|---|---|
| [reader.ts:195](../src/cbor/reader.ts#L195) | The `default` of the major-type switch. A major type is three bits and all eight values are handled above it; the case exists because the switch has to be exhaustive for its return type |
| [writer.ts:369](../src/cbor/writer.ts#L369) | An argument too large for a CBOR head. Every caller bounds its argument first — a tag number at [writer.ts:147](../src/cbor/writer.ts#L147), an integer by becoming a bignum, a length by being a length |
| [unit.ts:109](../src/model/unit.ts#L109) | `gcd(0, 0)`, which needs a zero numerator, and a zero numerator is refused one call earlier |

A fourth class of unreachable branch was removed rather than documented: the
mandatory capture groups of the text parser, which `noUncheckedIndexedAccess`
types as possibly absent. They were `?? ''` fallbacks — a silent wrong answer
where the reasoning was mistaken, and one permanently untestable branch per
site. They are now one [`invariant`](../src/invariant.ts) call each, stating
the guarantee once and checked once by [`tests/invariant.test.ts`](../tests/invariant.test.ts).

## 12. What the tests are

| Suite | What it establishes |
|---|---|
| `tests/registry/specification.test.ts` | The registry and the specification document agree, in both directions. Fetched by `npm run fetch:spec`; skipped rather than failed where the document is absent, and not skipped in the nightly run |
| `tests/cbor/rfc8949-vectors.test.ts` | RFC 8949 Appendix A, encode and decode |
| `tests/codec/section5-vectors.test.ts` | All ten readings of specification Section 5, byte for byte, both directions |
| `tests/codec/worked-example.test.ts`, `tests/cbor/worked-example.test.ts` | The signed record of the specification — 713 bytes, nested six deep — decodes, walks and re-encodes without losing a byte. Extracted mechanically by `npm run extract:example` rather than transcribed |
| `tests/codec/rejection.test.ts` | One red test per normative MUST, asserting the code rather than the fact of a throw |
| `tests/*/roundtrip.test.ts` | Property-based round trips: bytes ⇄ model ⇄ text ⇄ JSON |
| `tests/text/exhaustive.test.ts` | Every registered symbol against every prefix and every exponent the renderer writes — a sweep rather than a sample |
| `tests/fuzz/` | Mutated golden vectors, random bytes, text from the grammar's alphabet, generated JSON, and every field of `DecodeLimits` |

The fuzz corpus is sized by `MCBOR_FUZZ_RUNS`; the nightly workflow raises it
well past what a pull request can afford. Two of its tests measure how often
the corpus is *accepted* rather than refused, because every other property in
those suites has the form "if it was accepted, then ..." and would hold
vacuously over a corpus that had stopped reaching the decoder.

---

## Appendix A — every error code

Every code the library can raise, and what it comes from. A reader with a code
in hand starts here; the sections above are for a reader with a clause in hand.

`tests/conformance.test.ts` fails if a code exists and is not in this table, if
a code is in this table and does not exist, or if any file this document points
at is missing.

### From the specification

Covered by the sections above.

| Code | Clause |
|---|---|
| `ERR_ARITY` | 3 — the content is not an array of two to four items |
| `ERR_TAG_MISMATCH` | 3 — the item is not tagged 44252 |
| `ERR_VALUE_FLOAT` | 3.1 — a binary floating-point reading |
| `ERR_VALUE_BIGFLOAT` | 3.1 — a bigfloat reading |
| `ERR_VALUE_TYPE` | 3.1, 3.2 — a reading, a unit or an exponent of the wrong shape |
| `ERR_VALUE_EXPONENT_RANGE` | 7 — a decimal exponent beyond what is reconstructed |
| `ERR_VALUE_MANTISSA_RANGE` | 7 — a mantissa beyond what is reconstructed |
| `ERR_VALUE_INEXACT` | 3.4 — a division asked for without a stated scale |
| `ERR_UNIT_UNKNOWN` | 3.2, 7 — an unregistered identification or an unknown symbol |
| `ERR_UNIT_ID_RESERVED` | 4 — the identification 0 |
| `ERR_UNIT_ID_OUT_OF_RANGE` | 3.2, 4 — outside 1..65535 |
| `ERR_UNIT_ID_NOT_PRIVATE_USE` | 4 — a private-use registration outside 32768..65535 |
| `ERR_UNIT_EXPONENT_ZERO` | 3.2 — a numerator of zero |
| `ERR_UNIT_EXPONENT_DENOMINATOR` | 3.2 — a denominator that is not positive, or a part that is not a small integer |
| `ERR_UNIT_EXPONENT_NOT_REDUCED` | 3.2, 6 — a rational not in lowest terms (strict mode; see Section 9) |
| `ERR_UNIT_PRODUCT_EMPTY` | 3.2 — a product of powers with no factors, which the CDDL `[+ unit-factor]` excludes |
| `ERR_UNIT_SINGLE_AS_PRODUCT` | 3.2, 6 — a single named unit as a one-element product (strict mode; see Section 9) |
| `ERR_PREFIX_INVALID` | 3.3 — not one of the 25 canonical exponents |
| `ERR_PREFIX_REDUNDANT` | 3.3, 6 — a prefix of 0 with nothing after it (strict mode; see Section 9) |
| `ERR_UNCERTAINTY_NEGATIVE` | 3.4 |
| `ERR_UNCERTAINTY_NO_MAGNITUDE` | 3.4 — key 1 is required |
| `ERR_UNCERTAINTY_COVERAGE_FACTOR` | 3.4 — a coverage factor that is not positive |
| `ERR_UNCERTAINTY_PROBABILITY` | 3.4 — outside ]0, 1] |
| `ERR_UNCERTAINTY_DISTRIBUTION` | 3.4 — unknown, or the "not stated" 0 written out |
| `ERR_UNCERTAINTY_DEGREES_OF_FREEDOM` | 3.4 — not positive |
| `ERR_UNCERTAINTY_UNKNOWN_KEY` | 3.4 — a key this version does not define, rejected rather than ignored |
| `ERR_UNCERTAINTY_REDUNDANT_MAP` | 3.4, 6 — a map stating only a magnitude (strict mode; see Section 9) |

### From RFC 8949

The CBOR layer underneath. Enforced by [reader.ts](../src/cbor/reader.ts) and
[writer.ts](../src/cbor/writer.ts), tested by `cbor/rfc8949-vectors.test.ts`,
`cbor/reader.test.ts`, `cbor/writer.test.ts` and the fuzz suites.

| Code | Clause |
|---|---|
| `ERR_CBOR_UNEXPECTED_END` | 5.1 — the input ended inside a data item |
| `ERR_CBOR_MALFORMED` | 5.1 — not well-formed |
| `ERR_CBOR_TRAILING_DATA` | a complete item, and then more bytes |
| `ERR_CBOR_INVALID_UTF8` | 3.1 — a text string that is not valid UTF-8 |
| `ERR_CBOR_NON_PREFERRED` | 4.2.1 — an argument not in the shortest form, a bignum where a basic integer would do, a float wider than it needs to be |
| `ERR_CBOR_INDEFINITE_LENGTH` | 4.2.1 — an indefinite length, which deterministic encoding forbids |
| `ERR_CBOR_DUPLICATE_KEY` | 5.6 — the same key twice in one map |
| `ERR_CBOR_UNSORTED_KEYS` | 4.2.1 — map keys not in bytewise order |
| `ERR_CBOR_LIMIT_EXCEEDED` | specification 7 — a configured resource limit |
| `ERR_CBOR_UNENCODABLE` | a value this model can hold and CBOR cannot carry: a duplicate key, a tag number past 2^64, a float that does not fit the width it was given |

### From this library's own layers

Neither the tag specification nor RFC 8949 defines these. The text grammar
and the JSON profile follow the specification's
[metrological-text.md](https://github.com/OpenChargingTechnology/Whitepapers/blob/master/MetrologicalCBOR/metrological-text.md);
[docs/text-format.md](text-format.md) describes the same format from this
library's point of view.

| Code | Origin |
|---|---|
| `ERR_TEXT_SYNTAX` | text that is not a reading in the format this library writes |
| `ERR_VALUE_SYNTAX` | a decimal string that is not a decimal number |
| `ERR_JSON_TYPE` | a JavaScript value that is not JSON at all — `undefined`, a `bigint`, a symbol, a function, an infinity, a NaN |
| `ERR_JSON_UNSUPPORTED` | a data item with no JSON form under the chosen options: a byte string under `bytes: 'error'`, a float under `floats: 'error'`, an unhandled tag |
| `ERR_JSON_KEY` | a map key a JSON object cannot name, or two keys that would become one name |
| `ERR_JSON_PRECISION` | an integer outside ±(2^53 − 1), refused rather than rounded |
| `ERR_REGISTRY_CONFLICT` | a private-use registration whose identification or symbol is already taken |

An `InvariantError` is deliberately none of these: it is not an `McborError` at
all, because it says the library is wrong rather than the input. See
[src/invariant.ts](../src/invariant.ts).

---

*Version 0.9.0, 2026-08-18. Kept in step with the code by `tests/conformance.test.ts`.*
