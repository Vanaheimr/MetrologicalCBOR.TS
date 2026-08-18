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
 * The examples of RFC 8949, Appendix A, for the subset of CBOR this library
 * implements.
 *
 * These are the vectors every CBOR implementation is measured against, and they
 * are external: they were not derived from this code, so they can disprove it.
 * A vector that fails is a defect here, never a vector to be adjusted.
 *
 * Appendix A also contains indefinite-length examples and half-precision edge
 * cases; the indefinite ones are decode-only, because a deterministic encoder
 * has no way to write them, and they are listed separately below.
 */

import { describe, expect, it } from 'vitest';

import { decodeHex, encodeToHex } from '../../src/cbor/index.js';
import { diagnostic }             from '../../src/cbor/diagnostic.js';


/** hex, diagnostic notation. */
type Vector = readonly [hex: string, diagnostic: string];

/**
 * Vectors whose encoding is the deterministic one, so they must survive in
 * both directions: bytes to model to the same bytes.
 */
const ROUND_TRIP: readonly Vector[] = [

    // -- Unsigned integers, and the boundaries of every argument width ------
    ['00',                 '0'],
    ['01',                 '1'],
    ['0A',                 '10'],
    ['17',                 '23'],
    ['1818',               '24'],
    ['1819',               '25'],
    ['1864',               '100'],
    ['1903E8',             '1000'],
    ['1A000F4240',         '1000000'],
    ['1B000000E8D4A51000', '1000000000000'],
    ['1BFFFFFFFFFFFFFFFF', '18446744073709551615'],

    // -- Negative integers ---------------------------------------------------
    ['20',                 '-1'],
    ['29',                 '-10'],
    ['3863',               '-100'],
    ['3903E7',             '-1000'],
    ['3BFFFFFFFFFFFFFFFF', '-18446744073709551616'],

    // -- Bignums, which this library folds into ordinary integers ------------
    ['C249010000000000000000', '18446744073709551616'],
    ['C349010000000000000000', '-18446744073709551617'],

    // -- Floating point, each in the narrowest width that preserves it -------
    ['F90000',             '0.0'],
    ['F98000',             '-0.0'],
    ['F93C00',             '1.0'],
    ['FB3FF199999999999A',  '1.1'],
    ['F93E00',             '1.5'],
    ['F97BFF',             '65504.0'],
    ['FA47C35000',         '100000.0'],
    ['FA7F7FFFFF',         '3.4028234663852886e+38'],
    ['FB7E37E43C8800759C', '1e+300'],
    ['F90001',             '5.960464477539063e-8'],
    ['F90400',             '0.00006103515625'],
    ['F9C400',             '-4.0'],
    ['FBC010666666666666', '-4.1'],
    ['F97C00',             'Infinity'],
    ['F97E00',             'NaN'],
    ['F9FC00',             '-Infinity'],

    // -- Simple values -------------------------------------------------------
    ['F4',                 'false'],
    ['F5',                 'true'],
    ['F6',                 'null'],
    ['F7',                 'undefined'],
    ['F0',                 'simple(16)'],
    ['F8FF',               'simple(255)'],

    // -- Tags ----------------------------------------------------------------
    ['C074323031332D30332D32315432303A30343A30305A', '0("2013-03-21T20:04:00Z")'],
    ['C11A514B67B0',       '1(1363896240)'],
    ['D74401020304',       '23(h\'01020304\')'],
    ['D818456449455446',   '24(h\'6449455446\')'],
    ['D82076687474703A2F2F7777772E6578616D706C652E636F6D', '32("http://www.example.com")'],

    // -- Byte strings --------------------------------------------------------
    ['40',                 'h\'\''],
    ['4401020304',         'h\'01020304\''],

    // -- Text strings --------------------------------------------------------
    ['60',                 '""'],
    ['6161',               '"a"'],
    ['6449455446',         '"IETF"'],
    ['62225C',             '"\\"\\\\"'],
    ['62C3BC',             '"ü"'],
    ['63E6B0B4',           '"水'  + '"'],
    ['64F0908591',         '"\u{10151}"'],

    // -- Arrays --------------------------------------------------------------
    ['80',                 '[]'],
    ['83010203',           '[1, 2, 3]'],
    ['8301820203820405',   '[1, [2, 3], [4, 5]]'],
    ['98190102030405060708090A0B0C0D0E0F101112131415161718181819',
                           '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]'],

    // -- Maps ----------------------------------------------------------------
    ['A0',                 '{}'],
    ['A201020304',         '{1: 2, 3: 4}'],
    ['A26161016162820203', '{"a": 1, "b": [2, 3]}'],
    ['826161A161626163',   '["a", {"b": "c"}]'],
    ['A56161614161626142616361436164614461656145',
                           '{"a": "A", "b": "B", "c": "C", "d": "D", "e": "E"}'],

];


/**
 * Indefinite-length vectors. A deterministic encoder cannot produce them, so
 * they are decoded in lenient mode and compared against the bytes a
 * deterministic encoding of the same model produces.
 *
 * That is not always the definite-length equivalent the RFC lists beside them:
 * where a map's keys are not already sorted, the deterministic encoding sorts
 * them, and the bytes differ. The last vector is exactly that case.
 */
const DECODE_ONLY: readonly (readonly [hex: string, diagnostic: string, definite: string])[] = [

    ['5F42010243030405FF',      'h\'0102030405\'',        '450102030405'],
    ['7F657374726561646D696E67FF', '"streaming"',         '6973747265616D696E67'],
    ['9FFF',                    '[]',                     '80'],
    ['9F018202039F0405FFFF',    '[1, [2, 3], [4, 5]]',    '8301820203820405'],
    ['9F01820203820405FF',      '[1, [2, 3], [4, 5]]',    '8301820203820405'],
    ['83018202039F0405FF',      '[1, [2, 3], [4, 5]]',    '8301820203820405'],
    ['BF61610161629F0203FFFF',  '{"a": 1, "b": [2, 3]}',  'A26161016162820203'],
    // "Amt" (63 41 6D 74) sorts before "Fun" (63 46 75 6E), so the
    // deterministic encoding reverses the order the RFC writes them in.
    ['BF6346756EF563416D7421FF', '{"Fun": true, "Amt": -2}', 'A263416D74216346756EF5'],

];


describe('RFC 8949 Appendix A, deterministic vectors', () => {

    it.each(ROUND_TRIP)('%s decodes as %s', (hex, expected) => {
        expect(diagnostic(decodeHex(hex))).toBe(expected);
    });

    it.each(ROUND_TRIP)('%s re-encodes to itself', hex => {
        expect(encodeToHex(decodeHex(hex))).toBe(hex);
    });

});


describe('RFC 8949 Appendix A, indefinite-length vectors', () => {

    it.each(DECODE_ONLY)('%s decodes as %s in lenient mode', (hex, expected) => {
        expect(diagnostic(decodeHex(hex, { strict: false }))).toBe(expected);
    });

    it.each(DECODE_ONLY)('%s re-encodes with a definite length', (hex, _expected, definite) => {
        expect(encodeToHex(decodeHex(hex, { strict: false }))).toBe(definite);
    });

    it.each(DECODE_ONLY)('%s is rejected in strict mode', hex => {
        expect(() => decodeHex(hex)).toThrow(/indefinite/i);
    });

});


describe('the boundaries of the argument widths', () => {

    // 23 is the largest immediate argument, 24 the smallest one-byte argument,
    // and so on. Getting these wrong is the classic CBOR defect, and it is
    // exactly the boundary the unit registry was designed around.
    it.each([
        [23n,                    '17'],
        [24n,                    '1818'],
        [255n,                   '18FF'],
        [256n,                   '190100'],
        [65535n,                 '19FFFF'],
        [65536n,                 '1A00010000'],
        [4294967295n,            '1AFFFFFFFF'],
        [4294967296n,            '1B0000000100000000'],
        [18446744073709551615n,  '1BFFFFFFFFFFFFFFFF'],
        [18446744073709551616n,  'C249010000000000000000'],
    ])('encodes %s as %s', (value, hex) => {
        expect(encodeToHex({ type: 'int', value })).toBe(hex);
        expect(decodeHex(hex)).toStrictEqual({ type: 'int', value });
    });

    it.each([
        [-1n,                    '20'],
        [-24n,                   '37'],
        [-25n,                   '3818'],
        [-256n,                  '38FF'],
        [-257n,                  '390100'],
        [-18446744073709551616n, '3BFFFFFFFFFFFFFFFF'],
        [-18446744073709551617n, 'C349010000000000000000'],
    ])('encodes %s as %s', (value, hex) => {
        expect(encodeToHex({ type: 'int', value })).toBe(hex);
        expect(decodeHex(hex)).toStrictEqual({ type: 'int', value });
    });

});
