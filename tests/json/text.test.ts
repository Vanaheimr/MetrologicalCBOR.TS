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


/**
 * String escapes, in both directions.
 *
 * Writing them is `JSON.stringify`'s job and correct by construction. *Reading*
 * them is not: this module carries its own JSON reader, because JavaScript's
 * own one rounds 2^53+1 to 2^53 before any library sees a digit — and a
 * hand-written reader means a hand-written unescaper, sixty lines of switch
 * that until now no test had ever executed. It is on the critical path: this is
 * the module the cross-implementation conformance suite runs its JSON suites
 * through.
 */
describe('string escapes', () => {

    describe('are read', () => {

        it.each([
            ['quote',           '"\\""',   '6122'],
            ['backslash',       '"\\\\"',  '615C'],
            ['solidus',         '"\\/"',   '612F'],
            ['backspace',       '"\\b"',   '6108'],
            ['form feed',       '"\\f"',   '610C'],
            ['line feed',       '"\\n"',   '610A'],
            ['carriage return', '"\\r"',   '610D'],
            ['tab',             '"\\t"',   '6109'],
        ])('%s', (_what, json, hex) => {
            expect(hexOf(json)).toBe(hex);
        });

        it('all eight in one string, in the order written', () => {
            expect(hexOf('"\\"\\\\\\/\\b\\f\\n\\r\\t"')).toBe('68225C2F080C0A0D09');
        });

        it('takes the hex digits of a unicode escape in either case', () => {
            expect(hexOf('"\\u0041"')).toBe('6141');
            expect(hexOf('"\\u00e4"')).toBe('62C3A4');
            expect(hexOf('"\\u00E4"')).toBe('62C3A4');
            expect(hexOf('"\\u20AC"')).toBe('63E282AC');
        });

        it('reads an escaped NUL, which is a character and not a terminator', () => {
            // A reader that treats NUL as the end of something loses the rest
            // of the document without saying so.
            expect(hexOf('"\\u0000"')).toBe('6100');
        });

        it('joins a surrogate pair into the one character it denotes', () => {
            // U+1F600 arrives as two escapes and has to leave as four UTF-8
            // bytes, not as two three-byte sequences.
            expect(hexOf('"\\uD83D\\uDE00"')).toBe('64F09F9880');
        });

        it('unescapes map names as well as values', () => {
            expect(hexOf('{"a\\nb":1}')).toBe('A163610A6201');
        });

    });

    describe('are refused where malformed', () => {

        it.each([
            ['a unicode escape with fewer than four digits', '"\\u12"'],
            ['a unicode escape with a non-hexadecimal digit', '"\\uZZZZ"'],
            ['an escape that is not one',                     '"\\x"'],
            ['a backslash at the end of the text',            '"\\'],
            ['a string that never closes',                    '"abc'],
            ['an unescaped newline',                          '"a\nb"'],
        ])('%s', (_what, json) => {
            expect(codeOf(() => hexOf(json))).toBe('ERR_JSON_TYPE');
        });

    });

        it('an unescaped control character', () => {
            // Built rather than written into the table above: a raw U+0001
            // does not survive being typed into a source file.
            expect(codeOf(() => hexOf(`"a${String.fromCharCode(1)}b"`))).toBe('ERR_JSON_TYPE');
        });

    describe('are written', () => {

        it.each([
            ['quote',           '6122', '"\\""'],
            ['backslash',       '615C', '"\\\\"'],
            ['backspace',       '6108', '"\\b"'],
            ['form feed',       '610C', '"\\f"'],
            ['line feed',       '610A', '"\\n"'],
            ['carriage return', '610D', '"\\r"'],
            ['tab',             '6109', '"\\t"'],
            ['U+0001',          '6101', '"\\u0001"'],
            ['NUL',             '6100', '"\\u0000"'],
        ])('%s', (_what, hex, json) => {
            expect(jsonOf(hex)).toBe(json);
        });

        it('leaves the solidus alone, and still reads it escaped', () => {
            // JSON permits "\/" and requires nobody to write it. Writing it
            // plain while accepting both spellings is what every other reader
            // does; the asymmetry is deliberate rather than an oversight.
            expect(jsonOf('612F')).toBe('"/"');
            expect(hexOf('"\\/"')).toBe('612F');
        });

        it('writes characters above ASCII as themselves', () => {
            expect(jsonOf('62C3A4')).toBe('"ä"');
            expect(jsonOf('64F09F9880')).toBe('"😀"');
        });

    });

    describe('survive the round trip', () => {

        it.each([
            '68225C2F080C0A0D09',   // quote, backslash, solidus, BS, FF, LF, CR, tab
            '6100',                 // NUL
            '6101',                 // U+0001
            '64F09F9880',           // an astral character
            'A163610A6201',         // an escape in a map name
        ])('%s', hex => {
            expect(hexOf(jsonOf(hex))).toBe(hex);
        });

    });

    it('refuses a lone surrogate rather than replacing it', () => {

        // RFC 8259 Section 8.2 leaves unpaired surrogates to the implementation
        // and UTF-8 cannot carry one, so there is no rule to follow here — only
        // a choice. This library refuses, because the alternative is to write a
        // character nobody asked for: `TextEncoder` substitutes U+FFFD, and a
        // substitution made on the way out travels under whatever signature is
        // applied next.
        //
        // The refusal comes from the CBOR writer rather than from this reader,
        // so every path that writes text inherits it. The C# reference
        // implementation refuses the same input, and the conformance suite
        // holds the two to it.
        expect(codeOf(() => hexOf('"\uD800"'))).toBe('ERR_CBOR_UNENCODABLE');
        expect(codeOf(() => hexOf('"\uDC00"'))).toBe('ERR_CBOR_UNENCODABLE');

        // A well-formed pair is untouched by the check.
        expect(hexOf('"\uD83D\uDE00"')).toBe('64F09F9880');

    });

});


/**
 * The tag rows of the conversion table.
 *
 * `metrological-text.md` Section 3.1 has a row per tag saying what it becomes
 * in JSON, and this module implements them as one branch each. Coverage found
 * them unexecuted, and a scan of every vector in the conformance project found
 * six of the rows in no vector either — so a normative table had rows that
 * nothing verified anywhere.
 *
 * These are one-way conversions: a UUID becomes a string and comes back a
 * string. What makes them checkable at all is that the specification
 * prescribes the text.
 *
 * Where a row departs from RFC 8949 Section 6.1 — which the specification names
 * as its base, and which is explicitly non-normative advice aimed at lossy
 * display — the test says so, because an implementation following 6.1
 * faithfully would disagree.
 */
describe('the tag rows of the conversion table', () => {

    it('tag 0 passes through as the string it wraps', () => {
        expect(jsonOf('C074323032362D30382D32305430353A30303A30305A'))
            .toBe('"2026-08-20T05:00:00Z"');
    });

    it('tag 1 becomes the instant, not the number', () => {
        // RFC 8949 Section 6.1 would ignore the tag and give 1765792440. A
        // number that used to be a time is a number, and nothing downstream
        // can tell it from a count.
        expect(jsonOf('C11A693FDAB8')).toBe('"2025-12-15T09:54:00.000Z"');
    });

    it('tag 37 becomes a UUID rather than base64', () => {
        // Section 6.1 would ignore the tag and base64url the byte string.
        expect(jsonOf('D82550F81D4FAE7DEC11D0A76500A0C91E6BF6'))
            .toBe('"f81d4fae-7dec-11d0-a765-00a0c91e6bf6"');
    });

    it.each([
        ['tag 32, a URI',       'D820782868747470733A2F2F6578616D706C652E636F6D2F6D657465722F3149534130303030303030303432',
                                '"https://example.com/meter/1ISA0000000042"'],
        ['tag 33, base64url',   'D8216F534756736247385F64323979624751', '"SGVsbG8_d29ybGQ"'],
        ['tag 34, base64',      'D82270534756736247382F643239796247513D', '"SGVsbG8/d29ybGQ="'],
        ['tag 36, MIME',        'D824781C5375626A6563743A2072656164696E670D0A0D0A312E3130206B5768',
                                String.raw`"Subject: reading\r\n\r\n1.10 kWh"`],
    ])('%s carries its text through unchanged', (_what, hex, json) => {
        expect(jsonOf(hex)).toBe(json);
    });

    it('tag 55799 is transparent', () => {
        // It says "these bytes are CBOR", which JSON has no use for — and it
        // is the tag most likely to be at the front of a file, so refusing it
        // would refuse the document rather than a field.
        expect(jsonOf('D9D9F7A1616E01')).toBe('{"n":1}');
    });

    it('a document-level decimal fraction spends its scale', () => {
        // Inside a reading a non-negative exponent is forbidden, so this
        // branch is reachable only by a tag 4 at document level. Section 6.1
        // would give the two-element array the tag wraps.
        expect(jsonOf('C4820005')).toBe('5');
        expect(jsonOf('C4820201')).toBe('100');
    });

    it('refuses a tag this profile does not carry', () => {
        // The sharpest departure in the table: Section 6.1 ignores the tag
        // number and represents the content, so it would quietly yield 1 and
        // lose the fact that the 1 meant something.
        expect(codeOf(() => jsonOf('D903E701'))).toBe('ERR_JSON_UNSUPPORTED');
    });

    it('lets a caller decide what an unknown tag becomes', () => {
        const json = mcborToJsonText(hexToBytes('D903E701'), {
            onUnknownTag: tag => `tag ${tag.toString()}`,
        });
        expect(json).toBe('"tag 999"');
    });

});


/**
 * The two rows of the table that are options rather than defaults.
 *
 * Section 3.1 says a byte string becomes "Base64URL (default), Base64 or
 * lowercase hex", and that a non-text map key "is an error unless
 * stringification is asked for". Both alternatives belong to the table and
 * neither had ever been executed. The conformance suite does not reach them
 * either, and correctly so: it compares what the two implementations do with
 * no options at all, which is the only thing two libraries can be held to.
 */
describe('the conversion options', () => {

    // 0x01 0x02 0x03 0xFB — the last byte is chosen so that the base64url
    // alphabet shows the character it spells differently from base64.
    const BYTES = '4401020 3FB'.replace(/ /g, '');

    it('writes a byte string as unpadded base64url by default', () => {
        // Which is what RFC 8949 §6.1 advises, and one of the few rows where
        // this profile and that advice coincide exactly.
        expect(jsonOf(BYTES)).toBe('"AQID-w"');
    });

    it('writes it as lowercase hex on request', () => {
        expect(mcborToJsonText(hexToBytes(BYTES), { bytes: 'hex' })).toBe('"010203fb"');
    });

    it('refuses it altogether where the caller asked for that', () => {
        expect(codeOf(() => mcborToJsonText(hexToBytes(BYTES), { bytes: 'error' })))
            .toBe('ERR_JSON_UNSUPPORTED');
    });

    it('refuses a non-text map key by default', () => {
        // A JSON member is named by a string, so anything else has to be
        // rendered — and rendering it invents a name the document never had.
        expect(codeOf(() => jsonOf('A10102'))).toBe('ERR_JSON_KEY');
    });

    it('renders a non-text map key in diagnostic notation on request', () => {

        const stringify = (hex: string) =>
            mcborToJsonText(hexToBytes(hex), { mapKeys: 'stringify' });

        expect(stringify('A10102')).toBe(`{"1":2}`);
        expect(stringify('A1F502')).toBe(`{"true":2}`);
        expect(stringify('A1F602')).toBe(`{"null":2}`);
        expect(stringify('A142010202')).toBe(`{"h'0102'":2}`);

    });

    it('still refuses a key that diagnostic notation cannot name either', () => {
        // An array as a key: renderable in principle, and a name nobody could
        // map back to the key it came from.
        expect(codeOf(() => mcborToJsonText(hexToBytes('A18101 02'.replace(/ /g, '')),
                                            { mapKeys: 'stringify' }))).toBe('ERR_JSON_KEY');
    });

});
