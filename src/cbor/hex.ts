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
 * Hexadecimal, the notation the specification writes its examples in.
 */

/**
 * The uppercase hexadecimal of a byte sequence, as the specification writes it:
 * `D9ACDC820504`.
 */
export function bytesToHex(bytes: Uint8Array): string {

    let out = '';

    for (const byte of bytes)
        out += byte.toString(16).toUpperCase().padStart(2, '0');

    return out;

}


/**
 * The bytes of a hexadecimal string.
 *
 * Whitespace is ignored, so the byte-level listings of the specification can be
 * pasted in as they are written, across several lines.
 *
 * @throws {SyntaxError} if the input is not hexadecimal, or has an odd number
 *         of digits.
 */
export function hexToBytes(hex: string): Uint8Array {

    const compact = hex.replace(/\s+/g, '');

    if (compact.length % 2 !== 0)
        throw new SyntaxError(`Hexadecimal input has an odd number of digits (${String(compact.length)}).`);

    if (!/^[0-9A-Fa-f]*$/.test(compact))
        throw new SyntaxError('Hexadecimal input contains a character that is not a hexadecimal digit.');

    const bytes = new Uint8Array(compact.length / 2);

    for (let index = 0; index < bytes.length; index++)
        bytes[index] = Number.parseInt(compact.substring(index * 2, index * 2 + 2), 16);

    return bytes;

}


/**
 * Bytewise lexicographic comparison, the order deterministic encoding sorts map
 * keys in (RFC 8949, Section 4.2.1).
 *
 * A prefix sorts before the sequence it is a prefix of.
 */
export function compareBytes(left: Uint8Array, right: Uint8Array): number {

    const shared = Math.min(left.length, right.length);

    for (let index = 0; index < shared; index++) {
        const a = left[index] ?? 0;
        const b = right[index] ?? 0;
        if (a !== b)
            return a < b ? -1 : 1;
    }

    return left.length === right.length ? 0 : (left.length < right.length ? -1 : 1);

}
