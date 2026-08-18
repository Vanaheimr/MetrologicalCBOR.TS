# Metrological CBOR (mCBOR) for TypeScript

[![CI](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/ci.yml/badge.svg)](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/ci.yml)
[![Nightly](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/nightly.yml/badge.svg)](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/nightly.yml)
[![npm](https://img.shields.io/npm/v/@vanaheimr/metrological-cbor.svg)](https://www.npmjs.com/package/@vanaheimr/metrological-cbor)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

The reference implementation of **CBOR tag 44252** for TypeScript: a compact,
signable binary representation of a measured physical quantity.

```
44252([4([-1, 50]), 4, -3])        ->  5.0 mA        (9 bytes on the wire)
```

A bare `230` is meaningless without "volt". A reading of `1.10 kWh` says more
than `1.1 kWh`, because the trailing zero states the resolution of the
measurement. And a value without a statement of uncertainty is, strictly
speaking, not a measurement result at all. Tag 44252 carries all three — unit,
exact decimal scale and GUM uncertainty — while a generic CBOR decoder that has
never heard of the tag still sees a well-formed array of standard numbers.

## Status

**0.1.0 — the codec works.** All ten examples of specification Section 5 encode
and decode byte for byte, in both directions. The text format and the
document-level JSON conversion are still to come. See
[WORKPLAN.md](WORKPLAN.md) for the plan and its work packages.

| Work package | State |
|---|---|
| WP0 — Scaffolding: build, tests, lint, CI, license | done |
| WP1 — Unit registry from specification Section 4 | done |
| WP2 — Minimal deterministic CBOR core | done |
| WP3 — Domain model and validation | done |
| WP4 — Tag 44252 codec | done — **v0.1.0** |
| WP5 — Text format: grammar, renderer, parser | next |
| WP6 — Document-level CBOR/JSON conversion | planned |
| WP7 — Hardening and conformance | planned |
| WP8 — Documentation and release | planned |

Version 1.0.0 is gated on the IANA registration of the tag. Until then the
public API may change in minor releases.

## Installation

```bash
npm install @vanaheimr/metrological-cbor
```

Node 20 or newer. No runtime dependencies. ESM and CommonJS, with type
declarations.

## Reading and writing a metrological value

```ts
import { decodeMetrologicalValue, encodeMetrologicalValue,
         metrologicalValue, decimal, unitById, Units, SIPrefix,
         bytesToHex, hexToBytes } from '@vanaheimr/metrological-cbor';

// 5.0 mA — nine bytes on the wire
const reading = decodeMetrologicalValue(hexToBytes('D9ACDC83C4822018320422'));

reading.formatValue();     // '5.0'  — the trailing zero is the resolution
reading.prefix;            // -3
reading.unit;              // the ampere

bytesToHex(encodeMetrologicalValue(reading));   // back to the identical bytes
```

Writing one is the same in reverse:

```ts
const energy = metrologicalValue({
    value:  decimal(110, -2),       // 1.10, exactly
    unit:   unitById(Units.WattHour),
    prefix: SIPrefix.Kilo,
});

bytesToHex(encodeMetrologicalValue(energy));    // 'D9ACDC83C48221186E0203'
```

Decoding is strict by default: bytes that are not the encoding a conforming
encoder would have produced are rejected, which is what data that was signed
requires. `{ strict: false }` accepts those spellings and normalises them.
`{ units: 'preserve' }` on the way out reproduces a symbolic unit as it
arrived, so a signature over a document this library did not write survives.

## What else works today

```ts
import { UnitRegistry, Units, METROLOGICAL_VALUE_TAG } from '@vanaheimr/metrological-cbor';

const registry = UnitRegistry.standard;

registry.byId(Units.Volt).symbol;     // 'V'
registry.bySymbol('Wh').id;           // 2
registry.bySymbol('Ohm').id;          // 14, via the alias
registry.bySymbol('Ω').id;       // 14, the OHM SIGN normalises onto U+03A9
registry.byId(Units.DegreeCelsius);   // affine: true

METROLOGICAL_VALUE_TAG;               // 44252
```

The CBOR core reads and writes the format the tag lives in:

```ts
import { decodeHex, encodeToHex, diagnostic, walk } from '@vanaheimr/metrological-cbor';

const reading = decodeHex('D9ACDC 83 C482201832 04 22');

diagnostic(reading);        // '44252([4([-1, 50]), 4, -3])'  — 5.0 mA
encodeToHex(reading);       // back to the identical bytes
```

Integers are integers whatever their magnitude — a bignum mantissa is a
`bigint`, not a lost decimal place — and the encoder is deterministic, so the
same value always produces the same bytes and therefore the same signature.
Decoding is strict by default: anything that is not the encoding a
deterministic encoder would have produced is rejected, which is what data that
was signed requires.

And the model expresses a reading, exactly:

```ts
import { metrologicalValue, decimal, integer, unitById, uncertainty,
         Units, SIPrefix, standardUncertainty } from '@vanaheimr/metrological-cbor';

// (230.00 ±0.12) V, k = 2 — a calibration certificate, as written
const voltage = metrologicalValue({
    value:       decimal(23000, -2),      // 230.00, and the trailing zeros are data
    unit:        unitById(Units.Volt),
    uncertainty: uncertainty({ magnitude: decimal(12, -2), coverageFactor: integer(2) }),
});

voltage.formatValue();                    // '230.00'
standardUncertainty(voltage.uncertainty!, { scale: 3, rounding: 'half-even' });  // 0.060
```

The magnitude stays as the certificate reported it, together with the coverage
factor it belongs to — it is never normalised to `u` behind your back. Deriving
`u = U / k` makes you state the scale and the rounding, because choosing a
precision for a measurement result is not the library's decision.

Lookups reject rather than guess, because a value silently attributed to the
wrong unit is worse than a decoding failure:

```ts
registry.byId(0);        // UnitError ERR_UNIT_ID_RESERVED
registry.byId(70000);    // UnitError ERR_UNIT_ID_OUT_OF_RANGE
registry.byId(45);       // UnitError ERR_UNIT_UNKNOWN
registry.tryById(45);    // undefined, where the caller prefers that
```

Registries are immutable, so an application registering a private-use unit
cannot change how unrelated code decodes the wire:

```ts
const extended = registry.withPrivateUnits({
    id:     40000,          // 32768..65535 is the private-use range
    symbol: 'flurbo',
    name:   'flurbo',
});
```

## What is planned

The shape the codec is heading for, from [WORKPLAN.md](WORKPLAN.md):

```ts
const v = MetrologicalValue.of({
    value:       { mantissa: 110n, exponent: -2 },   // 1.10, exactly
    unit:        Units.WattHour,
    prefix:      SIPrefix.Kilo,
    uncertainty: { magnitude: { mantissa: 12n, exponent: -1 }, k: 2 },
});

v.encode();                       // deterministic bytes, suitable for signing
v.toString();                     // '(1.10 ±1.2) kWh, k=2'
MetrologicalValue.parse('230 V'); // the text form, losslessly

mcborToJson(bytes);               // every metrological value becomes one string
jsonToMcbor(json);                // and back
```

Two design commitments run through all of it:

- **No binary floating point.** An IEEE 754 double can represent neither `0.1`
  exactly nor a decimal scale at all. Mantissas are `bigint`, formatting and
  parsing are exact string arithmetic, and a linter rule keeps it that way.
- **The written representation is data.** `4([-1, 50])` and `5` denote the same
  quantity but different measurement resolutions, and both survive a
  decode/encode round trip unchanged.

## The unit registry

50 units, transcribed from Section 4 of the specification. The single-byte
identifications 1..23 are allocated by frequency rather than by taxonomy — the
watt-hour is 2 and the candela is 25 — because those 23 places are the scarcest
thing the registry has to give away, and the cost is paid once per value
transmitted, forever.

`src/registry/units.json` is the single source of truth;
`src/registry/units.generated.ts` is produced from it and never edited by hand.
`tests/registry/specification.test.ts` parses the specification document itself
and compares it with the registry in both directions — table rows, alias list,
affine marker, SenML mappings and the unit-factor examples — so the two cannot
silently drift apart.

## Development

```bash
npm ci
npm run verify
```

`verify` runs the registry check, the type checker, the linter, the tests and
the build — the same sequence as CI.

The specification lives in
[its own repository](https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR)
and is not committed here. Fetch it to run the conformance comparison; without
it those tests skip rather than fail.

```bash
npm run fetch:spec
```

CI does this before every test run.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules that are not negotiable,
and [SECURITY.md](SECURITY.md) for what counts as a vulnerability in a library
that parses signed, legally relevant measurement data.

## Related

- **[Vanaheimr Styx CBOR](https://github.com/Vanaheimr/Styx/tree/master/Styx/Illias/CBOR)** — the C# reference implementation of the same tag
- **[ChargyCore.TS](https://github.com/OpenChargingCloud/ChargyCore.TS)** — transparency software for e-mobility charging processes
- [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949) — CBOR
- [RFC 9052](https://www.rfc-editor.org/rfc/rfc9052) — COSE, for signing the result
- [GUM](https://www.bipm.org/en/committees/jc/jcgm/publications) (JCGM 100:2008) — the expression of uncertainty in measurement

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright 2026 GraphDefined GmbH
