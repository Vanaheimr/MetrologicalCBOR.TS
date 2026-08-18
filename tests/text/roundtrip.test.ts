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
 * The text format is lossless, over generated readings rather than chosen ones.
 *
 * One property carries the whole work package: for any reading, writing it as
 * text and reading it back produces the same canonical bytes. Where that fails
 * for even one reading, a measurement carried through JSON is corrupted, and
 * corrupted quietly.
 *
 * The text does not carry the *spelling* of a unit, only the unit, so the
 * comparison is against the canonical encoding — which is what a symbolic unit
 * encodes to anyway once it is not being preserved on purpose.
 */

import fc                        from 'fast-check';
import { describe, expect, it }  from 'vitest';

import { bytesToHex }            from '../../src/cbor/hex.js';
import { encodeMetrologicalValue } from '../../src/codec/index.js';
import { decimal, integer }      from '../../src/model/decimal.js';
import type { DecimalNumber }    from '../../src/model/decimal.js';
import { SI_PREFIX_EXPONENTS }   from '../../src/model/prefix.js';
import { factor, unitById, unitExponent, unitProduct } from '../../src/model/unit.js';
import type { UnitFactor, UnitRef } from '../../src/model/unit.js';
import { uncertainty }           from '../../src/model/uncertainty.js';
import type { Uncertainty }      from '../../src/model/uncertainty.js';
import { metrologicalValue }     from '../../src/model/value.js';
import type { MetrologicalValue } from '../../src/model/value.js';
import { STANDARD_UNITS }        from '../../src/registry/units.generated.js';
import { formatMetrologicalValue, parseMetrologicalValue } from '../../src/text/index.js';


const anyNumber: fc.Arbitrary<DecimalNumber> = fc.oneof(
    fc.bigInt({ min: -(10n ** 24n), max: 10n ** 24n }).map(value => integer(value)),
    fc.tuple(
        fc.bigInt({ min: -(10n ** 24n), max: 10n ** 24n }),
        fc.integer({ min: -24, max: 24 }),
    ).map(([mantissa, exponent]) => decimal(mantissa, exponent)),
);

const anyMagnitude: fc.Arbitrary<DecimalNumber> = fc.oneof(
    fc.bigInt({ min: 0n, max: 10n ** 18n }).map(value => integer(value)),
    fc.tuple(
        fc.bigInt({ min: 0n, max: 10n ** 18n }),
        fc.integer({ min: -18, max: 18 }),
    ).map(([mantissa, exponent]) => decimal(mantissa, exponent)),
);

const anyNamedUnit = fc.constantFrom(...STANDARD_UNITS.map(unit => unit.id)).map(id => unitById(id));

const anyExponent = fc.oneof(
    fc.integer({ min: -9, max: 9 }).map(value => unitExponent(value)),
    fc.tuple(
        fc.integer({ min: -9, max: 9 }).filter(numerator => numerator !== 0),
        fc.integer({ min: 1, max: 9 }),
    ).map(([numerator, denominator]) => unitExponent(numerator, denominator)),
);

const anyUnit: fc.Arbitrary<UnitRef> = fc.oneof(
    anyNamedUnit,
    fc.array(fc.tuple(anyNamedUnit, anyExponent).map(([unit, exponent]): UnitFactor => factor(unit, exponent)),
             { minLength: 1, maxLength: 4 })
      .map(factors =>
          factors.length === 1 && factors[0]?.exponent.kind === 'integer' && factors[0].exponent.value === 1
              ? [...factors, factor(unitById(8), unitExponent(-1))]
              : factors)
      .map(factors => unitProduct(factors)),
);

const anyUncertainty: fc.Arbitrary<Uncertainty | undefined> = fc.oneof(
    fc.constant(undefined),
    anyMagnitude.map(magnitude => uncertainty({ magnitude })),
    fc.record({
        magnitude:           anyMagnitude,
        coverageFactor:      fc.option(fc.integer({ min: 1, max: 6 }).map(k => integer(k)),       { nil: undefined }),
        coverageProbability: fc.option(fc.integer({ min: 1, max: 100 }).map(p => decimal(p, -2)), { nil: undefined }),
        distribution:        fc.option(fc.constantFrom('normal', 'rectangular', 'triangular', 'u-shaped', 'student-t' as const), { nil: undefined }),
        degreesOfFreedom:    fc.option(fc.integer({ min: 1, max: 200 }).map(v => integer(v)),     { nil: undefined }),
    }).map(options => uncertainty(options)),
);

const anyValue: fc.Arbitrary<MetrologicalValue> = fc.record({
    value:       anyNumber,
    unit:        anyUnit,
    prefix:      fc.constantFrom(...SI_PREFIX_EXPONENTS),
    uncertainty: anyUncertainty,
}).map(options => metrologicalValue(options));


describe('text is a second encoding of a reading', () => {

    it('reading it back produces the same bytes', () => {

        fc.assert(
            fc.property(anyValue, value => {
                const text = formatMetrologicalValue(value);
                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(text))))
                    .toBe(bytesToHex(encodeMetrologicalValue(value)));
            }),
            { numRuns: 100_000 },
        );

    });

    it('the ASCII output says the same thing', () => {

        fc.assert(
            fc.property(anyValue, value => {
                const text = formatMetrologicalValue(value, { ascii: true });
                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(text))))
                    .toBe(bytesToHex(encodeMetrologicalValue(value)));
            }),
            { numRuns: 50_000 },
        );

    });

    it('writing is a function of the reading alone', () => {

        fc.assert(
            fc.property(anyValue, value => {
                expect(formatMetrologicalValue(value)).toBe(formatMetrologicalValue(value));
            }),
            { numRuns: 5000 },
        );

    });

    it('writing what was read reproduces the text', () => {

        // The canonical text is a fixed point: parsing it and writing it again
        // must not drift, or a document would change shape each time it passed
        // through JSON.
        fc.assert(
            fc.property(anyValue, value => {
                const once  = formatMetrologicalValue(value);
                const twice = formatMetrologicalValue(parseMetrologicalValue(once));
                expect(twice).toBe(once);
            }),
            { numRuns: 50_000 },
        );

    });

});


describe('arbitrary text as input', () => {

    it('is either read or rejected, never anything else', () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 24 }), input => {

                let value;
                try {
                    value = parseMetrologicalValue(input);
                }
                catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    return;
                }

                // Whatever was understood must survive being written back.
                const text = formatMetrologicalValue(value);
                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(text))))
                    .toBe(bytesToHex(encodeMetrologicalValue(value)));

            }),
            { numRuns: 20_000 },
        );

    });

});
