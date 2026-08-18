/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Round trips over generated readings rather than chosen ones.
 *
 * The claim being tested is the one specification Section 6 makes: the
 * encoding of a reading is a function of its value, scale, unit, prefix and
 * uncertainty and of nothing else. Two consequences follow, and both are
 * checked here — a reading survives the wire unchanged, and the same reading
 * always produces the same bytes.
 */

import fc                        from 'fast-check';
import { describe, expect, it }  from 'vitest';

import { bytesToHex }            from '../../src/cbor/hex.js';
import { decodeMetrologicalValue, encodeMetrologicalValue } from '../../src/codec/index.js';
import { decimal, integer }      from '../../src/model/decimal.js';
import type { DecimalNumber }    from '../../src/model/decimal.js';
import { SI_PREFIX_EXPONENTS }   from '../../src/model/prefix.js';
import { factor, unitById, unitBySymbol, unitExponent, unitProduct } from '../../src/model/unit.js';
import type { UnitFactor, UnitRef } from '../../src/model/unit.js';
import { uncertainty }           from '../../src/model/uncertainty.js';
import type { Uncertainty }      from '../../src/model/uncertainty.js';
import { metrologicalValue }     from '../../src/model/value.js';
import type { MetrologicalValue } from '../../src/model/value.js';
import { STANDARD_UNITS }        from '../../src/registry/units.generated.js';


// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Readings across the whole range of scales an instrument might report. */
const anyNumber: fc.Arbitrary<DecimalNumber> = fc.oneof(
    fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }).map(value => integer(value)),
    fc.tuple(
        fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }),
        fc.integer({ min: -30, max: -1 }),
    ).map(([mantissa, exponent]) => decimal(mantissa, exponent)),
);

/** Non-negative readings, for an uncertainty magnitude. */
const anyMagnitude: fc.Arbitrary<DecimalNumber> = fc.oneof(
    fc.bigInt({ min: 0n, max: 10n ** 20n }).map(value => integer(value)),
    fc.tuple(
        fc.bigInt({ min: 0n, max: 10n ** 20n }),
        fc.integer({ min: -20, max: -1 }),
    ).map(([mantissa, exponent]) => decimal(mantissa, exponent)),
);

const anyUnitId = fc.constantFrom(...STANDARD_UNITS.map(unit => unit.id));

/**
 * Named units written both ways, and by every alias the registry accepts, so
 * that preserve mode is exercised on each spelling rather than on the
 * identification alone.
 */
const anyNamedUnit = fc.oneof(
    anyUnitId.map(id => unitById(id)),
    anyUnitId.map(id => unitBySymbol(STANDARD_UNITS.find(unit => unit.id === id)!.symbol)),
    fc.constantFrom(...STANDARD_UNITS.flatMap(unit => unit.aliases)).map(alias => unitBySymbol(alias)),
);

const anyExponent = fc.oneof(
    fc.integer({ min: -12, max: 12 }).filter(value => value !== 0).map(value => unitExponent(value)),
    fc.tuple(
        fc.integer({ min: -12, max: 12 }).filter(numerator => numerator !== 0),
        fc.integer({ min: 1, max: 12 }),
    ).map(([numerator, denominator]) => unitExponent(numerator, denominator)),
);

const anyUnit: fc.Arbitrary<UnitRef> = fc.oneof(
    anyNamedUnit,
    fc.array(fc.tuple(anyNamedUnit, anyExponent).map(([unit, exponent]): UnitFactor => factor(unit, exponent)),
             { minLength: 1, maxLength: 4 })
      // A lone factor to the first power is a named unit, not a product, and
      // the model refuses to build one. Give it a second factor instead.
      .map(factors =>
          factors.length === 1 && factors[0]?.exponent.kind === 'integer' && factors[0].exponent.value === 1
              ? [...factors, factor(unitById(1), unitExponent(1))]
              : factors)
      .map(factors => unitProduct(factors)),
);

const anyUncertainty: fc.Arbitrary<Uncertainty | undefined> = fc.oneof(
    fc.constant(undefined),
    anyMagnitude.map(magnitude => uncertainty({ magnitude })),
    fc.record({
        magnitude:           anyMagnitude,
        coverageFactor:      fc.option(fc.integer({ min: 1, max: 6 }).map(k => integer(k)),        { nil: undefined }),
        coverageProbability: fc.option(fc.integer({ min: 1, max: 100 }).map(p => decimal(p, -2)),  { nil: undefined }),
        distribution:        fc.option(fc.constantFrom('normal', 'rectangular', 'triangular', 'u-shaped', 'student-t' as const), { nil: undefined }),
        degreesOfFreedom:    fc.option(fc.integer({ min: 1, max: 200 }).map(v => integer(v)),      { nil: undefined }),
    }).map(options => uncertainty({ ...options })),
);

const anyValue: fc.Arbitrary<MetrologicalValue> = fc.record({
    value:       anyNumber,
    unit:        anyUnit,
    prefix:      fc.constantFrom(...SI_PREFIX_EXPONENTS),
    uncertainty: anyUncertainty,
}).map(options => metrologicalValue(options));


// ---------------------------------------------------------------------------

describe('round trips', () => {

    it('a reading survives the wire unchanged', () => {

        fc.assert(
            fc.property(anyValue, value => {
                const bytes   = encodeMetrologicalValue(value, { units: 'preserve' });
                const decoded = decodeMetrologicalValue(bytes);
                expect(decoded.equalsRepresentation(value)).toBe(true);
            }),
            { numRuns: 3000 },
        );

    });

    it('the bytes survive the model unchanged', () => {

        fc.assert(
            fc.property(anyValue, value => {
                const bytes = encodeMetrologicalValue(value, { units: 'preserve' });
                const again = encodeMetrologicalValue(decodeMetrologicalValue(bytes), { units: 'preserve' });
                expect(bytesToHex(again)).toBe(bytesToHex(bytes));
            }),
            { numRuns: 3000 },
        );

    });

    it('the encoding is a function of the reading alone', () => {

        // Encoded twice from the same value, the bytes are the same. This is
        // what makes a signature over measurement data reproducible.
        fc.assert(
            fc.property(anyValue, value => {
                expect(bytesToHex(encodeMetrologicalValue(value)))
                    .toBe(bytesToHex(encodeMetrologicalValue(value)));
            }),
            { numRuns: 1000 },
        );

    });

    it('the canonical encoding is stable under re-decoding', () => {

        // Canonical output drops the symbolic spelling, so decoding it and
        // encoding again must reach a fixed point immediately.
        fc.assert(
            fc.property(anyValue, value => {
                const once  = encodeMetrologicalValue(value);
                const twice = encodeMetrologicalValue(decodeMetrologicalValue(once));
                expect(bytesToHex(twice)).toBe(bytesToHex(once));
            }),
            { numRuns: 3000 },
        );

    });

    it('the canonical encoding denotes the same quantity as what it came from', () => {

        fc.assert(
            fc.property(anyValue, value => {
                const decoded = decodeMetrologicalValue(encodeMetrologicalValue(value));
                expect(decoded.compareQuantity(value)).toBe(0);
                expect(decoded.prefix).toBe(value.prefix);
            }),
            { numRuns: 3000 },
        );

    });

    it('the decimal scale of the reading is never touched', () => {

        // The property the whole format exists for: 1.10 does not become 1.1.
        fc.assert(
            fc.property(anyValue, value => {
                const decoded = decodeMetrologicalValue(encodeMetrologicalValue(value));
                expect(decoded.value.kind).toBe(value.value.kind);
                expect(decoded.formatValue()).toBe(value.formatValue());
            }),
            { numRuns: 3000 },
        );

    });

});


describe('arbitrary bytes as input', () => {

    it('are either decoded or rejected, never anything else', () => {

        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 48 }), input => {

                let decoded;
                try {
                    decoded = decodeMetrologicalValue(input);
                }
                catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    return;
                }

                // Whatever survived is a reading, and re-encoding it reproduces
                // exactly the bytes it was read from.
                expect(bytesToHex(encodeMetrologicalValue(decoded, { units: 'preserve' })))
                    .toBe(bytesToHex(input));

            }),
            { numRuns: 20000 },
        );

    });

    it('are decoded or rejected in lenient mode too', () => {

        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 48 }), input => {
                try {
                    decodeMetrologicalValue(input, { strict: false });
                }
                catch (error) {
                    expect(error).toBeInstanceOf(Error);
                }
            }),
            { numRuns: 20000 },
        );

    });

});
