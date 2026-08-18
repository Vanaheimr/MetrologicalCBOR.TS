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
 * The deterministic encoder (RFC 8949, Section 4.2.1).
 *
 * There is exactly one encoding of a given value: shortest possible argument,
 * definite lengths throughout, map keys sorted by the bytewise lexicographic
 * order of their own encodings, and floating-point numbers in the shortest
 * width that preserves them. That is what makes measurement data signable —
 * the bytes are a function of the value and nothing else, so the same reading
 * always produces the same signature.
 */

import { CborError }                    from '../errors.js';
import { compareBytes }                 from './hex.js';
import type { CborValue }               from './types.js';

const MAX_UINT64 = 0xFFFF_FFFF_FFFF_FFFFn;
const TWO_64     = 1n << 64n;

const TAG_POSITIVE_BIGNUM = 2n;
const TAG_NEGATIVE_BIGNUM = 3n;

const encoder = new TextEncoder();


/**
 * What to do where a document was not written deterministically.
 *
 * Both defaults produce the canonical encoding. Both alternatives exist for
 * one reason: re-serialising a document this library did not write, whose
 * bytes somebody signed.
 */
export interface EncodeOptions {

    /**
     * How to choose the width of a floating-point number.
     *
     * `'shortest'` (the default) follows the deterministic encoding
     * requirements. `'preserve'` writes each float in the width recorded on it,
     * which is what re-serialising a foreign document byte for byte needs, and
     * which is not deterministic encoding.
     */
    readonly floats?: 'shortest' | 'preserve';

    /**
     * Whether to sort map keys.
     *
     * `'sorted'` (the default) follows the deterministic encoding
     * requirements. `'preserve'` writes the entries in the order they are held
     * in, which is what re-serialising a foreign document needs: a signed
     * document whose maps are not sorted — the worked example of the
     * specification is one — must keep the order it was signed in, and
     * reordering it would invalidate a signature this library never touched.
     *
     * Specification Section 6 requires the deterministic encoding of the
     * *metrological value*, not of the document carrying it, so the two cases
     * genuinely differ.
     */
    readonly mapKeys?: 'sorted' | 'preserve';

}


/**
 * Encodes one value deterministically.
 *
 * @throws {CborError} if the value cannot be encoded — a map with a duplicate
 *         key, or a simple value outside the permitted ranges.
 */
export function encode(value: CborValue, options?: EncodeOptions): Uint8Array {

    const writer = new ByteWriter(options?.floats ?? 'shortest',
                                  options?.mapKeys ?? 'sorted');
    writer.write(value);
    return writer.finish();

}


/**
 * The deterministic encoding of a value, as uppercase hexadecimal.
 *
 * A convenience for tests and diagnostics, where the specification's own
 * notation is easier to read than a byte array.
 */
export function encodeToHex(value: CborValue, options?: EncodeOptions): string {

    let out = '';

    for (const byte of encode(value, options))
        out += byte.toString(16).toUpperCase().padStart(2, '0');

    return out;

}


class ByteWriter {

    #buffer = new Uint8Array(64);
    #length = 0;

    constructor(private readonly floats:  'shortest' | 'preserve',
                private readonly mapKeys: 'sorted'   | 'preserve') {}


    finish(): Uint8Array {
        return this.#buffer.slice(0, this.#length);
    }


    write(value: CborValue): void {

        switch (value.type) {

            case 'int':       this.#writeInt(value.value);                       break;
            case 'bytes':     this.#writeString(2, value.value);                 break;
            case 'text':      this.#writeString(3, encoder.encode(value.value)); break;
            case 'bool':      this.#byte(value.value ? 0xF5 : 0xF4);             break;
            case 'null':      this.#byte(0xF6);                                  break;
            case 'undefined': this.#byte(0xF7);                                  break;
            case 'simple':    this.#writeSimple(value.value);                    break;
            case 'float':     this.#writeFloat(value.value, value.width);        break;

            case 'array':
                this.#head(4, BigInt(value.items.length));
                for (const item of value.items)
                    this.write(item);
                break;

            case 'map':
                this.#writeMap(value);
                break;

            case 'tag':

                if (value.tag < 0n || value.tag > MAX_UINT64)
                    throw new CborError('ERR_CBOR_UNENCODABLE',
                                        `The tag number ${String(value.tag)} is outside the range of a CBOR tag.`);

                // The decoder folds the bignum tags into an integer, so a
                // hand-built tag 2 or 3 would be a value the decoder can never
                // return — and its encoding would not be the preferred one for
                // whatever number it holds. Refusing it keeps the model and the
                // wire in step.
                if ((value.tag === TAG_POSITIVE_BIGNUM || value.tag === TAG_NEGATIVE_BIGNUM) && value.value.type === 'bytes')
                    throw new CborError('ERR_CBOR_UNENCODABLE',
                                        `Tag ${String(value.tag)} holds a bignum, which this model represents as an ordinary integer. Build it with int() instead.`,
                                        { clause: '3.4.3' });

                this.#head(6, value.tag);
                this.write(value.value);
                break;

        }

    }


    // -- Integers -----------------------------------------------------------

    /**
     * Major type 0 or 1 where the magnitude fits in 64 bits, and the bignum
     * tags 2 and 3 where it does not (RFC 8949, Sections 3.1 and 3.4.3).
     */
    #writeInt(value: bigint): void {

        if (value >= 0n) {
            if (value <= MAX_UINT64)
                this.#head(0, value);
            else
                this.#writeBignum(TAG_POSITIVE_BIGNUM, value);
        }
        else {
            // Major type 1 encodes -1 - n, so a value of -1 has an argument of 0.
            const magnitude = -1n - value;
            if (magnitude <= MAX_UINT64)
                this.#head(1, magnitude);
            else
                this.#writeBignum(TAG_NEGATIVE_BIGNUM, magnitude);
        }

    }


    #writeBignum(tag: bigint, magnitude: bigint): void {

        let hex = magnitude.toString(16);
        if (hex.length % 2 !== 0)
            hex = '0' + hex;

        const bytes = new Uint8Array(hex.length / 2);
        for (let index = 0; index < bytes.length; index++)
            bytes[index] = Number.parseInt(hex.substring(index * 2, index * 2 + 2), 16);

        this.#head(6, tag);
        this.#writeString(2, bytes);

    }


    // -- Strings ------------------------------------------------------------

    #writeString(major: number, bytes: Uint8Array): void {
        this.#head(major, BigInt(bytes.length));
        this.#bytes(bytes);
    }


    // -- Maps ---------------------------------------------------------------

    /**
     * Keys are sorted by the bytewise lexicographic order of their own
     * encodings, and a key that appears twice is an error rather than a
     * silently dropped entry (RFC 8949, Sections 4.2.1 and 5.6).
     *
     * A duplicate is looked for across the whole map, not between neighbours:
     * with sorting turned off, two occurrences of the same key need not be
     * adjacent.
     */
    #writeMap(value: { readonly entries: readonly (readonly [CborValue, CborValue])[] }): void {

        const options: EncodeOptions = { floats: this.floats, mapKeys: this.mapKeys };

        const encoded = value.entries.map(([key, entryValue]) => ({
            key:   encode(key, options),
            entry: entryValue,
        }));

        const seen = new Set<string>();

        for (const { key } of encoded) {

            let spelling = '';
            for (const byte of key)
                spelling += byte.toString(16).padStart(2, '0');

            if (seen.has(spelling))
                throw new CborError('ERR_CBOR_UNENCODABLE',
                                    'A map contains the same key twice.',
                                    { clause: '5.6' });

            seen.add(spelling);

        }

        if (this.mapKeys === 'sorted')
            encoded.sort((left, right) => compareBytes(left.key, right.key));

        this.#head(5, BigInt(encoded.length));

        for (const { key, entry } of encoded) {
            this.#bytes(key);
            this.write(entry);
        }

    }


    // -- Simple values ------------------------------------------------------

    #writeSimple(value: number): void {

        if (!Number.isInteger(value) || value < 0 || value > 255)
            throw new CborError('ERR_CBOR_UNENCODABLE',
                                `The simple value ${String(value)} is outside 0..255.`);

        // 20..23 have names of their own, and 24..31 are not representable:
        // the one-byte form starts at 32.
        if (value >= 20 && value <= 31)
            throw new CborError('ERR_CBOR_UNENCODABLE',
                                `The simple value ${String(value)} is reserved or has a dedicated representation.`);

        if (value < 20)
            this.#byte(0xE0 | value);
        else {
            this.#byte(0xF8);
            this.#byte(value);
        }

    }


    // -- Floating point -----------------------------------------------------

    /**
     * The shortest width that preserves the value, as deterministic encoding
     * requires, unless the caller asked for the recorded width instead.
     */
    #writeFloat(value: number, recorded: 2 | 4 | 8): void {

        const width = this.floats === 'preserve' ? recorded : shortestFloatWidth(value);

        switch (width) {

            case 2: {
                this.#byte(0xF9);
                const bits = Number.isNaN(value) ? 0x7E00 : toHalfBits(value);
                if (bits === undefined)
                    throw new CborError('ERR_CBOR_UNENCODABLE',
                                        `${String(value)} is not representable as a half-precision float.`);
                this.#byte((bits >>> 8) & 0xFF);
                this.#byte(bits & 0xFF);
                break;
            }

            case 4: {
                this.#byte(0xFA);
                const scratch = new DataView(new ArrayBuffer(4));
                scratch.setFloat32(0, value);
                for (let index = 0; index < 4; index++)
                    this.#byte(scratch.getUint8(index));
                break;
            }

            case 8: {
                this.#byte(0xFB);
                const scratch = new DataView(new ArrayBuffer(8));
                scratch.setFloat64(0, value);
                for (let index = 0; index < 8; index++)
                    this.#byte(scratch.getUint8(index));
                break;
            }

        }

    }


    // -- Primitives ---------------------------------------------------------

    #head(major: number, argument: bigint): void {

        const prefix = major << 5;

        if (argument < 24n)
            this.#byte(prefix | Number(argument));

        else if (argument < 0x100n) {
            this.#byte(prefix | 24);
            this.#byte(Number(argument));
        }

        else if (argument < 0x10000n) {
            this.#byte(prefix | 25);
            this.#uint(argument, 2);
        }

        else if (argument < 0x1_0000_0000n) {
            this.#byte(prefix | 26);
            this.#uint(argument, 4);
        }

        else if (argument < TWO_64) {
            this.#byte(prefix | 27);
            this.#uint(argument, 8);
        }

        else
            throw new CborError('ERR_CBOR_UNENCODABLE',
                                `The argument ${String(argument)} does not fit in a CBOR head.`);

    }


    #uint(value: bigint, width: number): void {
        for (let shift = (width - 1) * 8; shift >= 0; shift -= 8)
            this.#byte(Number((value >> BigInt(shift)) & 0xFFn));
    }


    #byte(value: number): void {
        this.#reserve(1);
        this.#buffer[this.#length++] = value;
    }


    #bytes(values: Uint8Array): void {
        this.#reserve(values.length);
        this.#buffer.set(values, this.#length);
        this.#length += values.length;
    }


    #reserve(count: number): void {

        if (this.#length + count <= this.#buffer.length)
            return;

        let capacity = this.#buffer.length * 2;
        while (capacity < this.#length + count)
            capacity *= 2;

        const grown = new Uint8Array(capacity);
        grown.set(this.#buffer.subarray(0, this.#length));
        this.#buffer = grown;

    }

}


// ---------------------------------------------------------------------------
// Floating-point widths
// ---------------------------------------------------------------------------

/**
 * The narrowest of the three widths that reproduces `value` exactly.
 *
 * A NaN is written as the half-precision `f97e00`, the canonical quiet NaN of
 * RFC 8949, Section 4.2.2.
 */
export function shortestFloatWidth(value: number): 2 | 4 | 8 {

    if (Number.isNaN(value))
        return 2;

    // Math.fround rounds to the nearest float32; where that changes the value,
    // neither the single nor the half width can hold it. -0 compares equal to
    // itself under ===, and NaN is already out of the way.
    if (Math.fround(value) !== value)
        return 8;

    return toHalfBits(value) === undefined ? 4 : 2;

}


const halfScratch = new DataView(new ArrayBuffer(4));

/**
 * The 16-bit half-precision pattern of a value that a float32 holds exactly,
 * or `undefined` where the half cannot hold it without loss.
 *
 * NaN is not handled here: it has many bit patterns and deterministic encoding
 * picks one, which is the caller's business.
 */
export function toHalfBits(value: number): number | undefined {

    if (Number.isNaN(value))
        return undefined;

    halfScratch.setFloat32(0, value);
    if (halfScratch.getFloat32(0) !== value)
        return undefined;

    const bits     = halfScratch.getUint32(0);
    const sign     = (bits >>> 16) & 0x8000;
    const exponent = (bits >>> 23) & 0xFF;
    const mantissa = bits & 0x7F_FFFF;

    if (exponent === 0xFF)
        return mantissa === 0 ? sign | 0x7C00 : undefined;

    const unbiased = exponent - 127;

    // Too large for the half's exponent range.
    if (unbiased > 15)
        return undefined;

    if (unbiased >= -14) {
        // Normal: the half keeps 10 mantissa bits of the single's 23.
        if ((mantissa & 0x1FFF) !== 0)
            return undefined;
        return sign | ((unbiased + 15) << 10) | (mantissa >>> 13);
    }

    // Below the smallest subnormal the only representable value is zero.
    if (unbiased < -24)
        return exponent === 0 && mantissa === 0 ? sign : undefined;

    // Subnormal: restore the implicit leading bit and shift it into place.
    const shift = -unbiased - 14;
    const full  = mantissa | 0x80_0000;

    if ((full & ((1 << (13 + shift)) - 1)) !== 0)
        return undefined;

    return sign | (full >>> (13 + shift));

}


/**
 * The value of a 16-bit half-precision pattern.
 */
export function fromHalfBits(bits: number): number {

    const sign     = (bits & 0x8000) !== 0 ? -1 : 1;
    const exponent = (bits >>> 10) & 0x1F;
    const mantissa = bits & 0x3FF;

    if (exponent === 0)
        return sign * mantissa * 2 ** -24;

    if (exponent === 0x1F)
        return mantissa === 0 ? sign * Infinity : Number.NaN;

    return sign * (mantissa + 1024) * 2 ** (exponent - 25);

}
