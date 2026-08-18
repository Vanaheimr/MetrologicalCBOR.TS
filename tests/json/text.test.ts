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
 * The exact JSON text path: digits as written, in both directions.
 *
 * These are the cases the native tree cannot carry — integers beyond 2^53,
 * decimal fractions with their scale, floats that must keep their point — and
 * the ones the cross-implementation conformance suite holds against the C#
 * reference implementation byte for byte and character for character.
 */

import { describe, expect, it } from 'vitest';

import { bytesToHex, hexToBytes } from '../../src/cbor/hex.js';
import { jsonTextToMcbor, mcborToJsonText } from '../../src/json/text.js';
import { codeOf }                 from '../support/errors.js';

/** JSON text of CBOR bytes given as hex. */
function jsonOf(hex: string): string {
    return mcborToJsonText(hexToBytes(hex));
}

/** Canonical CBOR hex of JSON text. */
function hexOf(json: string): string {
    return bytesToHex(jsonTextToMcbor(json));
}


describe('CBOR to JSON text', () => {

    it('writes integers of any size exactly', () => {
        expect(jsonOf('A1616E1B001FFFFFFFFFFFFF')).toBe('{"n":9007199254740991}');
        expect(jsonOf('A1616E1B0020000000000001')).toBe('{"n":9007199254740993}');
        expect(jsonOf('A1616E1BFFFFFFFFFFFFFFFF')).toBe('{"n":18446744073709551615}');
        expect(jsonOf('A1616EC249010000000000000000')).toBe('{"n":18446744073709551616}');
    });

    it('writes a decimal fraction with its scale', () => {
        expect(jsonOf('A1657072696365C482211907CF')).toBe('{"price":19.99}');
        expect(jsonOf('81C4822000')).toBe('[0.0]');
    });

    it('writes a float with its point, so it reads back as a decimal', () => {
        expect(jsonOf('81F93C00')).toBe('[1.0]');
        expect(jsonOf('81F93E00')).toBe('[1.5]');
    });

    it('writes a reading as one string', () => {
        expect(jsonOf('D9ACDC820504')).toBe('"5 A"');
        expect(jsonOf('A16165D9ACDC83C48221186E0203')).toBe('{"e":"1.10 kWh"}');
    });

    it('writes tag 1 as the instant it denotes, with millisecond precision', () => {
        expect(jsonOf('A16174C11A693FDAB8')).toBe('{"t":"2025-12-15T09:54:00.000Z"}');
    });

    it('writes tag 0 and the text tags as the strings they wrap', () => {
        expect(jsonOf('A16174C074323032362D30382D31355430383A31343A30305A'))
            .toBe('{"t":"2026-08-15T08:14:00Z"}');
    });

    it('writes a byte string as unpadded base64url', () => {
        expect(jsonOf('A164626C6F6244DEADBEEF')).toBe('{"blob":"3q2-7w"}');
    });

    it('refuses what JSON cannot say', () => {
        expect(codeOf(() => jsonOf('81F97E00'))).toBe('ERR_JSON_UNSUPPORTED');   // NaN
        expect(codeOf(() => jsonOf('81F7'))).toBe('ERR_JSON_UNSUPPORTED');       // undefined
        expect(codeOf(() => jsonOf('A10126'))).toBe('ERR_JSON_KEY');             // integer key
        expect(codeOf(() => jsonOf('A2616101616102'))).toBe('ERR_CBOR_DUPLICATE_KEY');
    });

});


describe('JSON text to CBOR', () => {

    it('reads integers from their digits, however many', () => {
        expect(hexOf('{"n":9007199254740993}')).toBe('A1616E1B0020000000000001');
        expect(hexOf('{"n":18446744073709551615}')).toBe('A1616E1BFFFFFFFFFFFFFFFF');
        expect(hexOf('{"n":18446744073709551616}')).toBe('A1616EC249010000000000000000');
    });

    it('reads a fractional number as an exact decimal fraction, never a float', () => {
        expect(hexOf('{"x":5.0}')).toBe('A16178C482201832');
        expect(hexOf('{"x":1.10}')).toBe('A16178C48221186E');
        expect(hexOf('{"price":19.99}')).toBe('A1657072696365C482211907CF');
    });

    it('reads an exponent that leaves no decimal places as the integer it equals', () => {
        expect(hexOf('{"x":1e2}')).toBe('A16178 1864'.replace(' ', ''));
        expect(hexOf('{"x":5e0}')).toBe('A1617805');
        expect(hexOf('1e100')).toBe(`C2582A${(10n ** 100n).toString(16).toUpperCase().padStart(84, '0')}`);
    });

    it('reads a string that is a reading as tag 44252', () => {
        expect(hexOf('"5 A"')).toBe('D9ACDC820504');
        expect(hexOf('{"e":"1.10 kWh"}')).toBe('A16165D9ACDC83C48221186E0203');
        expect(hexOf('{"s":"about 1 h"}')).toBe('A161736961626F757420312068');
    });

    it('keeps a bare numeric string a string', () => {
        expect(hexOf('{"s":"5"}')).toBe('A161736135');
    });

    it('rejects malformed JSON rather than guessing', () => {
        expect(codeOf(() => hexOf(''))).toBe('ERR_JSON_TYPE');
        expect(codeOf(() => hexOf('{"a":1,}'))).toBe('ERR_JSON_TYPE');
        expect(codeOf(() => hexOf('{"a":1} extra'))).toBe('ERR_JSON_TYPE');
        expect(codeOf(() => hexOf('01'))).toBe('ERR_JSON_TYPE');
    });

});


describe('the exact round trip', () => {

    it.each([
        'A36474696D6574323032362D30382D31355430383A31343A30305A656D657465726E314953413030303030303030343266656E65726779D9ACDC83C48221186E0203',
        'A1616E1B0020000000000001',
        'A1657072696365C482211907CF',
        'A1616EC249010000000000000000',
        '8700201818F5F4F66474657874',
        'D9ACDC820504',
        'A0',
        '80',
    ])('%s survives CBOR → JSON text → CBOR', hex => {
        expect(hexOf(jsonOf(hex))).toBe(hex);
    });

});
