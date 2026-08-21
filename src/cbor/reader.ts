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
 * The decoder.
 *
 * Well-formedness follows RFC 8949, Section 5.1. Beyond that the decoder has
 * two modes:
 *
 * - **strict** (the default) additionally requires what Section 4.2.1 requires
 *   of a deterministic encoding: shortest arguments, definite lengths, map keys
 *   sorted and unique, bignums only where a basic integer will not do. This is
 *   the mode for data that was signed, because anything else means the bytes
 *   were not the ones the signer would have produced.
 * - **lenient** accepts those spellings and normalises them, while still
 *   rejecting everything that is malformed or that would exceed a limit.
 *
 * Duplicate map keys are rejected in both modes. A repeated key is not a
 * spelling difference, it is an ambiguity about what the data says.
 */

import { CborError }                            from '../errors.js';
import { bytesToHex, compareBytes, hexToBytes } from './hex.js';
import { resolveLimits }                       from './limits.js';
import type { DecodeLimits }                    from './limits.js';
import type { CborEntry, CborValue }            from './types.js';
import { encode, fromHalfBits, shortestFloatWidth } from './writer.js';

const MAX_UINT64 = 0xFFFF_FFFF_FFFF_FFFFn;

const TAG_POSITIVE_BIGNUM = 2n;
const TAG_NEGATIVE_BIGNUM = 3n;

const BREAK = 0xFF;

const decoder = new TextDecoder('utf-8', { fatal: true });


/**
 * How strictly to read, and what one input may cost.
 */
export interface DecodeOptions {

    /**
     * Whether to require the deterministic encoding of RFC 8949,
     * Section 4.2.1. Defaults to `true`.
     */
    readonly strict?: boolean;

    /** Bounds on what decoding may cost. Unstated bounds take their default. */
    readonly limits?: Partial<DecodeLimits>;

}


/**
 * One data item, and where in the input it ended.
 */
export interface DecodeResult {

    /** The decoded item. */
    readonly value: CborValue;

    /** How many bytes it occupied. */
    readonly bytesRead: number;

}


/**
 * Decodes one data item, which must be the whole input.
 *
 * @throws {CborError} if the input is not well-formed, violates the
 *         requirements of the selected mode, exceeds a limit, or is followed by
 *         further bytes.
 */
export function decode(bytes: Uint8Array, options?: DecodeOptions): CborValue {

    const { value, bytesRead } = decodeFirst(bytes, options);

    if (bytesRead !== bytes.length)
        throw new CborError('ERR_CBOR_TRAILING_DATA',
                            `${String(bytes.length - bytesRead)} bytes follow the decoded item.`,
                            { offset: bytesRead });

    return value;

}


/**
 * Decodes the first data item of the input and reports how far it reached.
 *
 * Use this where several items share one buffer; use {@link decode} where the
 * input is one item and trailing bytes are an error.
 */
export function decodeFirst(bytes: Uint8Array, options?: DecodeOptions): DecodeResult {

    const reader = new ByteReader(bytes,
                                 options?.strict ?? true,
                                 resolveLimits(options?.limits));

    const value = reader.read(0);

    return { value, bytesRead: reader.offset };

}


/**
 * Decodes one data item from hexadecimal, the notation the specification writes
 * its examples in. Whitespace is ignored.
 */
export function decodeHex(hex: string, options?: DecodeOptions): CborValue {
    return decode(hexToBytes(hex), options);
}


class ByteReader {

    #offset = 0;
    #items  = 0;

    readonly #view: DataView;

    constructor(private readonly bytes:  Uint8Array,
                private readonly strict: boolean,
                private readonly limits: DecodeLimits)
    {
        this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }


    get offset(): number {
        return this.#offset;
    }


    read(depth: number): CborValue {

        if (depth > this.limits.maxDepth)
            throw this.#limit(`Nesting deeper than ${String(this.limits.maxDepth)} levels.`);

        if (++this.#items > this.limits.maxItems)
            throw this.#limit(`More than ${String(this.limits.maxItems)} data items.`);

        const start   = this.#offset;
        const initial = this.#u8();
        const major   = initial >> 5;
        const ai      = initial & 0x1F;

        // Major type 7 spends its additional information on simple values and
        // float widths rather than on an integer argument, so it is read first.
        if (major === 7)
            return this.#readMajor7(ai, start);

        if (ai === 31)
            return this.#readIndefinite(major, start);

        const argument = this.#readArgument(ai, start);

        switch (major) {

            case 0:
                return { type: 'int', value: argument };

            case 1:
                // Major type 1 encodes -1 - n.
                return { type: 'int', value: -1n - argument };

            case 2:
                return { type: 'bytes', value: this.#readBytes(this.#length(argument, this.limits.maxStringBytes, 'byte string')) };

            case 3:
                return { type: 'text', value: this.#readText(this.#length(argument, this.limits.maxStringBytes, 'text string')) };

            case 4:
                return this.#readArray(this.#length(argument, this.limits.maxArrayItems, 'array'), depth);

            case 5:
                return this.#readMap(this.#length(argument, this.limits.maxMapPairs, 'map'), depth, start);

            case 6:
                return this.#readTag(argument, depth, start);

            // Unreachable, and kept: `major` is one byte shifted right by
            // five, so it is 0..7, and 7 returned above. This is what would
            // catch a change to either of those two facts.
            default:
                throw this.#malformed(`Unknown major type ${String(major)}.`, start);

        }

    }


    // -- Heads --------------------------------------------------------------

    /**
     * The integer argument of a head, rejecting an argument that could have
     * been written in fewer bytes (RFC 8949, Section 4.2.1).
     */
    #readArgument(ai: number, start: number): bigint {

        if (ai < 24)
            return BigInt(ai);

        switch (ai) {

            case 24: {
                const value = BigInt(this.#u8());
                this.#requirePreferred(value >= 24n, value, start);
                return value;
            }

            case 25: {
                const value = BigInt(this.#u16());
                this.#requirePreferred(value >= 0x100n, value, start);
                return value;
            }

            case 26: {
                const value = BigInt(this.#u32());
                this.#requirePreferred(value >= 0x1_0000n, value, start);
                return value;
            }

            case 27: {
                const value = this.#u64();
                this.#requirePreferred(value >= 0x1_0000_0000n, value, start);
                return value;
            }

            default:
                // 28, 29 and 30 are reserved and make the item ill-formed.
                throw this.#malformed(`The additional information ${String(ai)} is reserved.`, start);

        }

    }


    /**
     * A deterministic encoding writes a float in the shortest of the three
     * widths that preserves it (RFC 8949, Section 4.2.1), so a wider one means
     * the bytes are not the ones a deterministic encoder would have produced.
     */
    #requireShortestFloat(value: number, width: 2 | 4 | 8, start: number): void {

        if (!this.strict)
            return;

        const shortest = shortestFloatWidth(value);

        if (shortest !== width)
            throw new CborError('ERR_CBOR_NON_PREFERRED',
                                `A float written in ${String(width)} bytes is preserved by ${String(shortest)}.`,
                                { clause: '4.2.1', offset: start });

    }


    #requirePreferred(isPreferred: boolean, value: bigint, start: number): void {

        if (isPreferred || !this.strict)
            return;

        throw new CborError('ERR_CBOR_NON_PREFERRED',
                            `The argument ${String(value)} is not written in the shortest form.`,
                            { clause: '4.2.1', offset: start });

    }


    // -- Containers ---------------------------------------------------------

    #readArray(count: number, depth: number): CborValue {

        const items: CborValue[] = [];

        for (let index = 0; index < count; index++)
            items.push(this.read(depth + 1));

        return { type: 'array', items };

    }


    #readMap(pairs: number, depth: number, start: number): CborValue {

        const entries: CborEntry[] = [];

        for (let index = 0; index < pairs; index++) {
            const key   = this.read(depth + 1);
            const value = this.read(depth + 1);
            entries.push([key, value]);
        }

        this.#checkKeys(entries, start);

        return { type: 'map', entries };

    }


    /**
     * Rejects a repeated key always, and an unsorted one in strict mode.
     *
     * The comparison is over the deterministic encoding of each key rather than
     * over the bytes as they were read, so that two spellings of the same key
     * are still recognised as the same key.
     *
     * Duplicates are looked for across the whole map rather than between
     * neighbours: in a map that is not sorted, two occurrences of the same key
     * need not be adjacent.
     */
    #checkKeys(entries: readonly CborEntry[], start: number): void {

        if (entries.length < 2)
            return;

        const encoded = entries.map(([key]) => encode(key));
        const seen    = new Set<string>();

        for (const key of encoded) {

            const spelling = bytesToHex(key);

            if (seen.has(spelling))
                throw new CborError('ERR_CBOR_DUPLICATE_KEY',
                                    'A map contains the same key twice.',
                                    { clause: '5.6', offset: start });

            seen.add(spelling);

        }

        if (!this.strict)
            return;

        for (let index = 1; index < encoded.length; index++) {

            const previous = encoded[index - 1];
            const current  = encoded[index];

            if (previous !== undefined && current !== undefined && compareBytes(previous, current) > 0)
                throw new CborError('ERR_CBOR_UNSORTED_KEYS',
                                    'The keys of a map are not in bytewise lexicographic order.',
                                    { clause: '4.2.1', offset: start });

        }

    }


    // -- Tags ---------------------------------------------------------------

    /**
     * A tagged item.
     *
     * The bignum tags 2 and 3 are folded into an integer, so that nothing above
     * this layer has to care where the 64-bit boundary falls. Every other tag
     * is carried through uninterpreted.
     */
    #readTag(tag: bigint, depth: number, start: number): CborValue {

        const value = this.read(depth + 1);

        if ((tag === TAG_POSITIVE_BIGNUM || tag === TAG_NEGATIVE_BIGNUM) && value.type === 'bytes')
            return this.#foldBignum(tag, value.value, start);

        return { type: 'tag', tag, value };

    }


    #foldBignum(tag: bigint, bytes: Uint8Array, start: number): CborValue {

        if (bytes.length > this.limits.maxBignumBytes)
            throw this.#limit(`A bignum of ${String(bytes.length)} bytes exceeds the limit of ${String(this.limits.maxBignumBytes)}.`, start);

        if (this.strict && bytes.length > 0 && bytes[0] === 0)
            throw new CborError('ERR_CBOR_NON_PREFERRED',
                                'A bignum has a leading zero byte.',
                                { clause: '3.4.3', offset: start });

        let magnitude = 0n;
        for (const byte of bytes)
            magnitude = (magnitude << 8n) | BigInt(byte);

        // Tag 3 encodes -1 - n, exactly as major type 1 does.
        const value = tag === TAG_POSITIVE_BIGNUM ? magnitude : -1n - magnitude;

        if (this.strict && magnitude <= MAX_UINT64)
            throw new CborError('ERR_CBOR_NON_PREFERRED',
                                `The bignum ${String(value)} fits in a basic integer and must be written as one.`,
                                { clause: '3.4.3', offset: start });

        return { type: 'int', value };

    }


    // -- Major type 7 -------------------------------------------------------

    #readMajor7(ai: number, start: number): CborValue {

        switch (ai) {

            case 20: return { type: 'bool', value: false };
            case 21: return { type: 'bool', value: true  };
            case 22: return { type: 'null' };
            case 23: return { type: 'undefined' };

            case 24: {
                const value = this.#u8();
                // The one-byte form exists for 32..255; below that it would be
                // a longer spelling of the immediate form, and 24..31 are not
                // assignable at all.
                if (value < 32)
                    throw this.#malformed(`The simple value ${String(value)} must not use the one-byte form.`, start);
                return { type: 'simple', value };
            }

            case 25: {
                const bits  = this.#u16();
                const value = fromHalfBits(bits);
                // A NaN has many bit patterns and a deterministic encoding
                // picks one of them: f97e00 (RFC 8949, Section 4.2.2).
                if (this.strict && Number.isNaN(value) && bits !== 0x7E00)
                    throw new CborError('ERR_CBOR_NON_PREFERRED',
                                        'A NaN is written with a payload other than the canonical f97e00.',
                                        { clause: '4.2.2', offset: start });
                return { type: 'float', value, width: 2 };
            }

            case 26: {
                const value = this.#f32();
                this.#requireShortestFloat(value, 4, start);
                return { type: 'float', value, width: 4 };
            }

            case 27: {
                const value = this.#f64();
                this.#requireShortestFloat(value, 8, start);
                return { type: 'float', value, width: 8 };
            }

            case 31:
                throw this.#malformed('A break occurred outside an indefinite-length item.', start);

            default:
                if (ai < 20)
                    return { type: 'simple', value: ai };
                throw this.#malformed(`The additional information ${String(ai)} is reserved.`, start);

        }

    }


    // -- Indefinite lengths -------------------------------------------------

    /**
     * An indefinite-length string, array or map.
     *
     * Deterministic encoding forbids them, so strict mode rejects them outright;
     * lenient mode reads them and yields the same model a definite-length
     * encoding would have yielded.
     */
    #readIndefinite(major: number, start: number): CborValue {

        if (this.strict)
            throw new CborError('ERR_CBOR_INDEFINITE_LENGTH',
                                'An indefinite-length item, which a deterministic encoding does not contain.',
                                { clause: '4.2.1', offset: start });

        switch (major) {

            case 2: return { type: 'bytes', value: this.#readChunkedBytes(start) };
            case 3: return { type: 'text',  value: this.#readChunkedText(start)  };

            case 4: {
                const items: CborValue[] = [];
                while (!this.#atBreak())
                    items.push(this.read(1));
                this.#u8();
                return { type: 'array', items };
            }

            case 5: {
                const entries: CborEntry[] = [];
                while (!this.#atBreak()) {
                    const key = this.read(1);
                    if (this.#atBreak())
                        throw this.#malformed('An indefinite-length map ended between a key and its value.', start);
                    entries.push([key, this.read(1)]);
                }
                this.#u8();
                this.#checkKeys(entries, start);
                return { type: 'map', entries };
            }

            default:
                throw this.#malformed(`Major type ${String(major)} has no indefinite-length form.`, start);

        }

    }


    #readChunkedBytes(start: number): Uint8Array {

        const chunks: Uint8Array[] = [];
        let   total  = 0;

        while (!this.#atBreak()) {

            const chunkStart = this.#offset;
            const initial    = this.#u8();

            if ((initial >> 5) !== 2 || (initial & 0x1F) === 31)
                throw this.#malformed('An indefinite-length byte string contains a chunk that is not a definite-length byte string.', chunkStart);

            const length = this.#length(this.#readArgument(initial & 0x1F, chunkStart), this.limits.maxStringBytes, 'byte string');
            total += length;

            if (total > this.limits.maxStringBytes)
                throw this.#limit(`A byte string longer than ${String(this.limits.maxStringBytes)} bytes.`, start);

            chunks.push(this.#readBytes(length));

        }

        this.#u8();

        const joined = new Uint8Array(total);
        let   at     = 0;
        for (const chunk of chunks) {
            joined.set(chunk, at);
            at += chunk.length;
        }

        return joined;

    }


    #readChunkedText(start: number): string {

        let out   = '';
        let total = 0;

        while (!this.#atBreak()) {

            const chunkStart = this.#offset;
            const initial    = this.#u8();

            if ((initial >> 5) !== 3 || (initial & 0x1F) === 31)
                throw this.#malformed('An indefinite-length text string contains a chunk that is not a definite-length text string.', chunkStart);

            const length = this.#length(this.#readArgument(initial & 0x1F, chunkStart), this.limits.maxStringBytes, 'text string');
            total += length;

            if (total > this.limits.maxStringBytes)
                throw this.#limit(`A text string longer than ${String(this.limits.maxStringBytes)} bytes.`, start);

            // Each chunk is independently valid UTF-8: RFC 8949, Section 3.2.3
            // forbids splitting a character across chunks.
            out += this.#readText(length);

        }

        this.#u8();

        return out;

    }


    #atBreak(): boolean {

        if (this.#offset >= this.bytes.length)
            throw this.#unexpectedEnd();

        return this.bytes[this.#offset] === BREAK;

    }


    // -- Primitives ---------------------------------------------------------

    /**
     * An argument used as a count or a length, checked against its limit and
     * against what actually remains in the input.
     */
    #length(argument: bigint, limit: number, what: string): number {

        if (argument > BigInt(limit))
            throw this.#limit(`A ${what} of ${String(argument)} exceeds the limit of ${String(limit)}.`);

        const length = Number(argument);

        // A claimed length longer than the remaining input is a truncated item,
        // not a reason to allocate what it asks for.
        if (length > this.bytes.length - this.#offset)
            throw this.#unexpectedEnd(`A ${what} claims ${String(length)} of the ${String(this.bytes.length - this.#offset)} bytes that remain.`);

        return length;

    }


    #readBytes(length: number): Uint8Array {
        const start = this.#offset;
        this.#offset += length;
        return this.bytes.slice(start, this.#offset);
    }


    #readText(length: number): string {

        const raw = this.#readBytes(length);

        try {
            return decoder.decode(raw);
        }
        catch {
            throw new CborError('ERR_CBOR_INVALID_UTF8',
                                'A text string is not valid UTF-8.',
                                { clause: '3.1', offset: this.#offset - length });
        }

    }


    #u8(): number {
        // The bound is checked on the line above, so the byte is there. A
        // `?? 0` would read a byte past the end as a zero rather than as the
        // end, which is how a truncated document becomes a valid one.
        if (this.#offset + 1 > this.bytes.length)
            throw this.#unexpectedEnd();
        return this.bytes[this.#offset++]!;
    }


    #u16(): number {
        this.#require(2);
        const value = this.#view.getUint16(this.#offset);
        this.#offset += 2;
        return value;
    }


    #u32(): number {
        this.#require(4);
        const value = this.#view.getUint32(this.#offset);
        this.#offset += 4;
        return value;
    }


    #u64(): bigint {
        this.#require(8);
        const value = this.#view.getBigUint64(this.#offset);
        this.#offset += 8;
        return value;
    }


    #f32(): number {
        this.#require(4);
        const value = this.#view.getFloat32(this.#offset);
        this.#offset += 4;
        return value;
    }


    #f64(): number {
        this.#require(8);
        const value = this.#view.getFloat64(this.#offset);
        this.#offset += 8;
        return value;
    }


    #require(count: number): void {
        if (this.#offset + count > this.bytes.length)
            throw this.#unexpectedEnd();
    }


    // -- Errors -------------------------------------------------------------

    #unexpectedEnd(message?: string): CborError {
        return new CborError('ERR_CBOR_UNEXPECTED_END',
                             message ?? 'The input ended in the middle of a data item.',
                             { clause: '5.1', offset: this.#offset });
    }


    #malformed(message: string, offset: number): CborError {
        return new CborError('ERR_CBOR_MALFORMED', message, { clause: '5.1', offset });
    }


    #limit(message: string, offset?: number): CborError {
        return new CborError('ERR_CBOR_LIMIT_EXCEEDED', message,
                             { clause: '7', offset: offset ?? this.#offset });
    }

}
