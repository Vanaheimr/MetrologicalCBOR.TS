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
 * Exact decimal numbers.
 *
 * The property under test throughout is that the decimal scale is data:
 * `1.10` and `1.1` are different readings of the same quantity, and nothing
 * here may conflate them. Everything is bigint and string arithmetic, so the
 * tests assert exact strings rather than approximate numbers.
 */

import fc                        from 'fast-check';
import { describe, expect, it }  from 'vitest';

import {
    MAX_DECIMAL_EXPONENT, MAX_MANTISSA_DIGITS,
    absoluteValue, compareDecimal, decimal, divideDecimal, equalsExact, exponentOf,
    formatDecimal, integer, isNegative, isZero, mantissaOf, negate, parseDecimal, scaleOf,
} from '../../src/model/decimal.js';
import { codeOf }           from '../support/errors.js';




describe('formatting', () => {

    it.each([
        [integer(0),           '0'],
        [integer(5),           '5'],
        [integer(-5),          '-5'],
        [integer(230),         '230'],
        [decimal(50, -1),      '5.0'],
        [decimal(110, -2),     '1.10'],
        [decimal(1234567, -3), '1234.567'],
        [decimal(5, -3),       '0.005'],
        [decimal(-5, -3),      '-0.005'],
        [decimal(0, -2),       '0.00'],
        [decimal(23000, -2),   '230.00'],
        [decimal(12, -2),      '0.12'],
        [decimal(5, 0),        '5'],
        [decimal(5, 2),        '500'],
        [decimal(-5, 2),       '-500'],
        [decimal(45, -10),     '0.0000000045'],
    ])('writes %o as %s', (value, expected) => {
        expect(formatDecimal(value)).toBe(expected);
    });

    it('keeps a trailing zero, because it states the resolution', () => {

        // The whole reason this library does not use floating point.
        expect(formatDecimal(decimal(110, -2))).toBe('1.10');
        expect(formatDecimal(decimal(11, -1))).toBe('1.1');
        expect(formatDecimal(decimal(1100, -3))).toBe('1.100');

    });

});


describe('parsing', () => {

    it.each([
        ['5',        integer(5)],
        ['-5',       integer(-5)],
        ['+5',       integer(5)],
        ['0',        integer(0)],
        ['230',      integer(230)],
        ['5.0',      decimal(50, -1)],
        ['1.10',     decimal(110, -2)],
        ['1234.567', decimal(1234567, -3)],
        ['0.005',    decimal(5, -3)],
        ['-0.005',   decimal(-5, -3)],
        ['4.5e-9',   decimal(45, -10)],
        ['4.5E-9',   decimal(45, -10)],
        ['5e2',      decimal(5, 2)],
        ['5e+2',     decimal(5, 2)],
    ])('reads %s', (text, expected) => {
        expect(parseDecimal(text)).toStrictEqual(expected);
    });

    it('makes a plain run of digits an integer, which is what encoders prefer', () => {

        expect(parseDecimal('5').kind).toBe('int');
        expect(parseDecimal('5.0').kind).toBe('decimal');
        expect(parseDecimal('5e0').kind).toBe('decimal');

    });

    it.each([
        '', ' ', 'five', '5.', '.5', '5..0', '5e', '5e1.5', '0x10', '1,5', 'NaN', 'Infinity', '1e999999999999',
    ])('rejects %s', text => {
        expect(codeOf(() => parseDecimal(text))).not.toBe('no throw');
    });

    it('round-trips through text for any mantissa and scale', () => {

        fc.assert(
            fc.property(
                fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }),
                fc.integer({ min: -40, max: 40 }),
                (mantissa, exponent) => {
                    const value = decimal(mantissa, exponent);
                    const text  = formatDecimal(value);
                    // A positive exponent formats positionally, so the scale is
                    // not recoverable from the text alone; the quantity is.
                    expect(compareDecimal(parseDecimal(text), value)).toBe(0);
                },
            ),
            { numRuns: 2000 },
        );

    });

    it('recovers the exact representation where the scale is written', () => {

        fc.assert(
            fc.property(
                fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }),
                fc.integer({ min: -40, max: 0 }),
                (mantissa, exponent) => {
                    const value = decimal(mantissa, exponent);
                    // Leading zeros in the mantissa are not representable in
                    // positional text, so compare the value and the scale.
                    const back = parseDecimal(formatDecimal(value));
                    expect(compareDecimal(back, value)).toBe(0);
                    expect(scaleOf(back)).toBe(scaleOf(value));
                },
            ),
            { numRuns: 2000 },
        );

    });

});


describe('inspection', () => {

    it('reports the mantissa and exponent of both forms', () => {

        expect(mantissaOf(integer(5))).toBe(5n);
        expect(exponentOf(integer(5))).toBe(0);
        expect(mantissaOf(decimal(50, -1))).toBe(50n);
        expect(exponentOf(decimal(50, -1))).toBe(-1);

    });

    it('reports the scale, which is the resolution the reading states', () => {

        expect(scaleOf(integer(5))).toBe(0);
        expect(scaleOf(decimal(50, -1))).toBe(1);
        expect(scaleOf(decimal(1100, -3))).toBe(3);

        // A positive exponent states a resolution coarser than one.
        expect(scaleOf(decimal(5, 2))).toBe(-2);

    });

    it('recognises zero at any scale', () => {

        expect(isZero(integer(0))).toBe(true);
        expect(isZero(decimal(0, -5))).toBe(true);
        expect(isZero(decimal(1, -5))).toBe(false);

    });

    it('negates without changing the scale', () => {

        expect(negate(decimal(110, -2))).toStrictEqual(decimal(-110, -2));
        expect(formatDecimal(negate(decimal(110, -2)))).toBe('-1.10');
        expect(negate(integer(5))).toStrictEqual(integer(-5));

    });

    it('takes a magnitude without changing the scale', () => {

        expect(formatDecimal(absoluteValue(decimal(-110, -2)))).toBe('1.10');
        expect(absoluteValue(decimal(110, -2))).toStrictEqual(decimal(110, -2));
        expect(isNegative(absoluteValue(decimal(-1, 0)))).toBe(false);

    });

});


describe('comparison', () => {

    it('distinguishes representations that denote the same quantity', () => {

        // The specification requires both to survive a round trip unchanged,
        // which means the library must be able to tell them apart.
        expect(equalsExact(integer(5), decimal(50, -1))).toBe(false);
        expect(equalsExact(integer(5), decimal(5, 0))).toBe(false);
        expect(equalsExact(decimal(50, -1), decimal(50, -1))).toBe(true);

    });

    it('compares the quantities regardless of scale', () => {

        expect(compareDecimal(integer(5), decimal(50, -1))).toBe(0);
        expect(compareDecimal(integer(5), decimal(500, -2))).toBe(0);
        expect(compareDecimal(decimal(11, -1), decimal(110, -2))).toBe(0);

    });

    it.each([
        [integer(1),        integer(2),        -1],
        [integer(2),        integer(1),         1],
        [integer(-1),       integer(1),        -1],
        [integer(-2),       integer(-1),       -1],
        [integer(0),        integer(0),         0],
        [decimal(0, -5),    integer(0),         0],
        [decimal(1, -1),    decimal(1, -2),     1],
        [decimal(-1, -2),   decimal(-1, -1),    1],
        [integer(1),        decimal(1, 100),   -1],
    ])('orders %o against %o as %i', (left, right, expected) => {
        expect(compareDecimal(left, right)).toBe(expected);
    });

    it('is exact across wildly different exponents', () => {

        // Converting to a common scale would overflow a float long before this.
        const tiny  = decimal(1, -9000);
        const huge  = decimal(1, 9000);

        expect(compareDecimal(tiny, huge)).toBe(-1);
        expect(compareDecimal(huge, tiny)).toBe(1);
        expect(compareDecimal(tiny, tiny)).toBe(0);

    });

    it('is a total order over generated values', () => {

        const anyDecimal = fc.tuple(
            fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }),
            fc.integer({ min: -30, max: 30 }),
        ).map(([mantissa, exponent]) => decimal(mantissa, exponent));

        fc.assert(
            fc.property(anyDecimal, anyDecimal, (left, right) => {
                const forwards  = compareDecimal(left, right);
                const backwards = compareDecimal(right, left);
                expect(forwards).toBe(-backwards === 0 ? 0 : -backwards);
            }),
            { numRuns: 2000 },
        );

    });

});


describe('division', () => {

    it('derives the standard uncertainty of a certificate stating k = 2', () => {

        // U = 0.12 V, k = 2, so u = 0.06 V.
        const result = divideDecimal(decimal(12, -2), integer(2), { scale: 3, rounding: 'half-even' });

        expect(formatDecimal(result)).toBe('0.060');

    });

    it('states the scale the caller asked for, not one of its own choosing', () => {

        expect(formatDecimal(divideDecimal(integer(1), integer(3), { scale: 0, rounding: 'half-even' }))).toBe('0');
        expect(formatDecimal(divideDecimal(integer(1), integer(3), { scale: 5, rounding: 'half-even' }))).toBe('0.33333');
        expect(formatDecimal(divideDecimal(integer(2), integer(3), { scale: 5, rounding: 'half-even' }))).toBe('0.66667');

    });

    it.each([
        ['half-even', '0.2'],
        ['half-up',   '0.3'],
        ['truncate',  '0.2'],
    ] as const)('rounds 0.25 with %s to %s', (rounding, expected) => {
        expect(formatDecimal(divideDecimal(decimal(25, -2), integer(1), { scale: 1, rounding }))).toBe(expected);
    });

    it.each([
        ['half-even', '0.4'],
        ['half-up',   '0.4'],
        ['truncate',  '0.3'],
    ] as const)('rounds 0.35 with %s to %s', (rounding, expected) => {
        expect(formatDecimal(divideDecimal(decimal(35, -2), integer(1), { scale: 1, rounding }))).toBe(expected);
    });

    it('rounds a negative quotient away from zero for half-up, and toward it for truncate', () => {

        expect(formatDecimal(divideDecimal(decimal(-25, -2), integer(1), { scale: 1, rounding: 'half-up' }))).toBe('-0.3');
        expect(formatDecimal(divideDecimal(decimal(-25, -2), integer(1), { scale: 1, rounding: 'truncate' }))).toBe('-0.2');

    });

    it('refuses to divide by zero', () => {
        expect(codeOf(() => divideDecimal(integer(1), integer(0), { scale: 2, rounding: 'half-even' })))
            .toBe('ERR_VALUE_INEXACT');
    });

    it('refuses a scale beyond what it will reconstruct', () => {
        expect(codeOf(() => divideDecimal(integer(1), integer(2), { scale: MAX_DECIMAL_EXPONENT + 1, rounding: 'half-even' })))
            .toBe('ERR_VALUE_EXPONENT_RANGE');
    });

});


describe('limits', () => {

    // Specification Section 7: a decoder must bound the resources it spends
    // reconstructing a value, rather than discover the bound by exhausting them.
    it('refuses an exponent beyond the supported range', () => {

        expect(() => decimal(1, MAX_DECIMAL_EXPONENT)).not.toThrow();
        expect(codeOf(() => decimal(1, MAX_DECIMAL_EXPONENT + 1))).toBe('ERR_VALUE_EXPONENT_RANGE');
        expect(codeOf(() => decimal(1, -MAX_DECIMAL_EXPONENT - 1))).toBe('ERR_VALUE_EXPONENT_RANGE');

    });

    it('refuses a non-integer exponent', () => {
        expect(codeOf(() => decimal(1, 1.5))).toBe('ERR_VALUE_EXPONENT_RANGE');
        expect(codeOf(() => decimal(1, Number.NaN))).toBe('ERR_VALUE_EXPONENT_RANGE');
    });

    it('refuses a mantissa beyond the supported digits', () => {

        const atLimit = 10n ** BigInt(MAX_MANTISSA_DIGITS - 1);
        const beyond  = 10n ** BigInt(MAX_MANTISSA_DIGITS);

        expect(() => decimal(atLimit, 0)).not.toThrow();
        expect(codeOf(() => decimal(beyond, 0))).toBe('ERR_VALUE_MANTISSA_RANGE');
        expect(codeOf(() => integer(beyond))).toBe('ERR_VALUE_MANTISSA_RANGE');

    });

    it('accepts a mantissa far larger than a double could hold', () => {

        const huge = 123456789012345678901234567890n;

        expect(mantissaOf(integer(huge))).toBe(huge);
        expect(formatDecimal(decimal(huge, -10))).toBe('12345678901234567890.1234567890');

    });

});
