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
 * The encoder produces one encoding of a value and no other.
 *
 * That is the property the whole format rests on: specification Section 6 keeps
 * measurement data suitable for signing precisely because the bytes are a
 * function of the value and nothing else. A second valid spelling would mean a
 * second valid signature over the same reading.
 */

import { describe, expect, it } from 'vitest';

import { CborError }              from '../../src/errors.js';
import { decodeHex, encode, encodeToHex } from '../../src/cbor/index.js';
import { shortestFloatWidth, toHalfBits, fromHalfBits } from '../../src/cbor/writer.js';
import { array, bytes, float, int, map, simple, tag, text } from '../../src/cbor/types.js';


describe('map keys', () => {

    it('are sorted by the bytewise order of their encodings, whatever order they were built in', () => {

        const forwards  = map([[int(1), int(0)], [int(2), int(0)], [int(3), int(0)]]);
        const backwards = map([[int(3), int(0)], [int(2), int(0)], [int(1), int(0)]]);

        expect(encodeToHex(forwards)).toBe('A3010002000300');
        expect(encodeToHex(backwards)).toBe(encodeToHex(forwards));

    });

    it('sort by the encoded key, not by the value the key denotes', () => {

        // -1 encodes as 20 and 100 as 1864, so the negative key sorts after the
        // positive one although it is numerically smaller.
        expect(encodeToHex(map([[int(-1), int(0)], [int(100), int(0)]])))
            .toBe('A2' + '186400' + '2000');

    });

    it('sort a shorter encoding before a longer one that shares its prefix', () => {

        // "a" is 6161, "aa" is 626161. The heads differ first.
        expect(encodeToHex(map([[text('aa'), int(0)], [text('a'), int(0)]])))
            .toBe('A2' + '616100' + '6261 6100'.replace(/\s/g, ''));

    });

    it('reject a duplicate rather than silently dropping an entry', () => {

        // Dropping one of them would change what the document says without
        // saying so, which is the failure mode Section 7 is about.
        expect(() => encode(map([[int(1), int(1)], [int(1), int(2)]])))
            .toThrow(CborError);

        expect(() => encode(map([[text('a'), int(1)], [text('a'), int(1)]])))
            .toThrow(/same key twice/);

    });

});


describe('integers', () => {

    it('use a basic integer wherever the magnitude fits, and a bignum only beyond', () => {

        expect(encodeToHex(int(18446744073709551615n))).toBe('1BFFFFFFFFFFFFFFFF');
        expect(encodeToHex(int(18446744073709551616n))).toBe('C249010000000000000000');
        expect(encodeToHex(int(-18446744073709551616n))).toBe('3BFFFFFFFFFFFFFFFF');
        expect(encodeToHex(int(-18446744073709551617n))).toBe('C349010000000000000000');

    });

    it('write a bignum without a leading zero byte', () => {

        // 2^64 needs nine bytes; a naive implementation pads to ten.
        expect(encodeToHex(int(1n << 64n))).toBe('C249010000000000000000');
        expect(encodeToHex(int(1n << 71n))).toBe('C249800000000000000000');

    });

    it('survive a mantissa far larger than a double could hold', () => {

        // A decimal fraction may carry a bignum mantissa, and this is the point
        // at which a float-based implementation starts lying.
        const huge = 123456789012345678901234567890n;

        expect(decodeHex(encodeToHex(int(huge)))).toStrictEqual({ type: 'int', value: huge });
        expect(decodeHex(encodeToHex(int(-huge)))).toStrictEqual({ type: 'int', value: -huge });

    });

});


describe('floating point', () => {

    it.each([
        [0,                       2],
        [-0,                      2],
        [1,                       2],
        [1.5,                     2],
        [65504,                   2],
        [6.103515625e-5,          2],
        [5.960464477539063e-8,    2],
        [Infinity,                2],
        [-Infinity,               2],
        [Number.NaN,              2],
        [100000,                  4],
        [3.4028234663852886e38,   4],
        [1.1,                     8],
        [1e300,                   8],
        [Number.MAX_SAFE_INTEGER, 8],
    ])('writes %p in %i bytes', (value, width) => {
        expect(shortestFloatWidth(value)).toBe(width);
    });

    it('keeps the sign of a negative zero', () => {

        expect(encodeToHex(float(-0))).toBe('F98000');
        expect(encodeToHex(float(0))).toBe('F90000');
        expect(Object.is(fromHalfBits(0x8000), -0)).toBe(true);

    });

    it('writes the canonical quiet NaN', () => {
        expect(encodeToHex(float(Number.NaN))).toBe('F97E00');
    });

    it('round-trips every half-precision pattern that is not a NaN', () => {

        for (let bits = 0; bits <= 0xFFFF; bits++) {

            const value = fromHalfBits(bits);
            if (Number.isNaN(value))
                continue;

            // Several patterns denote the same value only for NaN; every other
            // pattern must be recovered exactly.
            expect(toHalfBits(value), `pattern 0x${bits.toString(16)}`).toBe(bits);

        }

    });

    it('preserves the recorded width where the caller asks for it', () => {

        // A double holding a value a half could carry: deterministic encoding
        // narrows it, preserve mode does not.
        expect(encodeToHex(float(1, 8)))                              .toBe('F93C00');
        expect(encodeToHex(float(1, 8), { floats: 'preserve' }))      .toBe('FB3FF0000000000000');

        // Reading it back needs lenient mode: strict mode requires the
        // shortest width, so those bytes are not a deterministic encoding.
        expect(decodeHex('FB3FF0000000000000', { strict: false })).toStrictEqual(float(1, 8));

    });

});


describe('unencodable values', () => {

    it.each([
        [20,  'false has a representation of its own'],
        [23,  'undefined has a representation of its own'],
        [24,  'the range 24..31 is not assignable'],
        [31,  'the range 24..31 is not assignable'],
        [256, 'a simple value is one byte'],
        [-1,  'a simple value is not negative'],
    ])('reject the simple value %i (%s)', value => {
        expect(() => encode(simple(value))).toThrow(CborError);
    });

    it('accept the simple values that do have a representation', () => {
        expect(encodeToHex(simple(0))).toBe('E0');
        expect(encodeToHex(simple(19))).toBe('F3');
        expect(encodeToHex(simple(32))).toBe('F820');
        expect(encodeToHex(simple(255))).toBe('F8FF');
    });

    it('reject a tag number outside the range of an argument', () => {
        expect(() => encode(tag(1n << 64n, int(0)))).toThrow(CborError);
    });

    it('reject a hand-built bignum tag, which the model represents as an integer', () => {

        // The decoder folds tags 2 and 3 into an integer, so this shape is one
        // no decoded document ever has. Encoding it would produce bytes that
        // decode to something else, which is worse than refusing it.
        expect(() => encode(tag(2, bytes(new Uint8Array([1]))))).toThrow(/int\(\) instead/);
        expect(() => encode(tag(3, bytes(new Uint8Array([1]))))).toThrow(CborError);

        // A tag 2 that does not hold a byte string is not a bignum at all, and
        // stays a plain tag.
        expect(encodeToHex(tag(2, int(1)))).toBe('C201');

    });

});


describe('the shape of the metrological value', () => {

    // The examples of specification Section 5, encoded from the model. The
    // codec that builds this model is WP4; this only shows the core reproduces
    // the bytes once something hands it the right structure.
    it.each([
        ['5 A',      'D9ACDC820504',           tag(44252, array([int(5), int(4)]))],
        ['230 V',    'D9ACDC8218E605',         tag(44252, array([int(230), int(5)]))],
        ['5.0 mA',   'D9ACDC83C482201832 0422'.replace(/\s/g, ''),
                     tag(44252, array([tag(4, array([int(-1), int(50)])), int(4), int(-3)]))],
        ['1.10 kWh', 'D9ACDC83C48221186E0203',
                     tag(44252, array([tag(4, array([int(-2), int(110)])), int(2), int(3)]))],
    ])('encodes %s as %s', (_reading, hex, value) => {
        expect(encodeToHex(value)).toBe(hex);
        expect(decodeHex(hex)).toStrictEqual(value);
    });

    it('encodes a GUM uncertainty map with its keys in order', () => {

        // (230.00 +/- 0.12) V with k = 2, from Section 5.
        const value = tag(44252, array([
            tag(4, array([int(-2), int(23000)])),
            int(5),
            int(0),
            map([[int(1), tag(4, array([int(-2), int(12)]))], [int(2), int(2)]]),
        ]));

        expect(encodeToHex(value)).toBe('D9ACDC84C482211959D80500A201C482210C0202');

    });

});


describe('byte strings and text', () => {

    it('encode the length in the shortest form', () => {

        expect(encodeToHex(bytes(new Uint8Array(0)))).toBe('40');
        expect(encodeToHex(bytes(new Uint8Array(23)))).toBe('57' + '00'.repeat(23));
        expect(encodeToHex(bytes(new Uint8Array(24)))).toBe('5818' + '00'.repeat(24));

    });

    it('count text in UTF-8 bytes rather than in characters', () => {

        // Four characters, ten bytes.
        expect(encodeToHex(text('aü水\u{10151}'))).toBe('6A' + '61C3BCE6B0B4F0908591');

    });

});
