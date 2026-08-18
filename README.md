# Metrological CBOR (mCBOR) for TypeScript

[![CI](https://github.com/OpenChargingCloud/MetrologicalCBOR.TS/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenChargingCloud/MetrologicalCBOR.TS/actions/workflows/ci.yml)
[![Nightly](https://github.com/OpenChargingCloud/MetrologicalCBOR.TS/actions/workflows/nightly.yml/badge.svg)](https://github.com/OpenChargingCloud/MetrologicalCBOR.TS/actions/workflows/nightly.yml)
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

**Early development.** The unit registry and the project scaffolding are in
place; the codec is not. See [WORKPLAN.md](WORKPLAN.md) for the plan and its
work packages.

| Work package | State |
|---|---|
| WP0 — Scaffolding: build, tests, lint, CI, license | done |
| WP1 — Unit registry from specification Section 4 | done |
| WP2 — Minimal deterministic CBOR core | next |
| WP3 — Domain model and validation | planned |
| WP4 — Tag 44252 codec | planned |
| WP5 — Text format: grammar, renderer, parser | planned |
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

## What works today

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
Where a working copy of the specification is present under `spec/`,
`tests/registry/specification.test.ts` parses the document and compares it with
the registry in both directions, so the two cannot silently drift apart.

## Development

```bash
npm ci
npm run verify
```

`verify` runs the registry check, the type checker, the linter, the tests and
the build — the same sequence as CI.

The specification lives in its own repository and is not committed here. Check
it out into `spec/` to run the conformance comparison; without it those tests
skip rather than fail.

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
