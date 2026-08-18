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
 * Whole documents between CBOR and JSON.
 *
 * The case that matters is the first one: the meter reading of the
 * specification's worked example, as a plain JSON object a person can read,
 * with the measurement intact and reversible.
 */

import { describe, expect, it } from 'vitest';

import { bytesToHex, hexToBytes } from '../../src/cbor/hex.js';
import { decodeHex }              from '../../src/cbor/reader.js';
import { jsonToMcbor, mcborToJson } from '../../src/json/index.js';
import { fromBase64Url, toBase64Url, toJsonPointer } from '../../src/json/types.js';
import type { JsonPath }          from '../../src/json/types.js';
import { METER_READING_HEX }      from '../vectors/signed-example.js';
import { codeOf }                 from '../support/errors.js';

const PLUS_MINUS = '±';


describe('the meter reading of the worked example', () => {

    const json = mcborToJson(hexToBytes(METER_READING_HEX));

    it('is a plain JSON object', () => {

        expect(json).toStrictEqual({
            meter:       '1ISA0000000042',
            transaction: 'a4f1c9e2',
            context:     'Transaction.Begin',
            time:        '2026-08-15T08:14:00Z',
            energy:      `(1234.567 ${PLUS_MINUS}12.3) kWh, k=2, p=0.95, dist=normal`,
        });

    });

    it('says everything the reading said, in one string', () => {

        // Value, decimal scale, unit, prefix, magnitude, coverage factor,
        // coverage probability and distribution: all of it, readable.
        const energy = (json as Record<string, string>)['energy'] ?? '';

        expect(energy).toContain('1234.567');
        expect(energy).toContain('kWh');
        expect(energy).toContain('k=2');
        expect(energy).toContain('p=0.95');
        expect(energy).toContain('dist=normal');

    });

    it('survives JSON.stringify and JSON.parse', () => {

        const text  = JSON.stringify(json);
        const again = JSON.parse(text) as typeof json;

        expect(again).toStrictEqual(json);

    });

    it('goes back to CBOR, though not to the same bytes', () => {

        // The carrying map was not written in the deterministic order, and the
        // date was a tag rather than a string, so the document that comes back
        // is equivalent rather than identical. The reading inside it is exact.
        const back = mcborToJson(jsonToMcbor(json));

        expect(back).toStrictEqual(json);

    });

});


describe('what round-trips byte for byte', () => {

    // Readings, text, integers within the safe range, booleans, nulls, arrays
    // and text-keyed maps: the profile the conversion promises.
    it.each([
        ['a reading',            'D9ACDC820504'],
        ['a reading with scale', 'D9ACDC83C4822018320422'],
        ['an uncertainty',       'D9ACDC84C482211959D80500A201C482210C0202'],
        ['text',                 '6449455446'],
        ['an integer',           '1903E8'],
        ['a negative integer',   '3903E7'],
        ['true',                 'F5'],
        ['null',                 'F6'],
        ['an array',             '83010203'],
        ['a map',                'A26161016162820203'],
        ['a nested document',    'A26161D9ACDC8205046162820102'],
    ])('%s', (_what, hex) => {

        const json = mcborToJson(hexToBytes(hex));

        expect(bytesToHex(jsonToMcbor(json))).toBe(hex);

    });

    it('keeps the decimal scale of a reading through JSON', () => {

        // The whole point: 1.10 does not become 1.1 on the way through.
        const json = mcborToJson(hexToBytes('D9ACDC83C48221186E0203'));

        expect(json).toBe('1.10 kWh');
        expect(bytesToHex(jsonToMcbor(json))).toBe('D9ACDC83C48221186E0203');

    });

});


describe('the one-way conversions', () => {

    it('writes a byte string as base64url, and says so by not coming back', () => {

        const json = mcborToJson(hexToBytes('4401020304'));

        expect(json).toBe(toBase64Url(new Uint8Array([1, 2, 3, 4])));
        expect(fromBase64Url(json as string)).toStrictEqual(new Uint8Array([1, 2, 3, 4]));

        // On the way back it is a text string, because nothing distinguishes
        // base64url from text that looks like it.
        expect(bytesToHex(jsonToMcbor(json))).not.toBe('4401020304');

    });

    it('writes a byte string as hexadecimal on request', () => {
        expect(mcborToJson(hexToBytes('4401020304'), { bytes: 'hex' })).toBe('01020304');
    });

    it('refuses a byte string where the caller wants none', () => {
        expect(codeOf(() => mcborToJson(hexToBytes('4401020304'), { bytes: 'error' })))
            .toBe('ERR_JSON_UNSUPPORTED');
    });

    it('passes a date through as what it wraps', () => {
        expect(mcborToJson(hexToBytes('C074323031332D30332D32315432303A30343A30305A')))
            .toBe('2013-03-21T20:04:00Z');
        expect(mcborToJson(hexToBytes('C11A514B67B0'))).toBe(1363896240);
    });

});


describe('numbers JSON cannot hold', () => {

    it('refuses an integer beyond the safe range rather than rounding it', () => {

        // 2^63 - 1. A nanosecond timestamp passes 2^53, so this is not an
        // exotic case, and the nearest double is a different number.
        expect(codeOf(() => mcborToJson(hexToBytes('1B7FFFFFFFFFFFFFFF'))))
            .toBe('ERR_JSON_PRECISION');

    });

    it('carries it as digits on request', () => {
        expect(mcborToJson(hexToBytes('1B7FFFFFFFFFFFFFFF'), { bigIntegers: 'string' }))
            .toBe('9223372036854775807');
    });

    it('accepts the boundaries of the safe range', () => {
        expect(mcborToJson(hexToBytes('1B001FFFFFFFFFFFFF'))).toBe(Number.MAX_SAFE_INTEGER);
        expect(mcborToJson(hexToBytes('3B001FFFFFFFFFFFFE'))).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('refuses an infinity or a NaN, which JSON cannot write at all', () => {
        expect(codeOf(() => mcborToJson(hexToBytes('F97C00')))).toBe('ERR_JSON_UNSUPPORTED');
        expect(codeOf(() => mcborToJson(hexToBytes('F97E00')))).toBe('ERR_JSON_UNSUPPORTED');
    });

    it('passes an ordinary float through, and refuses it on request', () => {
        expect(mcborToJson(hexToBytes('FB3FF199999999999A'))).toBe(1.1);
        expect(codeOf(() => mcborToJson(hexToBytes('FB3FF199999999999A'), { floats: 'error' })))
            .toBe('ERR_JSON_UNSUPPORTED');
    });

});


describe('what has no JSON counterpart', () => {

    it('refuses a map key that is not text', () => {
        expect(codeOf(() => mcborToJson(hexToBytes('A201020304')))).toBe('ERR_JSON_KEY');
    });

    it('writes one in diagnostic notation on request', () => {
        expect(mcborToJson(hexToBytes('A201020304'), { mapKeys: 'stringify' }))
            .toStrictEqual({ '1': 2, '3': 4 });
    });

    it('refuses two keys that would become one JSON name', () => {

        // {1: 0, "1": 0} with stringified keys: two distinct CBOR keys, one
        // JSON member. Dropping one would change the document silently.
        expect(codeOf(() => mcborToJson(decodeHex('A2010061310 0'.replace(/\s/g, ''), { strict: false }),
                                        { mapKeys: 'stringify' })))
            .toBe('ERR_JSON_KEY');

    });

    it('refuses undefined and a simple value', () => {
        expect(codeOf(() => mcborToJson(hexToBytes('F7')))).toBe('ERR_JSON_UNSUPPORTED');
        expect(codeOf(() => mcborToJson(hexToBytes('F8FF')))).toBe('ERR_JSON_UNSUPPORTED');
    });

    it('refuses a tag it does not know, rather than dropping it', () => {

        // A tag changes what the data means. Passing the content through
        // without it would change the document without saying so.
        expect(codeOf(() => mcborToJson(hexToBytes('D82076687474703A2F2F7777772E6578616D706C652E636F6D'))))
            .toBe('ERR_JSON_UNSUPPORTED');

    });

    it('lets the caller decide what an unknown tag becomes', () => {

        const json = mcborToJson(hexToBytes('D82076687474703A2F2F7777772E6578616D706C652E636F6D'), {
            onUnknownTag: (tag, value) => ({
                tag: Number(tag),
                value: value.type === 'text' ? value.value : null,
            }),
        });

        expect(json).toStrictEqual({ tag: 32, value: 'http://www.example.com' });

    });

    it('names the path of whatever it refused', () => {

        try {
            mcborToJson(hexToBytes('A16161 82 00 F7'.replace(/\s/g, '')));
            expect.unreachable('undefined must be refused');
        }
        catch (error) {
            expect((error as Error).message).toContain('/a/1');
        }

    });

});


describe('deciding which strings are readings', () => {

    it('reads one back by default', () => {
        expect(bytesToHex(jsonToMcbor('230 V'))).toBe('D9ACDC8218E605');
    });

    it('leaves a string that is not a reading alone', () => {
        expect(bytesToHex(jsonToMcbor('Transaction.Begin'))).toBe('7154 72616E73616374696F6E2E426567696E'.replace(/\s/g, ''));
        expect(bytesToHex(jsonToMcbor('1ISA0000000042'))).toBe('6E31495341303030303030303034 32'.replace(/\s/g, ''));
    });

    it('has the hazard it is documented to have', () => {

        // A free-text field holding "1 h" becomes one hour. The grammar is
        // strict and anchored, so this is narrow, but it is real.
        const reading = jsonToMcbor('1 h');

        expect(bytesToHex(reading)).toBe('D9ACDC820112');

        // Which is what the predicate is for.
        expect(bytesToHex(jsonToMcbor('1 h', { readings: 'none' }))).toBe('63312068');

    });

    it('takes a predicate, so an application with a schema can decide', () => {

        const json = { note: '1 h', energy: '1.10 kWh' };

        const bytes = jsonToMcbor(json, {
            readings: (_text, path) => path[path.length - 1] === 'energy',
        });

        const back = mcborToJson(bytes);

        expect(back).toStrictEqual({ note: '1 h', energy: '1.10 kWh' });
        expect(bytesToHex(bytes)).toContain('D9ACDC');

        // The note stayed text: one tag in the document, not two.
        expect(bytesToHex(bytes).match(/D9ACDC/g)).toHaveLength(1);

    });

    it('fails loudly where a predicate says a string is a reading and it is not', () => {

        // The caller asserted it; not telling them would lose a measurement.
        expect(codeOf(() => jsonToMcbor({ energy: 'not a reading' }, { readings: () => true })))
            .toBe('ERR_TEXT_SYNTAX');

    });

    it('does not try strings that cannot begin a reading', () => {

        // A cheap filter in front of the grammar; the grammar still decides.
        expect(bytesToHex(jsonToMcbor('hello'))).toBe('6568656C6C6F');
        expect(bytesToHex(jsonToMcbor(''))).toBe('60');

    });

});


describe('JSON that is not a document this library wrote', () => {

    it('converts an ordinary object', () => {

        const json = { a: 1, b: [true, null, 'x'], c: { d: -2 } };

        expect(mcborToJson(jsonToMcbor(json))).toStrictEqual(json);

    });

    it('makes a whole number an integer and a fractional one a float', () => {

        expect(bytesToHex(jsonToMcbor(5))).toBe('05');
        expect(bytesToHex(jsonToMcbor(1.5))).toBe('F93E00');

    });

    it('refuses an infinity', () => {
        expect(codeOf(() => jsonToMcbor(Number.POSITIVE_INFINITY))).toBe('ERR_JSON_TYPE');
        expect(codeOf(() => jsonToMcbor(Number.NaN))).toBe('ERR_JSON_TYPE');
    });

});


describe('base64url', () => {

    it('round-trips any byte sequence', () => {

        for (let length = 0; length < 24; length++) {
            const bytes = new Uint8Array(length).map((_, index) => (index * 37 + 11) & 0xFF);
            expect(fromBase64Url(toBase64Url(bytes))).toStrictEqual(bytes);
        }

    });

    it('uses the URL-safe alphabet, without padding', () => {

        const bytes = new Uint8Array([0xFB, 0xFF, 0xBE]);

        expect(toBase64Url(bytes)).toBe('-_--');
        expect(toBase64Url(new Uint8Array([1]))).toBe('AQ');

    });

    it('rejects what is not base64url', () => {
        expect(fromBase64Url('!!!')).toBeUndefined();
        expect(fromBase64Url('A')).toBeUndefined();
    });

});


describe('JSON Pointers', () => {

    it.each<[JsonPath, string]>([
        [[],                    ''],
        [['a'],                 '/a'],
        [['a', 0],              '/a/0'],
        [['a', 'b'],            '/a/b'],
        [['a/b'],               '/a~1b'],
        [['a~b'],               '/a~0b'],
    ])('writes %o as %s', (path, expected) => {
        expect(toJsonPointer(path)).toBe(expected);
    });

});
