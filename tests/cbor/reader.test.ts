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
 * What the decoder refuses, and why.
 *
 * Specification Section 7 makes rejection the specified behaviour rather than
 * defensive programming: a decoder must bound what it spends on an input, and
 * must reject a value it cannot represent exactly rather than round it
 * silently. Every test here therefore pins an error code, not just a throw.
 */

import { describe, expect, it } from 'vitest';

import { CborError }                              from '../../src/errors.js';
import { decode, decodeFirst, decodeHex, encodeToHex } from '../../src/cbor/index.js';
import { hexToBytes }                             from '../../src/cbor/hex.js';
import type { McborErrorCode }                    from '../../src/errors.js';


function codeOf(action: () => unknown): McborErrorCode | 'no throw' {
    try {
        action();
        return 'no throw';
    }
    catch (error) {
        if (error instanceof CborError)
            return error.code;
        throw error;
    }
}


describe('ill-formed input', () => {

    it.each([
        ['',           'an empty input'],
        ['18',         'a one-byte argument with no byte'],
        ['19FF',       'a two-byte argument with one byte'],
        ['1A0000',     'a four-byte argument with two bytes'],
        ['1B00000000', 'an eight-byte argument with four bytes'],
        ['41',         'a byte string with no content'],
        ['5818',       'a byte string claiming 24 bytes that are not there'],
        ['62C3',       'a text string one byte short'],
        ['8201',       'an array missing its second element'],
        ['A101',       'a map missing its first value'],
        ['C6',         'a tag with no content'],
        ['5F',         'an indefinite byte string with no break'],
    ])('%s is an unexpected end (%s)', hex => {
        expect(codeOf(() => decodeHex(hex, { strict: false }))).toBe('ERR_CBOR_UNEXPECTED_END');
    });

    it.each([
        ['1C', 'the reserved additional information 28'],
        ['1D', 'the reserved additional information 29'],
        ['1E', 'the reserved additional information 30'],
        ['FC', 'the reserved additional information 28 of major type 7'],
        ['FD', 'the reserved additional information 29 of major type 7'],
        ['FE', 'the reserved additional information 30 of major type 7'],
        ['FF', 'a break outside an indefinite-length item'],
        ['F818', 'a simple value below 32 in the one-byte form'],
        ['F81F', 'the reserved simple value 31 in the one-byte form'],
        ['7F4101FF', 'a byte string chunk inside an indefinite text string'],
        ['5F6101FF', 'a text string chunk inside an indefinite byte string'],
        ['5F5FFFFF', 'a nested indefinite chunk'],
    ])('%s is malformed (%s)', hex => {
        expect(codeOf(() => decodeHex(hex, { strict: false }))).toBe('ERR_CBOR_MALFORMED');
    });

    it('rejects text that is not valid UTF-8', () => {
        // C3 starts a two-byte sequence; 28 is not a continuation byte.
        expect(codeOf(() => decodeHex('62C328'))).toBe('ERR_CBOR_INVALID_UTF8');
    });

    it('rejects bytes after a complete item', () => {
        expect(codeOf(() => decodeHex('0000'))).toBe('ERR_CBOR_TRAILING_DATA');
    });

    it('reports how far a complete item reached, where the caller expects several', () => {

        const { value, bytesRead } = decodeFirst(hexToBytes('0001'));

        expect(value).toStrictEqual({ type: 'int', value: 0n });
        expect(bytesRead).toBe(1);

    });

});


describe('strict mode, the deterministic encoding requirements', () => {

    it.each([
        ['1817',   'the immediate form holds 23'],
        ['1900FF',  'the one-byte form holds 255'],
        ['1A0000FFFF', 'the two-byte form holds 65535'],
        ['1B00000000FFFFFFFF', 'the four-byte form holds 4294967295'],
        ['3817',   'the same, negated'],
    ])('%s is not the shortest argument (%s)', hex => {
        expect(codeOf(() => decodeHex(hex))).toBe('ERR_CBOR_NON_PREFERRED');
    });

    it.each([
        ['C24101',                 'a bignum that fits in a basic integer'],
        ['C240',                   'an empty bignum, which is zero'],
        ['C249000100000000000000', 'a bignum with a leading zero byte'],
        ['C34101',                 'a negative bignum that fits in a basic integer'],
        ['FB3FF0000000000000',     'a double holding a value a half preserves'],
        ['FA3F800000',             'a single holding a value a half preserves'],
        ['FB47EFFFFFE0000000',     'a double holding a value a single preserves'],
        ['F97C01',                 'a NaN with a payload other than the canonical one'],
        ['FA7FC00000',             'a NaN written as a single'],
    ])('%s is not the preferred serialisation (%s)', hex => {
        expect(codeOf(() => decodeHex(hex))).toBe('ERR_CBOR_NON_PREFERRED');
    });

    it.each([
        ['5F42010243030405FF', 'an indefinite byte string'],
        ['7F6161FF',           'an indefinite text string'],
        ['9FFF',               'an indefinite array'],
        ['BFFF',               'an indefinite map'],
    ])('%s is an indefinite length (%s)', hex => {
        expect(codeOf(() => decodeHex(hex))).toBe('ERR_CBOR_INDEFINITE_LENGTH');
    });

    it('rejects a map whose keys are not sorted', () => {
        // {2: 0, 1: 0}: the key 2 encodes as 02 and sorts after 01.
        expect(codeOf(() => decodeHex('A20200 0100'))).toBe('ERR_CBOR_UNSORTED_KEYS');
    });

    it('accepts the same map sorted', () => {
        expect(encodeToHex(decodeHex('A201000200'))).toBe('A201000200');
    });

    it('sorts by encoded length before content, so a shorter key comes first', () => {
        // "z" (617A) sorts before "aa" (626161): the head 61 precedes 62.
        expect(encodeToHex(decodeHex('A2617A00626161 00'))).toBe('A2617A00' + '62616100');
    });

    it('lenient mode accepts what strict mode rejects, and normalises it', () => {

        expect(encodeToHex(decodeHex('1817',   { strict: false }))).toBe('17');
        expect(encodeToHex(decodeHex('C24101', { strict: false }))).toBe('01');
        expect(encodeToHex(decodeHex('9FFF',   { strict: false }))).toBe('80');
        expect(encodeToHex(decodeHex('A20200 0100', { strict: false }))).toBe('A201000200');

    });

});


describe('duplicate map keys', () => {

    // RFC 8949, Section 5.6. A repeated key is not a spelling difference but an
    // ambiguity about what the data says, so it is rejected in both modes.
    it.each([true, false])('are rejected with strict = %s', strict => {
        expect(codeOf(() => decodeHex('A201000100', { strict }))).toBe('ERR_CBOR_DUPLICATE_KEY');
    });

    it('do not confuse two different keys for one', () => {
        expect(() => decodeHex('A201000200')).not.toThrow();
    });

    it('are detected across different spellings of the same key', () => {
        // {1: 0, 1: 0} with the second key written in the non-preferred
        // one-byte form. Lenient mode accepts the spelling but not the repeat.
        expect(codeOf(() => decodeHex('A20100180100', { strict: false }))).toBe('ERR_CBOR_DUPLICATE_KEY');
    });

    it('are detected in an indefinite-length map', () => {
        expect(codeOf(() => decodeHex('BF01000100FF', { strict: false }))).toBe('ERR_CBOR_DUPLICATE_KEY');
    });

});


describe('limits', () => {

    it('bound nesting depth', () => {

        // 40 nested single-element arrays.
        const nested = '81'.repeat(40) + '00';

        expect(codeOf(() => decodeHex(nested, { limits: { maxDepth: 8 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(() => decodeHex(nested, { limits: { maxDepth: 64 } })).not.toThrow();

    });

    it('bound the total number of data items', () => {
        expect(codeOf(() => decodeHex('83010203', { limits: { maxItems: 2 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
    });

    it('bound the length of a bignum', () => {

        const long = 'C2' + '58' + '30' + '01'.repeat(48);

        expect(codeOf(() => decodeHex(long, { limits: { maxBignumBytes: 16 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(() => decodeHex(long)).not.toThrow();

    });

    it('reject a claimed length before allocating anything for it', () => {

        // Four gigabytes claimed in five bytes of input. The limit is reached
        // before the remaining-input check, and neither is reached by trying.
        expect(codeOf(() => decodeHex('5AFFFFFFFF'))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(codeOf(() => decodeHex('9AFFFFFFFF'))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(codeOf(() => decodeHex('BAFFFFFFFF'))).toBe('ERR_CBOR_LIMIT_EXCEEDED');

        // Within the limits, but still longer than the input.
        expect(codeOf(() => decodeHex('590100' + '00'.repeat(4)))).toBe('ERR_CBOR_UNEXPECTED_END');

    });

    it('bound array and map counts before reading them', () => {
        expect(codeOf(() => decodeHex('9A00100000', { limits: { maxArrayItems: 10 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(codeOf(() => decodeHex('BA00100000', { limits: { maxMapPairs:  10 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
    });

});


describe('errors', () => {

    it('carry the byte offset the fault was found at', () => {

        try {
            decode(hexToBytes('83010203 FF'.replace(/\s/g, '')));
            expect.unreachable('trailing data must be rejected');
        }
        catch (error) {
            expect(error).toBeInstanceOf(CborError);
            expect((error as CborError).offset).toBe(4);
            expect((error as CborError).message).toContain('at byte 4');
        }

    });

    it('name the clause of the specification or RFC they enforce', () => {

        try {
            decodeHex('9FFF');
            expect.unreachable('an indefinite length must be rejected in strict mode');
        }
        catch (error) {
            expect((error as CborError).clause).toBe('4.2.1');
        }

    });

});
