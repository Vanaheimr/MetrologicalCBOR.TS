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
 * A whole document from JSON back to CBOR.
 *
 * The hard question here is not how to convert a string — it is **which**
 * strings are readings. JSON has no type for one, so something has to decide,
 * and each way of deciding is wrong in a different situation:
 *
 * - Trying every string against the grammar (`readings: 'auto'`, the default)
 *   recovers the document without being told anything, which is what makes the
 *   round trip work out of the box. Its hazard is a string that is prose and
 *   happens to read as a reading: a free-text field holding `"1 h"` becomes one
 *   hour.
 * - Converting nothing (`readings: 'none'`) is safe and useless on its own.
 * - A predicate decides per path, which is what an application with a schema
 *   should use, and what the hazard above calls for.
 *
 * The grammar is strict and anchored, so the hazard is narrow — `"about 1 h"`
 * and `"1 hour"` are not readings — but it is real, and naming it is better
 * than pretending the default is safe everywhere.
 */

import { McborError }               from '../errors.js';
import type { UnitRegistry }        from '../registry/index.js';
import { encode as encodeCbor }     from '../cbor/writer.js';
import type { CborEntry, CborValue } from '../cbor/types.js';
import { metrologicalValueToCbor }  from '../codec/encode.js';
import { parseMetrologicalValue }   from '../text/parse.js';
import { toJsonPointer }            from './types.js';
import type { JsonPath, JsonValue } from './types.js';


/**
 * Which strings of a JSON document are metrological values.
 *
 * `'auto'` tries every string against the grammar, `'none'` tries none, and a
 * predicate is asked for each one.
 */
export type ReadingDetection =
    | 'auto'
    | 'none'
    | ((text: string, path: JsonPath) => boolean);


export interface FromJsonOptions {

    /** The registry to resolve units against. Defaults to the standard one. */
    readonly registry?: UnitRegistry;

    /** Which strings are readings. Defaults to `'auto'`. */
    readonly readings?: ReadingDetection;

}


/**
 * Converts a JSON document to CBOR bytes, with every reading as tag 44252.
 */
export function jsonToMcbor(json: JsonValue, options?: FromJsonOptions): Uint8Array {
    return encodeCbor(jsonToCbor(json, options));
}


/**
 * Converts a JSON document to a CBOR item, for embedding in a larger one.
 */
export function jsonToCbor(json: JsonValue, options?: FromJsonOptions): CborValue {
    return convert(json, [], options ?? {});
}


function convert(json: JsonValue, path: JsonPath, options: FromJsonOptions): CborValue {

    if (json === null)
        return { type: 'null' };

    switch (typeof json) {

        case 'boolean':
            return { type: 'bool', value: json };

        case 'string':
            return convertString(json, path, options);

        case 'number':
            return convertNumber(json, path);

        case 'object':
            break;

        case 'bigint':
        case 'symbol':
        case 'undefined':
        case 'function':
            throw new McborError('ERR_JSON_TYPE',
                                 `A value of type ${typeof json} is not JSON${where(path)}.`);

    }

    if (Array.isArray(json))
        return {
            type:  'array',
            items: (json as readonly JsonValue[]).map((each, index) => convert(each, [...path, index], options)),
        };

    const entries: CborEntry[] = Object.entries(json as Record<string, JsonValue>)
        .map(([key, value]): CborEntry => [
            { type: 'text', value: key },
            convert(value, [...path, key], options),
        ]);

    return { type: 'map', entries };

}


function convertString(text: string, path: JsonPath, options: FromJsonOptions): CborValue {

    if (!looksLikeReading(text, path, options.readings ?? 'auto'))
        return { type: 'text', value: text };

    try {
        return metrologicalValueToCbor(parseMetrologicalValue(text, {
            ...(options.registry === undefined ? {} : { registry: options.registry }),
        }));
    }
    catch (error) {

        // Where the caller said this *is* a reading, failing to read it is an
        // error rather than a reason to keep it as text: they would otherwise
        // never learn that their document lost a measurement.
        if (typeof options.readings === 'function')
            throw error;

        // Under 'auto' the string was only a candidate, and most strings are
        // not readings.
        return { type: 'text', value: text };

    }

}


function looksLikeReading(text: string, path: JsonPath, detection: ReadingDetection): boolean {

    if (detection === 'none')
        return false;

    if (typeof detection === 'function')
        return detection(text, path);

    // Under 'auto', anything that starts like a number is worth trying. This
    // is a filter rather than a decision: the grammar makes the decision, and
    // it rejects far more than it accepts.
    return /^[+-]?\d|^\(/.test(text.trim());

}


function convertNumber(value: number, path: JsonPath): CborValue {

    if (!Number.isFinite(value))
        throw new McborError('ERR_JSON_TYPE',
                             `${String(value)} is not a JSON number${where(path)}.`);

    // An integer becomes an integer, which is what it was on the way out. A
    // number with a fractional part has to be a float: JSON gives no way to
    // say it was a decimal fraction, which is exactly why a reading is carried
    // as text rather than as a number.
    if (Number.isInteger(value) && !Object.is(value, -0))
        return { type: 'int', value: BigInt(value) };

    return { type: 'float', value, width: 8 };

}


function where(path: JsonPath): string {
    return path.length === 0 ? '' : ` at ${toJsonPointer(path)}`;
}
