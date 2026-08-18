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
 * Round trips, over generated values rather than chosen ones.
 *
 * Two properties matter and they are not the same:
 *
 * - **encode then decode returns the value.** Nothing is lost on the way out.
 * - **decode then encode returns the bytes.** Nothing is added on the way in,
 *   which is what makes a signature over the bytes a signature over the value.
 *
 * The second is the stronger claim, and the one a metrological format lives on.
 */

import fc                        from 'fast-check';
import { describe, expect, it }  from 'vitest';

import { bytesToHex }            from '../../src/cbor/hex.js';
import { decode, encode }        from '../../src/cbor/index.js';
import type { CborEntry, CborValue } from '../../src/cbor/types.js';


// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Integers across every argument-width boundary, and beyond into bignums. */
const anyInt = fc.oneof(
    fc.bigInt({ min: 0n,                     max: 23n }),
    fc.bigInt({ min: 24n,                    max: 255n }),
    fc.bigInt({ min: 256n,                   max: 65535n }),
    fc.bigInt({ min: 65536n,                 max: 4294967295n }),
    fc.bigInt({ min: 4294967296n,            max: 18446744073709551615n }),
    fc.bigInt({ min: 18446744073709551616n,  max: 1n << 512n }),
    fc.bigInt({ min: -24n,                   max: -1n }),
    fc.bigInt({ min: -18446744073709551616n, max: -25n }),
    fc.bigInt({ min: -(1n << 512n),          max: -18446744073709551617n }),
).map((value): CborValue => ({ type: 'int', value }));

const anyFloat = fc.oneof(
    fc.double(),
    fc.float(),
    fc.constantFrom(0, -0, 1, -1, 1.5, 65504, 1e300, 5.960464477539063e-8,
                    Infinity, -Infinity, Number.NaN),
).map((value): CborValue => ({ type: 'float', value, width: 8 }));

const anyLeaf: fc.Arbitrary<CborValue> = fc.oneof(
    anyInt,
    anyFloat,
    fc.uint8Array().map((value): CborValue => ({ type: 'bytes', value })),
    fc.string().map((value): CborValue => ({ type: 'text', value })),
    fc.boolean().map((value): CborValue => ({ type: 'bool', value })),
    fc.constant<CborValue>({ type: 'null' }),
    fc.constant<CborValue>({ type: 'undefined' }),
    fc.integer({ min: 0, max: 19 }).map((value): CborValue => ({ type: 'simple', value })),
    fc.integer({ min: 32, max: 255 }).map((value): CborValue => ({ type: 'simple', value })),
);

/**
 * Map entries with keys made unique by construction.
 *
 * A generated duplicate is not interesting here — the encoder is specified to
 * reject it, and reader.test.ts and writer.test.ts pin that — so generating one
 * would only test the rejection path over and over.
 */
const uniqueEntries = (value: fc.Arbitrary<CborValue>): fc.Arbitrary<CborEntry[]> =>
    fc.uniqueArray(fc.tuple(anyLeaf, value), {
        maxLength: 6,
        selector:  ([key]) => bytesToHex(encode(key)),
    }).map(pairs => pairs.map(([key, entry]): CborEntry => [key, entry]));

const anyValue: fc.Arbitrary<CborValue> = fc.letrec<{ value: CborValue }>(tie => ({
    value: fc.oneof(
        { maxDepth: 4, depthSize: 'small' },
        anyLeaf,
        fc.array(tie('value'), { maxLength: 6 }).map((items): CborValue => ({ type: 'array', items })),
        uniqueEntries(tie('value')).map((entries): CborValue => ({ type: 'map', entries })),
        // Tags 2 and 3 are excluded: the decoder folds them into an integer,
        // so they are not a shape a decoded document ever has, and the writer
        // rejects them for exactly that reason. writer.test.ts pins that.
        fc.tuple(fc.bigInt({ min: 0n, max: 18446744073709551615n }).filter(tagNumber => tagNumber !== 2n && tagNumber !== 3n),
                 tie('value'))
          .map(([tagNumber, inner]): CborValue => ({ type: 'tag', tag: tagNumber, value: inner })),
    ),
})).value;


// ---------------------------------------------------------------------------

/**
 * Structural equality that treats NaN as equal to itself and distinguishes
 * negative zero, neither of which `toStrictEqual` does the way this format
 * needs.
 */
function same(left: CborValue, right: CborValue): boolean {

    if (left.type !== right.type)
        return false;

    switch (left.type) {

        case 'float': {
            const other = (right as typeof left).value;
            return Number.isNaN(left.value) ? Number.isNaN(other) : Object.is(left.value, other);
        }

        case 'int':
            return left.value === (right as typeof left).value;

        case 'text':
        case 'bool':
        case 'simple':
            return left.value === (right as typeof left).value;

        case 'bytes':
            return bytesToHex(left.value) === bytesToHex((right as typeof left).value);

        case 'null':
        case 'undefined':
            return true;

        case 'array': {
            const other = (right as typeof left).items;
            return left.items.length === other.length &&
                   left.items.every((item, index) => same(item, other[index]!));
        }

        case 'map': {
            // The encoder sorts, so a decoded map may list its entries in a
            // different order than the generated one. Compare as sets.
            const other = (right as typeof left).entries;
            if (left.entries.length !== other.length)
                return false;
            const key = (entry: CborEntry): string => bytesToHex(encode(entry[0]));
            const sortByKey = (entries: readonly CborEntry[]): CborEntry[] =>
                [...entries].sort((a, b) => key(a).localeCompare(key(b)));
            const mine  = sortByKey(left.entries);
            const yours = sortByKey(other);
            return mine.every((entry, index) => {
                const counterpart = yours[index];
                return counterpart !== undefined &&
                       same(entry[0], counterpart[0]) &&
                       same(entry[1], counterpart[1]);
            });
        }

        case 'tag':
            return left.tag === (right as typeof left).tag &&
                   same(left.value, (right as typeof left).value);

    }

}


describe('round trips', () => {

    it('encode then decode returns the value', () => {

        fc.assert(
            fc.property(anyValue, value => {
                expect(same(decode(encode(value)), value)).toBe(true);
            }),
            { numRuns: 2000 },
        );

    });

    it('decode then encode returns the bytes', () => {

        fc.assert(
            fc.property(anyValue, value => {
                const bytes = encode(value);
                expect(bytesToHex(encode(decode(bytes)))).toBe(bytesToHex(bytes));
            }),
            { numRuns: 2000 },
        );

    });

    it('encoding is a function of the value alone', () => {

        // The same value encoded twice gives the same bytes. This is what
        // makes a signature over measurement data reproducible.
        fc.assert(
            fc.property(anyValue, value => {
                expect(bytesToHex(encode(value))).toBe(bytesToHex(encode(value)));
            }),
            { numRuns: 1000 },
        );

    });

    it('integers survive whatever their magnitude', () => {

        fc.assert(
            fc.property(fc.bigInt({ min: -(1n << 1024n), max: 1n << 1024n }), value => {
                const decoded = decode(encode({ type: 'int', value }), { limits: { maxBignumBytes: 256 } });
                expect(decoded).toStrictEqual({ type: 'int', value });
            }),
            { numRuns: 2000 },
        );

    });

    it('text survives whatever it contains', () => {

        fc.assert(
            fc.property(fc.string({ unit: 'binary' }), value => {
                expect(decode(encode({ type: 'text', value }))).toStrictEqual({ type: 'text', value });
            }),
            { numRuns: 1000 },
        );

    });

});


describe('arbitrary bytes as input', () => {

    it('are either decoded or rejected, never anything else', () => {

        // The decoder faces hostile input by definition. Whatever it is handed,
        // it must terminate with a value or a typed error, and never with a
        // crash, a hang, or a value that does not re-encode to what it read.
        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 64 }), input => {

                let decoded;
                try {
                    decoded = decode(input);
                }
                catch (error) {
                    expect(error).toBeInstanceOf(Error);
                    return;
                }

                expect(bytesToHex(encode(decoded))).toBe(bytesToHex(input));

            }),
            { numRuns: 20000 },
        );

    });

    it('are decoded or rejected in lenient mode too', () => {

        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 64 }), input => {
                try {
                    decode(input, { strict: false });
                }
                catch (error) {
                    expect(error).toBeInstanceOf(Error);
                }
            }),
            { numRuns: 20000 },
        );

    });

});
