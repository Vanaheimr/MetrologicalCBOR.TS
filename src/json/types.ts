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
 * What the JSON conversion carries, and what it promises.
 */

/** Any value `JSON.stringify` can write and `JSON.parse` can return. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };


/** Where a value sits in a JSON document: object keys and array indices. */
export type JsonPath = readonly (string | number)[];


/**
 * The path as a JSON Pointer (RFC 6901), for an error message or a caller's
 * own bookkeeping.
 */
export function toJsonPointer(path: JsonPath): string {

    if (path.length === 0)
        return '';

    return path
        .map(segment => typeof segment === 'number'
                            ? String(segment)
                            : segment.replace(/~/g, '~0').replace(/\//g, '~1'))
        .map(segment => `/${segment}`)
        .join('');

}


/**
 * The base64url alphabet of RFC 4648, Section 5: the one that survives being
 * put in a URL, and the one COSE and JOSE use.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const VALUES = new Map<string, number>([...ALPHABET].map((character, index) => [character, index]));


/** A byte string as unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {

    let out  = '';
    let bits = 0;
    let held = 0;

    for (const byte of bytes) {

        held = (held << 8) | byte;
        bits += 8;

        while (bits >= 6) {
            bits -= 6;
            out += ALPHABET[(held >> bits) & 0x3F];
        }

    }

    if (bits > 0)
        out += ALPHABET[(held << (6 - bits)) & 0x3F];

    return out;

}


/**
 * The bytes of an unpadded base64url string, or `undefined` where the text is
 * not one.
 */
export function fromBase64Url(text: string): Uint8Array | undefined {

    if (text.length % 4 === 1)
        return undefined;

    const bytes: number[] = [];
    let   bits = 0;
    let   held = 0;

    for (const character of text) {

        const value = VALUES.get(character);

        if (value === undefined)
            return undefined;

        held = (held << 6) | value;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            bytes.push((held >> bits) & 0xFF);
        }

    }

    return new Uint8Array(bytes);

}
