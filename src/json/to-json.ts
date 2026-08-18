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
 * A whole document from CBOR to JSON.
 *
 * Every metrological value becomes one string — `"1234.567 kWh"` — and
 * everything else takes the JSON form it ordinarily would. That division is
 * the point: the reading is the thing JSON cannot express, so it gets the text
 * format; a timestamp or a meter identification is a string in JSON anyway and
 * has no reason to be treated specially.
 *
 * What JSON cannot hold **exactly** is an error rather than a rounding. An
 * integer beyond 2^53 is the case that actually arises — nanosecond timestamps
 * pass it — and quietly turning one into the nearest double is precisely the
 * kind of silent corruption this library exists to avoid.
 */

import { McborError }                 from '../errors.js';
import { METROLOGICAL_VALUE_TAG }     from '../tag.js';
import type { UnitRegistry }          from '../registry/index.js';
import { decode as decodeCbor }       from '../cbor/reader.js';
import type { DecodeOptions }         from '../cbor/reader.js';
import type { CborValue }             from '../cbor/types.js';
import { bytesToHex }                 from '../cbor/hex.js';
import { metrologicalValueFromCbor }  from '../codec/decode.js';
import { formatMetrologicalValue }    from '../text/format.js';
import type { FormatOptions }         from '../text/format.js';
import { toBase64Url, toJsonPointer } from './types.js';
import type { JsonPath, JsonValue }   from './types.js';

const TAG_DATE_TIME  = 0n;
const TAG_EPOCH_TIME = 1n;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);


export interface ToJsonOptions {

    /** The registry to resolve units against. Defaults to the standard one. */
    readonly registry?: UnitRegistry;

    /** How the readings are written. Defaults to the canonical spelling. */
    readonly text?: FormatOptions;

    /**
     * What to do with a byte string.
     *
     * `'base64url'` (the default) is what JSON conventionally does with bytes.
     * It is one-way: a base64url string is indistinguishable from a text
     * string that happens to look like one, so a document containing byte
     * strings does not come back byte-identical.
     */
    readonly bytes?: 'base64url' | 'hex' | 'error';

    /**
     * What to do with an integer outside the range JSON holds exactly.
     *
     * `'error'` (the default) refuses; `'string'` writes the digits as a
     * string, which is one-way. There is no option to round, because rounding
     * a measurement's neighbouring data is the failure this library is for.
     */
    readonly bigIntegers?: 'error' | 'string';

    /**
     * What to do with a binary floating-point number outside a reading.
     *
     * `'number'` (the default) passes it through. It is one-way: JSON does not
     * distinguish a float from an integer, so `1.0` comes back as the integer
     * 1. Inside a reading a float is always an error, whatever this says.
     */
    readonly floats?: 'number' | 'error';

    /**
     * What to do with a map key that is not text.
     *
     * `'error'` (the default) refuses; `'stringify'` writes the key in
     * diagnostic notation, which is one-way.
     */
    readonly mapKeys?: 'error' | 'stringify';

    /**
     * What to do with a tag this profile does not cover.
     *
     * Tags 0 and 1 are dates and pass through as the string and the number
     * they wrap. Anything else reaches this hook, and without one it is an
     * error — a tag changes what the data means, and dropping it would change
     * the document without saying so.
     */
    readonly onUnknownTag?: (tag: bigint, value: CborValue, path: JsonPath) => JsonValue;

    /** Options passed through to the CBOR decoder when decoding bytes. */
    readonly cbor?: DecodeOptions;

}


/**
 * Converts a CBOR document to JSON, with every metrological value as one
 * string.
 *
 * @example
 * ```ts
 * mcborToJson(meterReading);
 * // {
 * //   meter:       '1ISA0000000042',
 * //   transaction: 'a4f1c9e2',
 * //   context:     'Transaction.Begin',
 * //   time:        '2026-08-15T08:14:00Z',
 * //   energy:      '(1234.567 ±12.3) kWh, k=2, p=0.95, dist=normal'
 * // }
 * ```
 */
export function mcborToJson(input: Uint8Array | CborValue, options?: ToJsonOptions): JsonValue {

    const item = input instanceof Uint8Array
                     ? decodeCbor(input, options?.cbor ?? { strict: false })
                     : input;

    return convert(item, [], options ?? {});

}


function convert(item: CborValue, path: JsonPath, options: ToJsonOptions): JsonValue {

    switch (item.type) {

        case 'text':
            return item.value;

        case 'bool':
            return item.value;

        case 'null':
            return null;

        case 'int':
            return convertInteger(item.value, path, options);

        case 'float':
            return convertFloat(item.value, path, options);

        case 'bytes':
            return convertBytes(item.value, path, options);

        case 'array':
            return item.items.map((each, index) => convert(each, [...path, index], options));

        case 'map':
            return convertMap(item.entries, path, options);

        case 'tag':
            return convertTag(item.tag, item.value, path, options);

        case 'undefined':
            throw unsupported('The undefined value has no JSON counterpart.', path);

        case 'simple':
            throw unsupported(`The simple value ${String(item.value)} has no JSON counterpart.`, path);

    }

}


function convertInteger(value: bigint, path: JsonPath, options: ToJsonOptions): JsonValue {

    if (value <= MAX_SAFE && value >= MIN_SAFE)
        return Number(value);

    if (options.bigIntegers === 'string')
        return value.toString();

    throw new McborError('ERR_JSON_PRECISION',
                         `The integer ${value.toString()} is outside the range JSON holds exactly${where(path)}. ` +
                         'Set bigIntegers to "string" to carry it as digits.');

}


function convertFloat(value: number, path: JsonPath, options: ToJsonOptions): JsonValue {

    if (options.floats === 'error')
        throw unsupported(`A binary floating-point number (${String(value)}) is not carried by this profile.`, path);

    // JSON has no way to write these at all, whatever the option says.
    if (!Number.isFinite(value))
        throw unsupported(`JSON cannot represent ${String(value)}.`, path);

    return value;

}


function convertBytes(value: Uint8Array, path: JsonPath, options: ToJsonOptions): JsonValue {

    switch (options.bytes ?? 'base64url') {
        case 'base64url': return toBase64Url(value);
        case 'hex':       return bytesToHex(value);
        case 'error':     throw unsupported(`A byte string of ${String(value.length)} bytes is not carried by this profile.`, path);
    }

}


function convertMap(entries: readonly (readonly [CborValue, CborValue])[],
                    path:    JsonPath,
                    options: ToJsonOptions): JsonValue
{

    const out: Record<string, JsonValue> = {};

    for (const [key, value] of entries) {

        const name = keyOf(key, path, options);

        // A duplicate would silently drop an entry, which the CBOR layer
        // refuses to do and this layer has no business doing either.
        if (Object.hasOwn(out, name))
            throw new McborError('ERR_JSON_KEY',
                                 `Two map keys become the same JSON name ${JSON.stringify(name)}${where(path)}.`);

        out[name] = convert(value, [...path, name], options);

    }

    return out;

}


function keyOf(key: CborValue, path: JsonPath, options: ToJsonOptions): string {

    if (key.type === 'text')
        return key.value;

    if (options.mapKeys !== 'stringify')
        throw new McborError('ERR_JSON_KEY',
                             `A map key of type ${key.type} cannot name a JSON member${where(path)}. ` +
                             'Set mapKeys to "stringify" to write it in diagnostic notation.');

    // Written the way the diagnostic notation would, which at least says what
    // the key was rather than pretending it was text.
    switch (key.type) {

        case 'int':   return key.value.toString();
        case 'bool':  return key.value ? 'true' : 'false';
        case 'null':  return 'null';
        case 'bytes': return `h'${bytesToHex(key.value).toLowerCase()}'`;

        // A container or a tag as a key is well-formed CBOR and has no
        // readable name at all, so even stringifying it would be an invention.
        case 'array':
        case 'map':
        case 'tag':
        case 'float':
        case 'simple':
        case 'undefined':
            throw new McborError('ERR_JSON_KEY',
                                 `A map key of type ${key.type} cannot name a JSON member${where(path)}.`);

    }

}


function convertTag(tag:     bigint,
                    value:   CborValue,
                    path:    JsonPath,
                    options: ToJsonOptions): JsonValue
{

    // The one tag this library is about.
    if (tag === BigInt(METROLOGICAL_VALUE_TAG)) {

        const reading = metrologicalValueFromCbor({ type: 'tag', tag, value }, {
            strict:   false,
            ...(options.registry === undefined ? {} : { registry: options.registry }),
        });

        return formatMetrologicalValue(reading, {
            ...options.text,
            ...(options.registry === undefined ? {} : { registry: options.registry }),
        });

    }

    // A date is a string in JSON anyway, so it passes through as what it wraps.
    if ((tag === TAG_DATE_TIME || tag === TAG_EPOCH_TIME) &&
        (value.type === 'text' || value.type === 'int' || value.type === 'float'))
        return convert(value, path, options);

    if (options.onUnknownTag !== undefined)
        return options.onUnknownTag(tag, value, path);

    throw unsupported(`Tag ${tag.toString()} is not carried by this profile. ` +
                      'Pass onUnknownTag to decide what it becomes.', path);

}


function unsupported(message: string, path: JsonPath): McborError {
    return new McborError('ERR_JSON_UNSUPPORTED', message + where(path));
}


function where(path: JsonPath): string {
    return path.length === 0 ? '' : ` at ${toJsonPointer(path)}`;
}
