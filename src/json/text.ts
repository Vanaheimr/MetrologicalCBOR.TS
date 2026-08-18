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
 * The exact path between CBOR and JSON: text on the JSON side, not a tree.
 *
 * JavaScript's native JSON tree cannot carry what this conversion has to
 * carry. A number is a double there, so `JSON.parse` rounds `1.10` to 1.1 and
 * 2^53+1 to 2^53 before any library sees a digit, and `JSON.stringify` cannot
 * write an integer beyond 2^53 back exactly. The specification
 * (metrological-text.md, Section 3) requires the digits as written in both
 * directions — so this module reads and writes JSON **text** with its own
 * number reader and writer, and the tree-based API of `to-json.ts` /
 * `from-json.ts` is the lossy convenience next to it.
 *
 * What this buys, concretely: integers of any size are exact JSON numbers,
 * decimal fractions keep their scale (`4([-2, 1999])` is `19.99` and comes
 * back as the very same bytes), a JSON `5.0` becomes the exact decimal
 * fraction `4([-1, 50])` rather than a binary float, and a float in the
 * document is written `1.0` — with the point — so it reads back as a decimal
 * fraction rather than an integer.
 */

import { McborError }                 from '../errors.js';
import { METROLOGICAL_VALUE_TAG }     from '../tag.js';
import { decode as decodeCbor }       from '../cbor/reader.js';
import { encode as encodeCbor }       from '../cbor/writer.js';
import type { CborEntry, CborValue }  from '../cbor/types.js';
import { bytesToHex }                 from '../cbor/hex.js';
import { metrologicalValueFromCbor }  from '../codec/decode.js';
import { metrologicalValueToCbor }    from '../codec/encode.js';
import { formatMetrologicalValue }    from '../text/format.js';
import { parseMetrologicalValue }     from '../text/parse.js';
import { toBase64Url, toJsonPointer } from './types.js';
import type { JsonPath }              from './types.js';
import type { ToJsonOptions }         from './to-json.js';
import type { FromJsonOptions }       from './from-json.js';

const TAG_UNSIGNED_BIGNUM  = 2n;
const TAG_NEGATIVE_BIGNUM  = 3n;
const TAG_DECIMAL_FRACTION = 4n;
const TAG_DATE_TIME        = 0n;
const TAG_EPOCH_TIME       = 1n;
const TAG_URI              = 32n;
const TAG_BASE64URL        = 33n;
const TAG_BASE64           = 34n;
const TAG_MIME_MESSAGE     = 36n;
const TAG_UUID             = 37n;
const TAG_SELF_DESCRIBED   = 55799n;

const MAX_DEPTH            = 64;
const MAX_DECIMAL_EXPONENT = 65536n;


// ---------------------------------------------------------------------------
// CBOR to JSON text
// ---------------------------------------------------------------------------

/**
 * Converts a CBOR document to JSON text, exactly.
 *
 * Every metrological value becomes one string in the metrological text
 * format; integers and decimal fractions become JSON numbers with their exact
 * digits, however large. The output follows metrological-text.md, Section 3.1.
 */
export function mcborToJsonText(input: Uint8Array | CborValue, options?: ToJsonOptions): string {

    const item = input instanceof Uint8Array
                     ? decodeCbor(input, options?.cbor ?? { strict: false })
                     : input;

    return write(item, [], options ?? {});

}


function write(item: CborValue, path: JsonPath, options: ToJsonOptions): string {

    if (path.length > MAX_DEPTH)
        throw unsupported(`The document is nested deeper than the allowed ${String(MAX_DEPTH)} levels.`, path);

    switch (item.type) {

        case 'text':
            return JSON.stringify(item.value);

        case 'bool':
            return item.value ? 'true' : 'false';

        case 'null':
            return 'null';

        case 'int':
            return item.value.toString();

        case 'float':
            return floatText(item.value, path, options);

        case 'bytes':
            return JSON.stringify(bytesText(item.value, path, options));

        case 'array':
            return `[${item.items.map((each, index) => write(each, [...path, index], options)).join(',')}]`;

        case 'map':
            return writeMap(item.entries, path, options);

        case 'tag':
            return writeTag(item.tag, item.value, path, options);

        case 'undefined':
            throw unsupported('The undefined value has no JSON counterpart.', path);

        case 'simple':
            throw unsupported(`The simple value ${String(item.value)} has no JSON counterpart.`, path);

    }

}


/**
 * A binary float as JSON text. It always carries a decimal point or an
 * exponent, so that it does not silently read back as an integer.
 */
function floatText(value: number, path: JsonPath, options: ToJsonOptions): string {

    if (options.floats === 'error')
        throw unsupported(`A binary floating-point number (${String(value)}) is not carried by this profile.`, path);

    if (!Number.isFinite(value))
        throw unsupported(`JSON cannot represent ${String(value)}.`, path);

    const text = String(value);

    return /[.eE]/.test(text) ? text : `${text}.0`;

}


function bytesText(value: Uint8Array, path: JsonPath, options: ToJsonOptions): string {

    switch (options.bytes ?? 'base64url') {
        case 'base64url': return toBase64Url(value);
        case 'hex':       return bytesToHex(value).toLowerCase();
        case 'error':     throw unsupported(`A byte string of ${String(value.length)} bytes is not carried by this profile.`, path);
    }

}


function writeMap(entries: readonly CborEntry[], path: JsonPath, options: ToJsonOptions): string {

    const names = new Set<string>();
    const parts: string[] = [];

    for (const [key, value] of entries) {

        const name = keyText(key, path, options);

        if (names.has(name))
            throw new McborError('ERR_JSON_KEY',
                                 `Two map keys become the same JSON name ${JSON.stringify(name)}${where(path)}.`);

        names.add(name);
        parts.push(`${JSON.stringify(name)}:${write(value, [...path, name], options)}`);

    }

    return `{${parts.join(',')}}`;

}


function keyText(key: CborValue, path: JsonPath, options: ToJsonOptions): string {

    if (key.type === 'text')
        return key.value;

    if (options.mapKeys !== 'stringify')
        throw new McborError('ERR_JSON_KEY',
                             `A map key of type ${key.type} cannot name a JSON member${where(path)}. ` +
                             'Set mapKeys to "stringify" to write it in diagnostic notation.');

    switch (key.type) {

        case 'int':   return key.value.toString();
        case 'bool':  return key.value ? 'true' : 'false';
        case 'null':  return 'null';
        case 'bytes': return `h'${bytesToHex(key.value).toLowerCase()}'`;

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


function writeTag(tag: bigint, value: CborValue, path: JsonPath, options: ToJsonOptions): string {

    // The one tag this library is about: one string in the text format.
    if (tag === BigInt(METROLOGICAL_VALUE_TAG)) {

        const reading = metrologicalValueFromCbor({ type: 'tag', tag, value }, {
            strict:   false,
            ...(options.registry === undefined ? {} : { registry: options.registry }),
        });

        return JSON.stringify(formatMetrologicalValue(reading, {
            ...options.text,
            ...(options.registry === undefined ? {} : { registry: options.registry }),
        }));

    }

    // Bignums are integers; the CBOR reader normally hands them over as such,
    // and this covers a reader that does not.
    if ((tag === TAG_UNSIGNED_BIGNUM || tag === TAG_NEGATIVE_BIGNUM) && value.type === 'int')
        return value.value.toString();

    // A decimal fraction outside a reading: a number, with its scale.
    if (tag === TAG_DECIMAL_FRACTION)
        return decimalFractionText(value, path);

    // Tag 0 passes through as the string it wraps.
    if (tag === TAG_DATE_TIME && value.type === 'text')
        return JSON.stringify(value.value);

    // Tag 1 becomes the instant it denotes, in UTC with millisecond
    // precision, so that every implementation writes the same text.
    if (tag === TAG_EPOCH_TIME && (value.type === 'int' || value.type === 'float'))
        return JSON.stringify(epochText(value, path));

    // A UUID.
    if (tag === TAG_UUID && value.type === 'bytes' && value.value.length === 16)
        return JSON.stringify(uuidText(value.value));

    // Text that is already text.
    if ((tag === TAG_URI || tag === TAG_BASE64URL || tag === TAG_BASE64 || tag === TAG_MIME_MESSAGE) &&
        value.type === 'text')
        return JSON.stringify(value.value);

    // Self-described CBOR is transparent.
    if (tag === TAG_SELF_DESCRIBED)
        return write(value, path, options);

    if (options.onUnknownTag !== undefined)
        return JSON.stringify(options.onUnknownTag(tag, value, path));

    throw unsupported(`Tag ${tag.toString()} is not carried by this profile. ` +
                      'Pass onUnknownTag to decide what it becomes.', path);

}


/** A decimal fraction as exact JSON number text, scale included. */
function decimalFractionText(value: CborValue, path: JsonPath): string {

    if (value.type !== 'array' || value.items.length !== 2 ||
        value.items[0]?.type !== 'int' || value.items[1]?.type !== 'int')
        throw unsupported('A decimal fraction whose content is not [exponent, mantissa].', path);

    const exponent = value.items[0].value;
    const mantissa = value.items[1].value;

    if (exponent > MAX_DECIMAL_EXPONENT || exponent < -MAX_DECIMAL_EXPONENT)
        throw unsupported(`A decimal exponent of ${exponent.toString()} is beyond what this profile reconstructs.`, path);

    if (exponent >= 0n)
        return (mantissa * 10n ** exponent).toString();

    const negative = mantissa < 0n;
    const digits   = (negative ? -mantissa : mantissa).toString().padStart(Number(-exponent) + 1, '0');
    const point    = digits.length - Number(-exponent);

    return `${negative ? '-' : ''}${digits.slice(0, point)}.${digits.slice(point)}`;

}


/** An epoch time as `YYYY-MM-DDThh:mm:ssZ` text with millisecond precision. */
function epochText(value: CborValue & { type: 'int' | 'float' }, path: JsonPath): string {

    const milliseconds = value.type === 'int'
                             ? value.value * 1000n
                             : BigInt(Math.trunc(value.value * 1000));

    // The range Date supports, ±8.64e15 ms around the epoch.
    if (milliseconds > 8640000000000000n || milliseconds < -8640000000000000n)
        throw unsupported(`An epoch time of ${String(value.value)} seconds is beyond the representable range.`, path);

    return new Date(Number(milliseconds)).toISOString();

}


function uuidText(bytes: Uint8Array): string {

    const hex = bytesToHex(bytes).toLowerCase();

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

}


// ---------------------------------------------------------------------------
// JSON text to CBOR
// ---------------------------------------------------------------------------

/**
 * Converts JSON text to CBOR bytes, exactly: every number keeps the digits it
 * was written with, and every string that reads as a metrological value
 * becomes tag 44252. The conversion follows metrological-text.md, Section 3.2.
 */
export function jsonTextToMcbor(text: string, options?: FromJsonOptions): Uint8Array {
    return encodeCbor(jsonTextToCbor(text, options));
}


/**
 * Converts JSON text to a CBOR item, for embedding in a larger one.
 */
export function jsonTextToCbor(text: string, options?: FromJsonOptions): CborValue {

    const parser = new JsonTextParser(text, options ?? {});
    const value  = parser.parseDocument();

    return value;

}


class JsonTextParser {

    private position = 0;

    public constructor(private readonly text:    string,
                       private readonly options: FromJsonOptions) {}


    public parseDocument(): CborValue {

        const value = this.parseValue([], 0);

        this.skipWhitespace();

        if (this.position < this.text.length)
            throw this.malformed('trailing content after the document');

        return value;

    }


    private parseValue(path: JsonPath, depth: number): CborValue {

        if (depth > MAX_DEPTH)
            throw new McborError('ERR_JSON_TYPE',
                                 `The JSON document is nested deeper than the allowed ${String(MAX_DEPTH)} levels.`);

        this.skipWhitespace();

        const character = this.text[this.position];

        switch (character) {

            case undefined:
                throw this.malformed('an unexpected end of the document');

            case '{': return this.parseObject(path, depth);
            case '[': return this.parseArray(path, depth);
            case '"': return this.parseStringValue(path);

            case 't':
                this.expect('true');
                return { type: 'bool', value: true };

            case 'f':
                this.expect('false');
                return { type: 'bool', value: false };

            case 'n':
                this.expect('null');
                return { type: 'null' };

            default:
                return this.parseNumber();

        }

    }


    private parseObject(path: JsonPath, depth: number): CborValue {

        this.position++;   // '{'
        this.skipWhitespace();

        const entries: CborEntry[] = [];

        if (this.text[this.position] === '}') {
            this.position++;
            return { type: 'map', entries };
        }

        for (;;) {

            this.skipWhitespace();

            if (this.text[this.position] !== '"')
                throw this.malformed('an object member without a name');

            const name = this.parseString();

            this.skipWhitespace();

            if (this.text[this.position] !== ':')
                throw this.malformed(`no ':' after the name ${JSON.stringify(name)}`);

            this.position++;

            entries.push([
                { type: 'text', value: name },
                this.parseValue([...path, name], depth + 1),
            ]);

            this.skipWhitespace();

            if (this.text[this.position] === ',') {
                this.position++;
                continue;
            }

            if (this.text[this.position] === '}') {
                this.position++;
                return { type: 'map', entries };
            }

            throw this.malformed(`no ',' or '}' after the member ${JSON.stringify(name)}`);

        }

    }


    private parseArray(path: JsonPath, depth: number): CborValue {

        this.position++;   // '['
        this.skipWhitespace();

        const items: CborValue[] = [];

        if (this.text[this.position] === ']') {
            this.position++;
            return { type: 'array', items };
        }

        for (;;) {

            items.push(this.parseValue([...path, items.length], depth + 1));

            this.skipWhitespace();

            if (this.text[this.position] === ',') {
                this.position++;
                continue;
            }

            if (this.text[this.position] === ']') {
                this.position++;
                return { type: 'array', items };
            }

            throw this.malformed(`no ',' or ']' after item ${String(items.length - 1)}`);

        }

    }


    private parseStringValue(path: JsonPath): CborValue {

        const text = this.parseString();

        return readingOrText(text, path, this.options);

    }


    /** A JSON string, unescaped. */
    private parseString(): string {

        this.position++;   // '"'

        let out = '';

        for (;;) {

            const character = this.text[this.position];

            if (character === undefined)
                throw this.malformed('an unterminated string');

            if (character === '"') {
                this.position++;
                return out;
            }

            if (character === '\\') {

                const escape = this.text[this.position + 1];
                this.position += 2;

                switch (escape) {

                    case '"':  out += '"';  break;
                    case '\\': out += '\\'; break;
                    case '/':  out += '/';  break;
                    case 'b':  out += '\b'; break;
                    case 'f':  out += '\f'; break;
                    case 'n':  out += '\n'; break;
                    case 'r':  out += '\r'; break;
                    case 't':  out += '\t'; break;

                    case 'u': {

                        const hex = this.text.slice(this.position, this.position + 4);

                        if (!/^[0-9A-Fa-f]{4}$/.test(hex))
                            throw this.malformed(`the escape \\u${hex}`);

                        out += String.fromCharCode(Number.parseInt(hex, 16));
                        this.position += 4;
                        break;

                    }

                    case undefined:
                    default:
                        throw this.malformed(`the escape \\${escape ?? ''}`);

                }

                continue;

            }

            if (character < ' ')
                throw this.malformed('an unescaped control character in a string');

            out += character;
            this.position++;

        }

    }


    /**
     * A JSON number, read from its digits as written: an integer becomes a
     * CBOR integer or a bignum, everything else an exact decimal fraction —
     * never a binary float. An exponent that leaves no decimal places
     * denotes the integer it equals.
     */
    private parseNumber(): CborValue {

        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.position));

        if (match === null)
            throw this.malformed(`the value beginning at position ${String(this.position)}`);

        const written  = match[0];
        this.position += written.length;

        if (!/[.eE]/.test(written))
            return { type: 'int', value: BigInt(written) };

        let digits   = written;
        let exponent = 0n;

        const e = /[eE]/.exec(digits);

        if (e !== null) {
            exponent = BigInt(digits.slice(e.index + 1));
            digits   = digits.slice(0, e.index);
        }

        const point = digits.indexOf('.');

        if (point >= 0) {
            exponent -= BigInt(digits.length - point - 1);
            digits    = digits.slice(0, point) + digits.slice(point + 1);
        }

        if (exponent > MAX_DECIMAL_EXPONENT || exponent < -MAX_DECIMAL_EXPONENT)
            throw new McborError('ERR_JSON_PRECISION',
                                 `The decimal exponent of '${written}' is beyond what this profile reconstructs.`);

        const mantissa = BigInt(digits);

        // A decimal fraction states decimal places and its exponent is
        // negative on the wire; anything else is the integer it equals.
        if (exponent >= 0n)
            return { type: 'int', value: mantissa * 10n ** exponent };

        return {
            type:  'tag',
            tag:   TAG_DECIMAL_FRACTION,
            value: {
                type:  'array',
                items: [
                    { type: 'int', value: exponent },
                    { type: 'int', value: mantissa },
                ],
            },
        };

    }


    private expect(literal: string): void {

        if (!this.text.startsWith(literal, this.position))
            throw this.malformed(`the value beginning at position ${String(this.position)}`);

        this.position += literal.length;

    }


    private skipWhitespace(): void {

        while (this.position < this.text.length && ' \t\n\r'.includes(this.text[this.position]!))
            this.position++;

    }


    private malformed(what: string): McborError {
        return new McborError('ERR_JSON_TYPE', `The JSON text is malformed: ${what}.`);
    }

}


/**
 * A string of a JSON document: a metrological value where it reads as one,
 * a text string otherwise. The same decision the tree-based conversion makes.
 */
function readingOrText(text: string, path: JsonPath, options: FromJsonOptions): CborValue {

    const detection = options.readings ?? 'auto';

    const candidate = detection === 'none'
                          ? false
                          : typeof detection === 'function'
                                ? detection(text, path)
                                : /^[+-]?\d|^\(/.test(text.trim());

    if (!candidate)
        return { type: 'text', value: text };

    try {
        return metrologicalValueToCbor(parseMetrologicalValue(text, {
            ...(options.registry === undefined ? {} : { registry: options.registry }),
        }));
    }
    catch (error) {

        // Where the caller said this *is* a reading, failing to read it is an
        // error rather than a reason to keep it as text.
        if (typeof options.readings === 'function')
            throw error;

        return { type: 'text', value: text };

    }

}


function unsupported(message: string, path: JsonPath): McborError {
    return new McborError('ERR_JSON_UNSUPPORTED', message + where(path));
}


function where(path: JsonPath): string {
    return path.length === 0 ? '' : ` at ${toJsonPointer(path)}`;
}
