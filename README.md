# Metrological CBOR for TypeScript

[![CI](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/ci.yml/badge.svg)](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/ci.yml)
[![Nightly](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/nightly.yml/badge.svg)](https://github.com/Vanaheimr/MetrologicalCBOR.TS/actions/workflows/nightly.yml)
[![npm](https://img.shields.io/npm/v/@vanaheimr/metrological-cbor.svg)](https://www.npmjs.com/package/@vanaheimr/metrological-cbor)

A reference implementation of [Metrological CBOR (Tag 44252)](https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR) for TypeScript: a compact, signable binary representation of a measured physical quantity with unit of measure, SI prefix and GUM measurement uncertainty.

```
44252([4([-1, 50]), 4, -3])                     ->  5.0 mA

D9ACDC 84 C482211959D8 05 00 A201C482210C0202   -> (230.00 ±0.12) V, k=2	
```

A bare `230` is meaningless without "volt". A reading of `1.10 kWh` says more
than `1.1 kWh`, because the trailing zero states the resolution of the
measurement. And a value without a statement of uncertainty is, strictly
speaking, not a measurement result at all. Tag 44252 carries all three — unit,
exact decimal scale and GUM uncertainty — while a generic CBOR decoder that has
never heard of the tag still sees a well-formed array of standard numbers.


## Current Status

- IANA assigned [CBOR tag 44252](https://www.iana.org/assignments/cbor-tags) on 2026-08-19.
- [docs/conformance.md](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/docs/conformance.md) maps every normative clause to the
code that enforces it and the test that proves it, and the four signatures over
the specification's worked record verify against bytes this library produced.
- [Cross-Implementation Conformance Test Suite](https://github.com/Vanaheimr/MCBORConformanceTests)
then compared this library against the [C# reference implementation](https://github.com/Vanaheimr/Styx/tree/master/Styx/Illias/CBOR), and the
[specification](https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR) decided every point on which the two disagreed.


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

## A whole document through JSON

```ts
import { mcborToJson, jsonToMcbor } from '@vanaheimr/metrological-cbor';

mcborToJson(meterReading);
// {
//   meter:       '1ISA0000000042',
//   transaction: 'a4f1c9e2',
//   context:     'Transaction.Begin',
//   time:        '2026-08-15T08:14:00Z',
//   energy:      '(1234.567 ±12.3) kWh, k=2, p=0.95, dist=normal'
// }
```

The measurement is one string — value, decimal scale, unit, prefix, magnitude,
coverage factor, coverage probability and distribution, all of it — and
everything else is ordinary JSON. `jsonToMcbor` reads it back, byte-identical
for documents of readings, text, integers within the safe range, booleans,
nulls, arrays and text-keyed maps.

What JSON cannot hold exactly is refused rather than rounded: an integer beyond
2^53 is an error, not the nearest double. Byte strings, floats and dates
convert one way, and say so.

By default every string is tried against the reading grammar, which is what
makes the round trip work without configuration. That has a documented hazard —
a prose field holding `"1 h"` becomes one hour — so an application with a schema
can decide instead:

```ts
jsonToMcbor(json, { readings: (text, path) => path.at(-1) === 'energy' });
```

## A reading as text

```ts
import { formatMetrologicalValue, parseMetrologicalValue } from '@vanaheimr/metrological-cbor';

formatMetrologicalValue(reading);            // '(230.00 ±0.12) V, k=2'
formatMetrologicalValue(reading, { ascii: true });  // '(230.00 +/-0.12) V, k=2'

parseMetrologicalValue('9.81 m·s⁻²');        // and 'm*s^-2'
```

This is a second encoding rather than a pretty-printing: what is written reads
back to the same bytes, which is what will let a whole document travel through
JSON with every measurement intact. The grammar is
[docs/text-format.md](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/docs/text-format.md).

Two of its rules exist because a generated reading found them missing. A prefix
is folded into a symbol only where the result reads back as the same unit —
a centi-day would fold into `cd`, which is the candela — and a superscript is
only written where symbol and exponent do not together spell some other symbol:
the metre cubed is `m^3`, because `m³` is the registered cubic metre.

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

## Signing it

The library does no cryptography and never will. Signing belongs to COSE, and a
data format that also carried a crypto stack would be unusable as the leaf of
somebody else's schema. What the library does is produce the bytes a signature
is over, exactly — and [examples/06](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/examples/06-verify-a-signed-record.ts)
checks that against the specification's own worked record:

```
station   ES256   verifies
          re-sign reproduces the recorded signature byte for byte

meter[0]  ESB256  verifies   (1234.567 ±12.3) kWh, k=2, p=0.95, dist=normal
meter[1]  ESB256  verifies   (1259.869 ±12.6) kWh, k=2, p=0.95, dist=normal

operator  ES384   verifies
```

The second line is the stronger claim. That record is signed deterministically
(RFC 6979), so a signature is a function of what it signs: re-signing the
`Sig_structure` this library builds reproduces the recorded signature byte for
byte, which a construction differing by one byte could not do.

## Examples

Six runnable programs, in [examples/](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/examples/README.md):

```bash
npx tsx examples/01-a-reading.ts
```

They are tested by running them, because documentation that is not executed
rots.

## Two commitments

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

## Working on it

```bash
git clone https://github.com/Vanaheimr/MetrologicalCBOR.TS.git
cd MetrologicalCBOR.TS && npm ci && npm run verify
```

`verify` is the one definition of what is checked — registry, types, lint,
build, tests, API documentation — and it is what CI runs, so a green run on
your machine means the same thing as a green run there.

The fuzz suites take an environment variable, because a pull request and a
nightly run can afford different things:

```bash
MCBOR_FUZZ_RUNS=200000 npm run test:fuzz
```

Two hundred thousand cases per property is the nightly figure. What survived it,
and where every normative requirement of the specification went, is in
[docs/conformance.md](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/docs/conformance.md).

The specification lives in
[its own repository](https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR)
and is not committed here — `npm run fetch:spec` retrieves it, and the suites
that compare against it skip rather than fail where it is absent.

Further reading, all of it in the repository:
[the conformance matrix](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/docs/conformance.md),
[the text grammar](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/docs/text-format.md),
[what a release takes](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/docs/releasing.md),
[the rules that are not negotiable](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/CONTRIBUTING.md),
and [what counts as a vulnerability](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/SECURITY.md)
in a library that parses signed, legally relevant measurement data.


## Related

- IANA [CBOR tag 44252](https://www.iana.org/assignments/cbor-tags) assignment, 2026-08-19
- The official [Metrological CBOR Specification](https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR) on GitHub.
- [C# reference implementation](https://github.com/Vanaheimr/Styx/tree/master/Styx/Illias/CBOR) of the Metrological CBOR specification.
- [Cross-Implementation Conformance Test Suite](https://github.com/Vanaheimr/MCBORConformanceTests)
- [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949) CBOR specification
- [RFC 9052](https://www.rfc-editor.org/rfc/rfc9052) COSE specification for signing the result
- [SI Digital Framework](https://si-digital-framework.org) Digital references for FAIR measurement data
- [Guide to the Expression of Uncertainty in Measurement](https://www.bipm.org/en/committees/jc/jcgm/publications) (GUM, JCGM 100:2008)
- [ChargyCore.TS](https://github.com/OpenChargingCloud/ChargyCore.TS) transparency software for e-mobility charging processes using this software library

## License

Apache License 2.0 — see [LICENSE](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/LICENSE) and [NOTICE](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/NOTICE).

Copyright 2026 GraphDefined GmbH
