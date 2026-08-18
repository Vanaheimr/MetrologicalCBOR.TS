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
 * The CBOR data model (RFC 8949), as far as this library needs it.
 *
 * Two decisions shape it:
 *
 * **Integers are integers, whatever their width.** Major types 0 and 1 and the
 * bignum tags 2 and 3 all decode to {@link CborInt} with a `bigint` value, and
 * the writer picks whichever encoding is the preferred serialisation for the
 * magnitude. Nothing above this layer has to care where the 64-bit boundary
 * falls — which matters, because a metrological mantissa may cross it.
 *
 * **Tags stay uninterpreted.** Apart from the bignums above, a tag decodes to
 * {@link CborTag} and nothing else. The core knows the shape of CBOR, not the
 * meaning of tag 4 or tag 44252; that belongs to the codec above it, and
 * keeping it out here is what makes the core usable for walking documents
 * whose tags this library has never heard of.
 */

/** An integer of any magnitude: major type 0 or 1, or the bignum tags 2 and 3. */
export interface CborInt {
    readonly type:  'int';
    readonly value: bigint;
}

/** A byte string: major type 2. */
export interface CborBytes {
    readonly type:  'bytes';
    readonly value: Uint8Array;
}

/** A text string: major type 3, always valid UTF-8. */
export interface CborText {
    readonly type:  'text';
    readonly value: string;
}

/** An array: major type 4. */
export interface CborArray {
    readonly type:  'array';
    readonly items: readonly CborValue[];
}

/**
 * A map: major type 5.
 *
 * Entries keep the order they were decoded in, which is not necessarily the
 * order they will be encoded in: deterministic encoding sorts them by the
 * bytewise lexicographic order of their encoded keys.
 */
export interface CborMap {
    readonly type:    'map';
    readonly entries: readonly CborEntry[];
}

/** One key/value pair of a {@link CborMap}. */
export type CborEntry = readonly [key: CborValue, value: CborValue];

/** A tagged data item: major type 6. */
export interface CborTag {
    readonly type:  'tag';
    readonly tag:   bigint;
    readonly value: CborValue;
}

/** `true` or `false`: major type 7, simple values 20 and 21. */
export interface CborBool {
    readonly type:  'bool';
    readonly value: boolean;
}

/** `null`: major type 7, simple value 22. */
export interface CborNull {
    readonly type: 'null';
}

/** `undefined`: major type 7, simple value 23. */
export interface CborUndefined {
    readonly type: 'undefined';
}

/**
 * A simple value other than `false`, `true`, `null` and `undefined`:
 * major type 7, values 0..19 and 32..255.
 */
export interface CborSimple {
    readonly type:  'simple';
    readonly value: number;
}

/**
 * A binary floating-point number: major type 7, additional information
 * 25, 26 or 27.
 *
 * `width` records the encoding the value was read from, in bytes. Deterministic
 * encoding ignores it and writes the shortest form that preserves the value;
 * it exists so that a caller re-serialising foreign data can reproduce it
 * exactly.
 *
 * Floating point never appears inside a metrological value: specification
 * Section 3.1 forbids it, because an IEEE 754 double can represent neither
 * `0.1` exactly nor a decimal scale at all. It appears here only because the
 * documents that carry metrological values may contain it elsewhere.
 */
export interface CborFloat {
    readonly type:  'float';
    readonly value: number;
    readonly width: 2 | 4 | 8;
}

/** Any CBOR data item. */
export type CborValue =
    | CborInt
    | CborBytes
    | CborText
    | CborArray
    | CborMap
    | CborTag
    | CborBool
    | CborNull
    | CborUndefined
    | CborSimple
    | CborFloat;


// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** An integer of any magnitude. */
export const int = (value: bigint | number): CborInt =>
    ({ type: 'int', value: typeof value === 'bigint' ? value : BigInt(value) });

/** A byte string. */
export const bytes = (value: Uint8Array): CborBytes =>
    ({ type: 'bytes', value });

/** A text string. */
export const text = (value: string): CborText =>
    ({ type: 'text', value });

/** An array. */
export const array = (items: readonly CborValue[]): CborArray =>
    ({ type: 'array', items });

/** A map. */
export const map = (entries: readonly CborEntry[]): CborMap =>
    ({ type: 'map', entries });

/** A tagged data item. */
export const tag = (tagNumber: bigint | number, value: CborValue): CborTag =>
    ({ type: 'tag', tag: typeof tagNumber === 'bigint' ? tagNumber : BigInt(tagNumber), value });

/** `true` or `false`. */
export const bool = (value: boolean): CborBool =>
    ({ type: 'bool', value });

/** `null`. */
export const nullValue: CborNull = { type: 'null' };

/** `undefined`. */
export const undefinedValue: CborUndefined = { type: 'undefined' };

/** A simple value other than the four with names of their own. */
export const simple = (value: number): CborSimple =>
    ({ type: 'simple', value });

/** A binary floating-point number. `width` defaults to the shortest form. */
export const float = (value: number, width: 2 | 4 | 8 = 8): CborFloat =>
    ({ type: 'float', value, width });


// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export const isInt   = (value: CborValue): value is CborInt   => value.type === 'int';
export const isBytes = (value: CborValue): value is CborBytes => value.type === 'bytes';
export const isText  = (value: CborValue): value is CborText  => value.type === 'text';
export const isArray = (value: CborValue): value is CborArray => value.type === 'array';
export const isMap   = (value: CborValue): value is CborMap   => value.type === 'map';
export const isTag   = (value: CborValue): value is CborTag   => value.type === 'tag';
export const isFloat = (value: CborValue): value is CborFloat => value.type === 'float';

/** Whether `value` is the given tag. */
export const isTagged = (value: CborValue, tagNumber: bigint | number): value is CborTag =>
    value.type === 'tag' && value.tag === (typeof tagNumber === 'bigint' ? tagNumber : BigInt(tagNumber));
