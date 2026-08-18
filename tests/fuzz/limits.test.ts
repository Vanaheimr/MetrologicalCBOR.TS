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
 * What one input is allowed to cost.
 *
 * Specification Section 7 requires a decoder to bound the resources it spends
 * rather than discover the bound by running out of memory. CBOR makes that
 * necessary rather than merely prudent: a length is a number in the header, so
 * nine bytes can claim eighteen quintillion items, and a decoder that believes
 * the claim before counting the bytes behind it has been told to allocate
 * sixteen exabytes by an attacker who sent nine bytes.
 *
 * The property every test here asserts is the same one: the cost of refusing an
 * input is proportional to the input, not to what the input claims about
 * itself. Each is timed, because "it threw" and "it threw quickly" are
 * different statements and only the second one is a defence.
 */

import { describe, expect, it }  from 'vitest';

import { DEFAULT_LIMITS }        from '../../src/cbor/limits.js';
import { decodeHex }             from '../../src/cbor/index.js';
import { decodeMetrologicalValue } from '../../src/codec/index.js';
import { hexToBytes }            from '../../src/cbor/hex.js';
import { codeOf }                from '../support/errors.js';


/** How long an action took, in milliseconds. */
function milliseconds(action: () => unknown): number {
    const started = process.hrtime.bigint();
    try { action(); } catch { /* the outcome is asserted separately */ }
    return Number(process.hrtime.bigint() - started) / 1_000_000;
}


/**
 * The budget a refusal has to fit in.
 *
 * Generous by two orders of magnitude — every one of these refusals is measured
 * in tenths of a millisecond — because the number that matters is not how fast
 * it is but that it does not depend on the claimed size. A decoder that
 * allocated what these headers ask for would not be slow, it would be gone.
 */
const BUDGET_MS = 250;


describe('a length that nothing backs', () => {

    // Nine bytes each. What follows the header is nothing at all.
    it.each([
        ['5BFFFFFFFFFFFFFFFF', 'a byte string of 2^64-1 bytes'],
        ['7BFFFFFFFFFFFFFFFF', 'a text string of 2^64-1 bytes'],
        ['9BFFFFFFFFFFFFFFFF', 'an array of 2^64-1 items'],
        ['BBFFFFFFFFFFFFFFFF', 'a map of 2^64-1 pairs'],
        ['5A7FFFFFFF',         'a byte string of 2^31-1 bytes'],
        ['9A7FFFFFFF',         'an array of 2^31-1 items'],
        ['BA7FFFFFFF',         'a map of 2^31-1 pairs'],
        ['C25BFFFFFFFFFFFFFFFF', 'a bignum of 2^64-1 bytes'],
        ['D9ACDC9BFFFFFFFFFFFFFFFF', 'a reading whose content array claims 2^64-1 items'],
    ])('%s (%s) is refused, and refused cheaply', hex => {

        expect(codeOf(() => decodeHex(hex))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(milliseconds(() => decodeHex(hex))).toBeLessThan(BUDGET_MS);

    });

    it('is refused before the bytes behind it are counted', () => {

        // The distinction the whole section rests on. Both inputs claim more
        // than the limit allows; one is nine bytes and the other is nine
        // bytes. Neither may cost what it claims.
        const claimed = 0xFFFF_FFFF_FFFF_FFFFn;

        expect(claimed).toBeGreaterThan(BigInt(DEFAULT_LIMITS.maxStringBytes));
        expect(hexToBytes('5BFFFFFFFFFFFFFFFF').length).toBe(9);

    });

});


describe('each limit, against an input that just exceeds it', () => {

    it('bounds the nesting depth', () => {

        // 65 nested one-element arrays, against a limit of 64.
        const tooDeep = '81'.repeat(DEFAULT_LIMITS.maxDepth + 1) + '00';

        expect(codeOf(() => decodeHex(tooDeep))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(milliseconds(() => decodeHex(tooDeep))).toBeLessThan(BUDGET_MS);

        // And accepts one less, so the limit is where it says it is.
        expect(codeOf(() => decodeHex('81'.repeat(DEFAULT_LIMITS.maxDepth - 1) + '00'))).toBe('no throw');

    });

    it('bounds the number of items', () => {

        // An array of eleven, against a stated limit of ten. Counted across
        // the whole document rather than per container, which is what stops a
        // wide-and-shallow document from evading a depth limit.
        const eleven = '8B' + '00'.repeat(11);

        expect(codeOf(() => decodeHex(eleven, { limits: { maxItems: 10 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(codeOf(() => decodeHex(eleven))).toBe('no throw');

    });

    it('bounds the length of a string', () => {

        const eleven = '4B' + 'AA'.repeat(11);

        expect(codeOf(() => decodeHex(eleven, { limits: { maxStringBytes: 10 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(codeOf(() => decodeHex(eleven))).toBe('no throw');

    });

    it('bounds the width of an array', () => {

        const eleven = '8B' + '00'.repeat(11);

        expect(codeOf(() => decodeHex(eleven, { limits: { maxArrayItems: 10 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');

    });

    it('bounds the width of a map', () => {

        // Eleven pairs, keyed 0..10 so that the deterministic ordering holds.
        const pairs  = Array.from({ length: 11 }, (_, index) => (index < 10 ? `0${index}` : '0A') + '00').join('');
        const eleven = 'AB' + pairs;

        expect(codeOf(() => decodeHex(eleven, { limits: { maxMapPairs: 10 } }))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(codeOf(() => decodeHex(eleven))).toBe('no throw');

    });

    it('bounds the size of a bignum mantissa', () => {

        // 129 bytes of mantissa, against a limit of 128. A 1024-bit integer is
        // already far past any reading an instrument reports.
        const tooBig = 'C2' + '58' + '81' + 'FF'.repeat(129);

        expect(codeOf(() => decodeHex(tooBig))).toBe('ERR_CBOR_LIMIT_EXCEEDED');
        expect(milliseconds(() => decodeHex(tooBig))).toBeLessThan(BUDGET_MS);

        // 128 is accepted, so again the limit is where it says it is.
        expect(codeOf(() => decodeHex('C2' + '58' + '80' + 'FF'.repeat(128)))).toBe('no throw');

    });

});


describe('what the reading itself bounds', () => {

    it('refuses a decimal exponent past the range it reconstructs', () => {

        // 10 001, against MAX_DECIMAL_EXPONENT. Reconstructing 10^10000 as a
        // decimal string is 10 000 characters; reconstructing 10^(2^53) is not
        // a thing that finishes.
        expect(codeOf(() => decodeMetrologicalValue(hexToBytes('D9ACDC82C4821927110504'))))
            .toBe('ERR_VALUE_EXPONENT_RANGE');

        expect(milliseconds(() => decodeMetrologicalValue(hexToBytes('D9ACDC82C482 1B7FFFFFFFFFFFFFFF 0504'.replace(/\s/g, '')))))
            .toBeLessThan(BUDGET_MS);

    });

    it('refuses a unit exponent past what a number holds exactly', () => {

        expect(codeOf(() => decodeMetrologicalValue(hexToBytes('D9ACDC820581820F1B0020000000000000'))))
            .toBe('ERR_UNIT_EXPONENT_DENOMINATOR');

    });

    it('refuses a mantissa of more digits than it will reconstruct', () => {

        // The limit is on digits rather than on bytes, because it is the
        // decimal rendering that costs: MAX_MANTISSA_DIGITS is 1 000, and a
        // 128-byte bignum is 309 digits, so this is reached through the model
        // rather than through the wire.
        const bignum = 'C2' + '58' + '80' + 'FF'.repeat(128);

        expect(codeOf(() => decodeHex(bignum))).toBe('no throw');

    });

});


describe('a document that is large rather than deep', () => {

    it('decodes a real one without tripping anything', () => {

        // The worked example is 713 bytes and nests six deep. The limits have
        // to be generous enough that real metrological documents never meet
        // them, or they are a denial of service of their own.
        const wide = '98' + '64' + '00'.repeat(100);

        expect(codeOf(() => decodeHex(wide))).toBe('no throw');
        expect(milliseconds(() => decodeHex(wide))).toBeLessThan(BUDGET_MS);

    });

    it('costs time in proportion to its size, not to the square of it', () => {

        // A quadratic decoder passes every correctness test there is and still
        // falls over on the first large document it meets. Ten thousand items
        // is where the difference stops being a matter of opinion: linear is
        // single-digit milliseconds, and a hundred times that is not.
        const many = '99' + '2710' + '00'.repeat(10_000);

        expect(codeOf(() => decodeHex(many))).toBe('no throw');

        // Warmed, so this measures the decoder rather than the compiler.
        decodeHex(many);

        expect(milliseconds(() => decodeHex(many))).toBeLessThan(BUDGET_MS);

    });

});
