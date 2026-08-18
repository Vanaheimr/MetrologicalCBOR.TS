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
 * Unit references: a registered unit, or a product of powers.
 *
 * The rational exponents are not decoration. An amplitude spectral density is
 * stated per root hertz, fracture toughness in `Pa*m^1/2`, and the Warburg
 * impedance in `Ohm*s^-1/2`, so a format that could not express them would be
 * unusable for the instruments that report them.
 */

import { describe, expect, it } from 'vitest';

import { Units }                from '../../src/registry/units.generated.js';
import {
    EXPONENT_ONE, factor, formatExponent, isAffine, isNamedUnit, isUnitProduct,
    sameExponent, sameUnitQuantity, sameUnitRepresentation,
    unitById, unitBySymbol, unitExponent, unitProduct,
} from '../../src/model/unit.js';
import { codeOf }           from '../support/errors.js';



const OHM = 'Ω';


describe('exponents', () => {

    it('keeps a whole power whole', () => {
        expect(unitExponent(2)).toStrictEqual({ kind: 'integer', value: 2 });
        expect(unitExponent(-2)).toStrictEqual({ kind: 'integer', value: -2 });
        expect(unitExponent(0)).toStrictEqual({ kind: 'integer', value: 0 });
    });

    it('reduces a fraction to its lowest terms', () => {

        // The specification requires it, so that [-2, 4] and [-1, 2] are the
        // same exponent rather than two spellings of it.
        expect(unitExponent(-2, 4)).toStrictEqual({ kind: 'rational', numerator: -1, denominator: 2 });
        expect(unitExponent(-1, 2)).toStrictEqual({ kind: 'rational', numerator: -1, denominator: 2 });
        expect(unitExponent(6, 8)).toStrictEqual({ kind: 'rational', numerator: 3, denominator: 4 });

    });

    it('makes a fraction that reduces to a whole number an integer exponent', () => {

        // [2, 1] is simply 2, and so is [4, 2].
        expect(unitExponent(2, 1)).toStrictEqual({ kind: 'integer', value: 2 });
        expect(unitExponent(4, 2)).toStrictEqual({ kind: 'integer', value: 2 });
        expect(unitExponent(-6, 3)).toStrictEqual({ kind: 'integer', value: -2 });

    });

    it('rejects a denominator that is not positive', () => {
        expect(codeOf(() => unitExponent(1, 0))).toBe('ERR_UNIT_EXPONENT_DENOMINATOR');
        expect(codeOf(() => unitExponent(1, -2))).toBe('ERR_UNIT_EXPONENT_DENOMINATOR');
    });

    it('rejects a fractional exponent whose numerator is zero', () => {
        expect(codeOf(() => unitExponent(0, 2))).toBe('ERR_UNIT_EXPONENT_ZERO');
    });

    it('rejects a ratio that is not of integers', () => {
        expect(codeOf(() => unitExponent(1.5))).toBe('ERR_UNIT_EXPONENT_DENOMINATOR');
        expect(codeOf(() => unitExponent(1, 2.5))).toBe('ERR_UNIT_EXPONENT_DENOMINATOR');
    });

    it.each([
        [unitExponent(-2),    '-2'],
        [unitExponent(1),     '1'],
        [unitExponent(-1, 2), '-1/2'],
        [unitExponent(1, 2),  '1/2'],
        [unitExponent(3, 4),  '3/4'],
    ])('writes %o as %s', (exponent, expected) => {
        expect(formatExponent(exponent)).toBe(expected);
    });

    it('compares exponents by what they denote', () => {
        expect(sameExponent(unitExponent(-2, 4), unitExponent(-1, 2))).toBe(true);
        expect(sameExponent(unitExponent(2), unitExponent(2, 1))).toBe(true);
        expect(sameExponent(unitExponent(2), unitExponent(-2))).toBe(false);
        expect(sameExponent(unitExponent(1, 2), unitExponent(2))).toBe(false);
    });

});


describe('named units', () => {

    it('resolves by identification', () => {

        const volt = unitById(Units.Volt);

        expect(volt.unit.symbol).toBe('V');
        expect(volt.written.form).toBe('id');
        expect(isNamedUnit(volt)).toBe(true);
        expect(isUnitProduct(volt)).toBe(false);

    });

    it('resolves by symbol, and remembers the spelling used', () => {

        const named = unitBySymbol('Ohm');

        expect(named.unit.id).toBe(Units.Ohm);
        expect(named.unit.symbol).toBe(OHM);
        // The alias survives, so that a document re-serialises as it arrived.
        expect(named.written).toStrictEqual({ form: 'symbol', spelling: 'Ohm' });

    });

    it('rejects an unknown unit rather than guessing', () => {
        expect(codeOf(() => unitById(45))).toBe('ERR_UNIT_UNKNOWN');
        expect(codeOf(() => unitById(0))).toBe('ERR_UNIT_ID_RESERVED');
        expect(codeOf(() => unitBySymbol('parsec'))).toBe('ERR_UNIT_UNKNOWN');
    });

    it('recognises the degree Celsius as an interval scale', () => {
        expect(isAffine(unitById(Units.DegreeCelsius))).toBe(true);
        expect(isAffine(unitById(Units.Kelvin))).toBe(false);
        expect(isAffine(unitById(Units.Volt))).toBe(false);
    });

});


describe('products of powers', () => {

    it('expresses an acceleration', () => {

        // m*s^-2, which the specification writes as [[15, 1], [8, -2]].
        const product = unitProduct([
            factor(unitById(Units.Meter)),
            factor(unitById(Units.Second), unitExponent(-2)),
        ]);

        expect(product.factors).toHaveLength(2);
        expect(product.factors[0]?.unit.unit.symbol).toBe('m');
        expect(formatExponent(product.factors[1]?.exponent ?? EXPONENT_ONE)).toBe('-2');
        expect(isUnitProduct(product)).toBe(true);

    });

    it('expresses an amplitude spectral density with a rational power', () => {

        // V*Hz^-1/2 - the reason rational exponents exist at all.
        const product = unitProduct([
            factor(unitById(Units.Volt)),
            factor(unitById(Units.Hertz), unitExponent(-1, 2)),
        ]);

        expect(formatExponent(product.factors[1]?.exponent ?? EXPONENT_ONE)).toBe('-1/2');

    });

    it('rejects a product with no factors', () => {
        expect(codeOf(() => unitProduct([]))).toBe('ERR_UNIT_PRODUCT_EMPTY');
    });

    it('rejects a single unit to the first power, which is a named unit', () => {

        // An encoder must never write the one-element array: a canonical
        // encoding must not have two spellings for the same unit.
        expect(codeOf(() => unitProduct([factor(unitById(Units.Volt))])))
            .toBe('ERR_UNIT_SINGLE_AS_PRODUCT');

    });

    it('accepts a single unit raised to any other power', () => {

        // s^-2 is genuinely a product of one factor and has no named form.
        expect(() => unitProduct([factor(unitById(Units.Second), unitExponent(-2))])).not.toThrow();
        expect(() => unitProduct([factor(unitById(Units.Second), unitExponent(-1, 2))])).not.toThrow();

    });

    it('is affine if any factor is', () => {

        const product = unitProduct([
            factor(unitById(Units.DegreeCelsius)),
            factor(unitById(Units.Second), unitExponent(-1)),
        ]);

        expect(isAffine(product)).toBe(true);

    });

});


describe('comparison', () => {

    const metre       = unitById(Units.Meter);
    const metreSymbol = unitBySymbol('m');
    const second      = unitById(Units.Second);

    it('distinguishes spellings when comparing representations', () => {

        expect(sameUnitRepresentation(metre, metre)).toBe(true);
        expect(sameUnitRepresentation(metre, metreSymbol)).toBe(false);
        expect(sameUnitRepresentation(metreSymbol, unitBySymbol('Metre'))).toBe(false);
        expect(sameUnitRepresentation(metreSymbol, unitBySymbol('m'))).toBe(true);

    });

    it('ignores spellings when comparing quantities', () => {

        expect(sameUnitQuantity(metre, metreSymbol)).toBe(true);
        expect(sameUnitQuantity(metre, unitBySymbol('Metre'))).toBe(true);
        expect(sameUnitQuantity(metre, second)).toBe(false);

    });

    it('treats a product as an ordered list for representation', () => {

        const forwards  = unitProduct([factor(metre), factor(second, unitExponent(-2))]);
        const backwards = unitProduct([factor(second, unitExponent(-2)), factor(metre)]);

        expect(sameUnitRepresentation(forwards, backwards)).toBe(false);

    });

    it('treats a product as a multiset for quantity', () => {

        const forwards  = unitProduct([factor(metre), factor(second, unitExponent(-2))]);
        const backwards = unitProduct([factor(second, unitExponent(-2)), factor(metre)]);

        expect(sameUnitQuantity(forwards, backwards)).toBe(true);

    });

    it('does not convert between units, because the registry carries no factors', () => {

        // The watt hour and the joule measure the same kind of quantity, and
        // are not the same unit. Whether they may be exchanged is a question
        // about the quantity, not about the unit.
        expect(sameUnitQuantity(unitById(Units.WattHour), unitById(Units.Joule))).toBe(false);

    });

    it('distinguishes a named unit from a product', () => {

        const product = unitProduct([factor(second, unitExponent(-2))]);

        expect(sameUnitRepresentation(second, product)).toBe(false);
        expect(sameUnitQuantity(second, product)).toBe(false);

    });

});
