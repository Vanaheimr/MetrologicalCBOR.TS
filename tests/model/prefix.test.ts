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
 * SI prefixes.
 *
 * The point of the negative tests here is that a prefix is not a general
 * scaling factor: the SI defines 25 specific powers of ten and there is no
 * prefix for ten thousand, so 4 is an error rather than a scale.
 */

import { describe, expect, it } from 'vitest';

import { ValueError }           from '../../src/errors.js';
import {
    SIPrefix, SI_PREFIX_EXPONENTS, assertSIPrefix, isSIPrefix,
    prefixBySymbol, prefixName, prefixSymbol,
} from '../../src/model/prefix.js';

const MICRO_SIGN     = 'µ';
const GREEK_SMALL_MU = 'μ';


describe('the set of prefixes', () => {

    it('has the 25 the specification lists', () => {

        expect(SI_PREFIX_EXPONENTS).toStrictEqual([
            -30, -27, -24, -21, -18, -15, -12, -9, -6, -3, -2, -1,
            0,
            1, 2, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30,
        ]);

        expect(SI_PREFIX_EXPONENTS).toHaveLength(25);

    });

    it('names each of them', () => {
        expect(Object.keys(SIPrefix)).toHaveLength(25);
        expect(Object.values(SIPrefix).sort((a, b) => a - b)).toStrictEqual([...SI_PREFIX_EXPONENTS]);
    });

    it('includes the four added in 2022', () => {

        // CGPM Resolution 3 added ronna, quetta, ronto and quecto.
        expect(SIPrefix.Ronna).toBe(27);
        expect(SIPrefix.Quetta).toBe(30);
        expect(SIPrefix.Ronto).toBe(-27);
        expect(SIPrefix.Quecto).toBe(-30);

    });

});


describe('validation', () => {

    it.each([...SI_PREFIX_EXPONENTS])('accepts %i', exponent => {
        expect(isSIPrefix(exponent)).toBe(true);
        expect(() => { assertSIPrefix(exponent); }).not.toThrow();
    });

    it.each([4, 5, -4, -5, 7, 10, 11, 13, -7, 31, -31, 100])('rejects %i, which is not a prefix', exponent => {

        expect(isSIPrefix(exponent)).toBe(false);

        try {
            assertSIPrefix(exponent);
            expect.unreachable(`${String(exponent)} must not be accepted`);
        }
        catch (error) {
            expect((error as ValueError).code).toBe('ERR_PREFIX_INVALID');
            expect((error as ValueError).clause).toBe('3.3');
        }

    });

    it('rejects a prefix that is not an integer', () => {
        expect(isSIPrefix(1.5)).toBe(false);
        expect(() => { assertSIPrefix(Number.NaN); }).toThrow(ValueError);
    });

    it('explains that a prefix is not a scaling factor', () => {
        expect(() => { assertSIPrefix(4); }).toThrow(/not a general scaling factor/);
    });

});


describe('symbols', () => {

    it.each([
        [SIPrefix.Kilo,  'k'],
        [SIPrefix.Milli, 'm'],
        [SIPrefix.Mega,  'M'],
        [SIPrefix.Nano,  'n'],
        [SIPrefix.Deca,  'da'],
        [SIPrefix.Deci,  'd'],
        [SIPrefix.Centi, 'c'],
        [SIPrefix.Quetta,'Q'],
        [SIPrefix.Quecto,'q'],
    ])('writes %i as %s', (exponent, symbol) => {
        expect(prefixSymbol(exponent)).toBe(symbol);
    });

    it('writes no prefix as the empty string', () => {
        expect(prefixSymbol(SIPrefix.None)).toBe('');
    });

    it('writes micro as the micro sign', () => {
        expect(prefixSymbol(SIPrefix.Micro)).toBe(MICRO_SIGN);
    });

    it('distinguishes milli from mega by case', () => {
        expect(prefixBySymbol('m')).toBe(-3);
        expect(prefixBySymbol('M')).toBe(6);
    });

    it('accepts both spellings of micro', () => {

        // Unlike the ohm, these differ by a compatibility mapping rather than
        // a canonical one, so normalisation alone does not reconcile them.
        expect(MICRO_SIGN.normalize('NFC')).not.toBe(GREEK_SMALL_MU);
        expect(prefixBySymbol(MICRO_SIGN)).toBe(-6);
        expect(prefixBySymbol(GREEK_SMALL_MU)).toBe(-6);

    });

    it('resolves the two-letter deca', () => {
        expect(prefixBySymbol('da')).toBe(1);
    });

    it('does not resolve the empty string, which is no prefix rather than a prefix', () => {
        expect(prefixBySymbol('')).toBeUndefined();
    });

    it.each(['x', 'K', 'M2', 'kilo', 'M ', ' m'])('does not resolve %s', symbol => {
        expect(prefixBySymbol(symbol)).toBeUndefined();
    });

    it('round-trips every prefix through its symbol', () => {

        for (const exponent of SI_PREFIX_EXPONENTS) {
            if (exponent === 0)
                continue;
            expect(prefixBySymbol(prefixSymbol(exponent)), String(exponent)).toBe(exponent);
        }

    });

    it('names each prefix', () => {
        expect(prefixName(3)).toBe('Kilo');
        expect(prefixName(-6)).toBe('Micro');
        expect(prefixName(0)).toBe('None');
        expect(() => prefixName(4)).toThrow(ValueError);
        expect(() => prefixSymbol(4)).toThrow(ValueError);
    });

});
