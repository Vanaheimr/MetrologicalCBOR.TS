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
 * What the codec refuses, and with which code.
 *
 * Every entry here is a MUST of the specification. Rejection is the specified
 * behaviour, not defensive programming: a reading silently attributed to the
 * wrong unit, or rounded into a resolution the instrument never reported, is
 * worse than a decoding failure.
 *
 * The encodings are written as hexadecimal so that what is being rejected is
 * visible in the test rather than assembled by it.
 */

import { describe, expect, it } from 'vitest';

import { bytesToHex, hexToBytes } from '../../src/cbor/hex.js';
import { decodeMetrologicalValue, encodeMetrologicalValue } from '../../src/codec/index.js';
import { codeOf }               from '../support/errors.js';


/** Rejects in both modes: these are errors, not spellings. */
const ALWAYS: readonly (readonly [hex: string, code: string, why: string])[] = [

    // -- Section 3: the arity of the content ---------------------------------
    ['D9ACDC80',                   'ERR_ARITY',          'an empty content array'],
    ['D9ACDC8105',                 'ERR_ARITY',          'one item, so no unit'],
    ['D9ACDC8505040000 00'.replace(/\s/g, ''), 'ERR_ARITY', 'five items'],
    ['D9ACDC05',                   'ERR_ARITY',          'content that is not an array'],

    // -- Section 3.1: the reading --------------------------------------------
    ['D9ACDC82F93C0004',           'ERR_VALUE_FLOAT',    'a half-precision reading'],
    ['D9ACDC82FB3FF199999999999A04', 'ERR_VALUE_FLOAT',  'a double-precision reading'],
    ['D9ACDC82C5822003 04',        'ERR_VALUE_BIGFLOAT', 'a bigfloat reading'],
    ['D9ACDC826161 04',            'ERR_VALUE_TYPE',     'a text reading'],
    ['D9ACDC82F604',               'ERR_VALUE_TYPE',     'a null reading'],
    ['D9ACDC82C481200 4'.replace(/\s/g, ''), 'ERR_VALUE_TYPE', 'a decimal fraction that is not a pair'],
    ['D9ACDC82C48261610504',       'ERR_VALUE_TYPE',     'a decimal fraction with a text exponent'],
    ['D9ACDC82C48220616104',       'ERR_VALUE_TYPE',     'a decimal fraction with a text mantissa'],
    ['D9ACDC82C4821927110504',     'ERR_VALUE_EXPONENT_RANGE', 'a decimal exponent past the supported 10 000'],

    // -- Section 3.2: the unit -----------------------------------------------
    ['D9ACDC820500',               'ERR_UNIT_ID_RESERVED', 'the reserved identification 0'],
    ['D9ACDC820519FFFF',           'ERR_UNIT_UNKNOWN',   'an unregistered identification'],
    ['D9ACDC8205182D',             'ERR_UNIT_UNKNOWN',   'an identification inside a reserved range'],
    ['D9ACDC82051A00011170',       'ERR_UNIT_ID_OUT_OF_RANGE', 'an identification above 65535'],
    ['D9ACDC820566706172736563',   'ERR_UNIT_UNKNOWN',   'an unknown symbol'],
    ['D9ACDC8205F5',               'ERR_VALUE_TYPE',     'a unit that is a boolean'],
    ['D9ACDC820580',               'ERR_UNIT_PRODUCT_EMPTY', 'a product with no factors'],
    ['D9ACDC820581810F',           'ERR_VALUE_TYPE',     'a factor of one element, so no exponent'],
    ['D9ACDC820581820F820003',     'ERR_UNIT_EXPONENT_ZERO', 'a rational exponent with a zero numerator'],
    ['D9ACDC820581820F820100',     'ERR_UNIT_EXPONENT_DENOMINATOR', 'a rational exponent with a zero denominator'],
    ['D9ACDC820581820F820120',     'ERR_UNIT_EXPONENT_DENOMINATOR', 'a rational exponent with a negative denominator'],
    ['D9ACDC820581820F6161',       'ERR_VALUE_TYPE',     'an exponent that is neither an integer nor a rational'],
    ['D9ACDC820581820F83010203',   'ERR_VALUE_TYPE',     'a rational exponent of three parts'],
    ['D9ACDC820581820F82616102',   'ERR_VALUE_TYPE',     'a rational exponent with a text numerator'],
    ['D9ACDC820581820F1B0020000000000000', 'ERR_UNIT_EXPONENT_DENOMINATOR', 'an exponent past what a number holds exactly'],

    // -- Section 3.3: the prefix ---------------------------------------------
    ['D9ACDC83050404',             'ERR_PREFIX_INVALID', 'the prefix 4, which is not an SI prefix'],
    ['D9ACDC83050423',             'ERR_PREFIX_INVALID', 'the prefix -4'],
    ['D9ACDC830504181F',           'ERR_PREFIX_INVALID', 'the prefix 31'],
    ['D9ACDC8305046161',           'ERR_PREFIX_INVALID', 'a prefix that is not an integer'],
    ['D9ACDC8305041B0020000000000000', 'ERR_PREFIX_INVALID', 'a prefix past what a number holds exactly'],

    // -- Section 3.4: the uncertainty ----------------------------------------
    ['D9ACDC840504002 0'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_NEGATIVE', 'a negative uncertainty'],
    ['D9ACDC8405040 0A0'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_NO_MAGNITUDE', 'an uncertainty map with no magnitude'],
    ['D9ACDC840504 00A2010102 00'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_COVERAGE_FACTOR', 'a coverage factor of zero'],
    ['D9ACDC840504 00A2010103 00'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_PROBABILITY', 'a coverage probability of zero'],
    ['D9ACDC840504 00A2010103 02'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_PROBABILITY', 'a coverage probability above one'],
    ['D9ACDC840504 00A2010104 00'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_DISTRIBUTION', 'the distribution 0, which means not stated'],
    ['D9ACDC840504 00A2010104 06'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_DISTRIBUTION', 'an unknown distribution'],
    ['D9ACDC840504 00A2010104 6161'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_DISTRIBUTION', 'a distribution written as a symbol'],
    ['D9ACDC840504 00A2010104 1B0020000000000000'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_DISTRIBUTION', 'a distribution past what a number holds exactly'],
    ['D9ACDC840504 00A2010105 00'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_DEGREES_OF_FREEDOM', 'degrees of freedom of zero'],
    ['D9ACDC840504 00A2010106 01'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_UNKNOWN_KEY', 'a key the specification does not define'],
    ['D9ACDC840504 00A2010161610 1'.replace(/\s/g, ''), 'ERR_UNCERTAINTY_UNKNOWN_KEY', 'a key that is not an integer'],
    ['D9ACDC840504 00A101F93C00'.replace(/\s/g, ''), 'ERR_VALUE_FLOAT', 'an uncertainty magnitude that is a float'],

    // -- The tag itself -------------------------------------------------------
    ['D8FF820504',                 'ERR_TAG_MISMATCH',   'the wrong tag'],
    ['820504',                     'ERR_TAG_MISMATCH',   'no tag at all'],

] as const;


describe('rejections that hold in both modes', () => {

    it.each(ALWAYS)('%s is rejected as %s (%s)', (hex, code) => {
        expect(codeOf(() => decodeMetrologicalValue(hexToBytes(hex)))).toBe(code);
    });

    it.each(ALWAYS)('%s is rejected as %s in lenient mode too', (hex, code) => {
        expect(codeOf(() => decodeMetrologicalValue(hexToBytes(hex), { strict: false }))).toBe(code);
    });

});


describe('spellings that strict mode refuses and lenient mode normalises', () => {

    it('rejects a single named unit written as a one-element product', () => {

        // 44252([5, [[5, 1]]]) - the volt, the long way round. An encoder must
        // never write it: a canonical encoding must not have two spellings for
        // the same unit.
        const hex = 'D9ACDC82058182050 1'.replace(/\s/g, '');

        expect(codeOf(() => decodeMetrologicalValue(hexToBytes(hex)))).toBe('ERR_UNIT_SINGLE_AS_PRODUCT');

        // Lenient mode takes it as the named unit it denotes.
        const lenient = decodeMetrologicalValue(hexToBytes(hex), { strict: false });

        expect(lenient.unit.kind).toBe('named');
        if (lenient.unit.kind === 'named')
            expect(lenient.unit.unit.symbol).toBe('V');

    });

    it('keeps a one-element product whose power is not one', () => {

        // s^-2 has no named form, so this is a genuine product of one factor.
        const value = decodeMetrologicalValue(hexToBytes('D9ACDC820581820821'));

        expect(value.unit.kind).toBe('product');

    });

    it('rejects a prefix of 0 written where it could have been omitted', () => {

        // 44252([5, 4, 0]) says exactly what 44252([5, 4]) says, and Section 6
        // requires the encoding to be a function of the reading alone.
        const hex = 'D9ACDC83050400';

        expect(codeOf(() => decodeMetrologicalValue(hexToBytes(hex)))).toBe('ERR_PREFIX_REDUNDANT');

        const lenient = decodeMetrologicalValue(hexToBytes(hex), { strict: false });

        expect(lenient.prefix).toBe(0);

    });

    it('rejects an uncertainty map that states nothing a bare number could not', () => {

        // 44252([5, 4, 0, {1: 5}]) says exactly what 44252([5, 4, 0, 5]) says,
        // and Section 6 does not allow one uncertainty two encodings.
        const hex = 'D9ACDC84050400A10105';

        expect(codeOf(() => decodeMetrologicalValue(hexToBytes(hex)))).toBe('ERR_UNCERTAINTY_REDUNDANT_MAP');

        const lenient = decodeMetrologicalValue(hexToBytes(hex), { strict: false });

        expect(lenient.uncertainty?.magnitude).toStrictEqual({ kind: 'int', value: 5n });

        // And it is written back the compact way, which is what makes the
        // rejection above a rule about spelling rather than about content.
        expect(bytesToHex(encodeMetrologicalValue(lenient))).toBe('D9ACDC8405040005');

    });

    it('accepts a prefix of 0 where an uncertainty follows it', () => {

        // There the prefix must be written, because the array is positional.
        expect(() => decodeMetrologicalValue(hexToBytes('D9ACDC84050400C4822005'))).not.toThrow();

    });

    it('rejects a rational exponent that is not in lowest terms, and reduces it leniently', () => {

        // [2, 1] is simply 2, and [-2, 4] is [-1, 2]. Section 3.2 requires the
        // reduced form, so neither spelling is one a conforming encoder writes.
        //
        // Found by the fuzz suite, through the identity a signature rests on:
        // strict mode used to accept these and write the reduced form back, so
        // decoding and re-encoding a signed document changed its bytes.
        for (const hex of ['D9ACDC820581820F820201', 'D9ACDC820581820F822104', 'D9ACDC820581820F82140 2'.replace(/\s/g, '')])
            expect(codeOf(() => decodeMetrologicalValue(hexToBytes(hex)))).toBe('ERR_UNIT_EXPONENT_NOT_REDUCED');

        const reducible = decodeMetrologicalValue(hexToBytes('D9ACDC820581820F820201'), { strict: false });
        const unreduced = decodeMetrologicalValue(hexToBytes('D9ACDC820581820F822104'), { strict: false });

        if (reducible.unit.kind !== 'product' || unreduced.unit.kind !== 'product')
            throw new Error('unreachable');

        expect(reducible.unit.factors[0]?.exponent).toStrictEqual({ kind: 'integer', value: 2 });
        expect(unreduced.unit.factors[0]?.exponent).toStrictEqual({ kind: 'rational', numerator: -1, denominator: 2 });

    });

    it('accepts a rational exponent that is already in lowest terms', () => {

        // [-1, 2] is the reduced form, and Section 5 writes V·Hz^-1/2 with it.
        const value = decodeMetrologicalValue(hexToBytes('D9ACDC820581820F822002'));

        if (value.unit.kind !== 'product')
            throw new Error('unreachable');

        expect(value.unit.factors[0]?.exponent).toStrictEqual({ kind: 'rational', numerator: -1, denominator: 2 });
        expect(bytesToHex(encodeMetrologicalValue(value))).toBe('D9ACDC820581820F822002');

    });

});


describe('the CBOR layer underneath', () => {

    it('rejects bytes that are not well-formed at all', () => {
        expect(codeOf(() => decodeMetrologicalValue(hexToBytes('D9ACDC')))).toBe('ERR_CBOR_UNEXPECTED_END');
    });

    it('rejects a non-deterministic encoding in strict mode', () => {

        // The unit identification 4 written in the one-byte form.
        expect(codeOf(() => decodeMetrologicalValue(hexToBytes('D9ACDC8205 1804'.replace(/\s/g, '')))))
            .toBe('ERR_CBOR_NON_PREFERRED');

    });

    it('accepts it in lenient mode, and normalises it on the way out', () => {

        const value = decodeMetrologicalValue(hexToBytes('D9ACDC8205 1804'.replace(/\s/g, '')), { strict: false });

        expect(value.unit.kind).toBe('named');
        if (value.unit.kind === 'named')
            expect(value.unit.unit.symbol).toBe('A');

    });

    it('rejects trailing bytes after the value', () => {
        expect(codeOf(() => decodeMetrologicalValue(hexToBytes('D9ACDC82050400')))).toBe('ERR_CBOR_TRAILING_DATA');
    });

});
