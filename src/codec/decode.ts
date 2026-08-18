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
 * Reading a metrological value out of CBOR.
 *
 * The decoder is strict by default. Strict here means more than well-formed:
 * it means the bytes are the ones a conforming encoder would have produced for
 * this reading and no other, which is what specification Section 6 requires so
 * that a signature over the bytes is a signature over the quantity.
 *
 * Lenient mode accepts the spellings a strict decoder turns away and
 * normalises them, while still rejecting everything the specification calls an
 * error outright — an unknown unit, a float where a reading belongs, a prefix
 * that is not an SI prefix.
 */

import { ValueError }                        from '../errors.js';
import type { McborErrorCode }               from '../errors.js';
import { METROLOGICAL_VALUE_TAG }            from '../tag.js';
import { UnitRegistry }                      from '../registry/index.js';
import { decode as decodeCbor }              from '../cbor/reader.js';
import type { DecodeOptions }                from '../cbor/reader.js';
import type { CborValue }                    from '../cbor/types.js';
import { MAX_DECIMAL_EXPONENT, decimal, integer } from '../model/decimal.js';
import type { DecimalNumber }                from '../model/decimal.js';
import { assertSIPrefix, SIPrefix }          from '../model/prefix.js';
import {
    factor, unitById, unitBySymbol, unitExponent, unitProduct,
} from '../model/unit.js';
import type { NamedUnit, UnitExponent, UnitFactor, UnitRef } from '../model/unit.js';
import { distributionById, uncertainty }     from '../model/uncertainty.js';
import type { Uncertainty, UncertaintyDistribution } from '../model/uncertainty.js';
import { MetrologicalValue }                 from '../model/value.js';

const TAG_DECIMAL_FRACTION = 4n;
const TAG_BIGFLOAT         = 5n;

/**
 * A bigint that has already been bounded, as a number.
 *
 * The float ban this directory is under exists so that a magnitude cannot pass
 * through an IEEE 754 double and lose its decimal scale. That is not what
 * happens here: every caller checks the range first, and an integer inside it
 * converts exactly. Exponents, unit identifications and prefixes are `number`
 * in the model, so the conversion has to happen somewhere — and this is the
 * only place in the codec where it does.
 */
// eslint-disable-next-line no-restricted-syntax -- exact for a range-checked integer; see above
const bounded = (value: bigint): number => Number(value);

const KEY_MAGNITUDE            = 1n;
const KEY_COVERAGE_FACTOR      = 2n;
const KEY_COVERAGE_PROBABILITY = 3n;
const KEY_DISTRIBUTION         = 4n;
const KEY_DEGREES_OF_FREEDOM   = 5n;


export interface DecodeValueOptions {

    /**
     * Whether to require the encoding a conforming encoder would have
     * produced. Defaults to `true`.
     *
     * Strict mode additionally rejects a single named unit written as a
     * one-element product, and a prefix of 0 written where it could have been
     * omitted. Both are spellings the specification does not bless, and a
     * second spelling of the same reading would mean a second set of bytes to
     * sign.
     */
    readonly strict?: boolean;

    /**
     * The registry to resolve units against. Defaults to the standard one.
     *
     * Pass a registry extended with private-use units where the sender and the
     * receiver have agreed on some.
     */
    readonly registry?: UnitRegistry;

    /** Options passed through to the CBOR decoder when decoding bytes. */
    readonly cbor?: DecodeOptions;

}


/**
 * Reads a metrological value from CBOR bytes.
 *
 * @throws {CborError} if the bytes are not well-formed CBOR, or not the
 *         deterministic encoding of it in strict mode.
 * @throws {ValueError} if they are well-formed CBOR but not a metrological
 *         value the specification permits.
 * @throws {UnitError} if the unit is not registered.
 */
export function decodeMetrologicalValue(bytes:    Uint8Array,
                                        options?: DecodeValueOptions): MetrologicalValue
{

    const strict = options?.strict ?? true;

    const item = decodeCbor(bytes, { strict, ...options?.cbor });

    return metrologicalValueFromCbor(item, options);

}


/**
 * Reads a metrological value from an already-decoded CBOR item.
 *
 * This is the entry point for a value found inside a larger document, where
 * the surrounding structure has been decoded already.
 */
export function metrologicalValueFromCbor(item:     CborValue,
                                          options?: DecodeValueOptions): MetrologicalValue
{

    const strict   = options?.strict ?? true;
    const registry = options?.registry ?? UnitRegistry.standard;

    if (item.type !== 'tag' || item.tag !== BigInt(METROLOGICAL_VALUE_TAG))
        throw new ValueError('ERR_TAG_MISMATCH',
                             `Expected tag ${String(METROLOGICAL_VALUE_TAG)}, found ${describe(item)}.`,
                             { clause: '3' });

    if (item.value.type !== 'array')
        throw new ValueError('ERR_ARITY',
                             `The content of tag ${String(METROLOGICAL_VALUE_TAG)} is ${describe(item.value)}, not an array.`,
                             { clause: '3' });

    const items = item.value.items;

    // "The tag content MUST be an array of two, three or four data items.
    //  Any other length is an error."
    if (items.length < 2 || items.length > 4)
        throw new ValueError('ERR_ARITY',
                             `The content of tag ${String(METROLOGICAL_VALUE_TAG)} has ${String(items.length)} items; it must have two, three or four.`,
                             { clause: '3' });

    const value = readNumber(items[0]!, 'the reading');
    const unit  = readUnit(items[1]!, registry, strict);

    const hasUncertainty = items.length === 4;
    const prefix         = items.length >= 3 ? readPrefix(items[2]!) : SIPrefix.None;

    // Section 3.3 requires the prefix to be written when an uncertainty
    // follows it. Writing it anyway where it is 0 and nothing follows gives a
    // second encoding of the same reading, which Section 6 does not allow.
    if (strict && items.length === 3 && prefix === SIPrefix.None)
        throw new ValueError('ERR_PREFIX_REDUNDANT',
                             'A prefix of 0 is written although it could have been omitted, which gives the same reading two encodings.',
                             { clause: '6' });

    return new MetrologicalValue({
        value,
        unit,
        prefix,
        uncertainty: hasUncertainty ? readUncertainty(items[3]!, strict) : undefined,
    });

}


// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

/**
 * An integer or a decimal fraction, and nothing else.
 *
 * A binary float is rejected rather than converted: it can represent neither
 * `0.1` exactly nor a decimal scale at all, so accepting one would mean
 * inventing a resolution the instrument never reported.
 */
function readNumber(item: CborValue, what: string): DecimalNumber {

    if (item.type === 'int')
        return integer(item.value);

    if (item.type === 'float')
        throw new ValueError('ERR_VALUE_FLOAT',
                             `${what} is a binary floating-point number, which cannot carry a decimal scale.`,
                             { clause: '3.1' });

    if (item.type === 'tag' && item.tag === TAG_BIGFLOAT)
        throw new ValueError('ERR_VALUE_BIGFLOAT',
                             `${what} is a bigfloat, which the specification excludes.`,
                             { clause: '3.1' });

    if (item.type !== 'tag' || item.tag !== TAG_DECIMAL_FRACTION)
        throw new ValueError('ERR_VALUE_TYPE',
                             `${what} is ${describe(item)}; it must be an integer or a decimal fraction.`,
                             { clause: '3.1' });

    if (item.value.type !== 'array' || item.value.items.length !== 2)
        throw new ValueError('ERR_VALUE_TYPE',
                             `${what} is a decimal fraction whose content is not a pair.`,
                             { clause: '3.1' });

    const [exponentItem, mantissaItem] = item.value.items;

    if (exponentItem?.type !== 'int')
        throw new ValueError('ERR_VALUE_TYPE',
                             `${what} has a decimal exponent that is not an integer.`,
                             { clause: '3.1' });

    if (mantissaItem?.type !== 'int')
        throw new ValueError('ERR_VALUE_TYPE',
                             `${what} has a mantissa that is not an integer.`,
                             { clause: '3.1' });

    const exponent = toExponent(exponentItem.value, what);

    // A decimal fraction states decimal places, so its exponent is negative
    // on the wire; an integral reading is written as an integer (Section 3.1).
    if (exponent >= 0)
        throw new ValueError('ERR_VALUE_TYPE',
                             `${what} is a decimal fraction with the non-negative exponent ${String(exponent)}; an integral reading is written as an integer.`,
                             { clause: '3.1' });

    return decimal(mantissaItem.value, exponent);

}


/** A decimal exponent, bounded so that reconstructing it cannot run away. */
function toExponent(value: bigint, what: string): number {

    const magnitude = value < 0n ? -value : value;

    if (magnitude > BigInt(MAX_DECIMAL_EXPONENT))
        throw new ValueError('ERR_VALUE_EXPONENT_RANGE',
                             `${what} has a decimal exponent of ${String(value)}, beyond the supported range.`,
                             { clause: '7' });

    return bounded(value);

}


// ---------------------------------------------------------------------------
// The unit
// ---------------------------------------------------------------------------

function readUnit(item: CborValue, registry: UnitRegistry, strict: boolean): UnitRef {

    if (item.type === 'array')
        return readProduct(item.items, registry, strict);

    return readNamedUnit(item, registry);

}


function readNamedUnit(item: CborValue, registry: UnitRegistry): NamedUnit {

    if (item.type === 'int') {

        if (item.value < 0n || item.value > 0xFFFFn)
            throw new ValueError('ERR_UNIT_ID_OUT_OF_RANGE',
                                 `The unit identification ${String(item.value)} is outside the valid range.`,
                                 { clause: '3.2' });

        return unitById(bounded(item.value), registry);

    }

    if (item.type === 'text')
        return unitBySymbol(item.value, registry);

    throw new ValueError('ERR_VALUE_TYPE',
                         `A named unit is ${describe(item)}; it must be an identification or a symbol.`,
                         { clause: '3.2' });

}


function readProduct(items: readonly CborValue[], registry: UnitRegistry, strict: boolean): UnitRef {

    if (items.length === 0)
        throw new ValueError('ERR_UNIT_PRODUCT_EMPTY',
                             'A product of powers has no factors.',
                             { clause: '3.2' });

    const factors: UnitFactor[] = items.map(each => {

        if (each.type !== 'array' || each.items.length !== 2)
            throw new ValueError('ERR_VALUE_TYPE',
                                 `A factor of a product is ${describe(each)}; it must be a unit and an exponent.`,
                                 { clause: '3.2' });

        return factor(readNamedUnit(each.items[0]!, registry),
                      readExponent(each.items[1]!, strict));

    });

    // A single unit to the first power is a named unit. An encoder must never
    // write the one-element array, so strict mode refuses to read one;
    // lenient mode takes it as the named unit it denotes.
    const only = factors.length === 1 ? factors[0] : undefined;

    if (only?.exponent.kind === 'integer' && only.exponent.value === 1) {

        if (strict)
            throw new ValueError('ERR_UNIT_SINGLE_AS_PRODUCT',
                                 `A single ${only.unit.unit.name} to the first power is written as a one-element product; the named form is the one an encoder writes.`,
                                 { clause: '3.2' });

        return only.unit;

    }

    return unitProduct(factors);

}


/**
 * An integer power, or a rational one.
 *
 * A rational whose denominator reduces to one becomes the integer form, so
 * `[2, 1]` and `2` are the same exponent rather than two spellings of it — as
 * are `[-2, 4]` and `[-1, 2]`.
 *
 * Which is precisely why strict mode will not read the unreduced spelling.
 * Section 3.2 requires lowest terms and Section 6 requires the encoding to be a
 * function of the reading alone, so `[20, 2]` is not something a conforming
 * encoder produces. Reading it and silently writing `10` back would give one
 * reading two encodings, and a signature is over bytes: a verifier that
 * re-encoded what it read would find the document no longer matched.
 */
function readExponent(item: CborValue, strict: boolean): UnitExponent {

    if (item.type === 'int')
        return unitExponent(toSmallInteger(item.value, 'A unit exponent', 'ERR_UNIT_EXPONENT_DENOMINATOR', '3.2'));

    if (item.type !== 'array' || item.items.length !== 2)
        throw new ValueError('ERR_VALUE_TYPE',
                             `A unit exponent is ${describe(item)}; it must be an integer or a numerator and a denominator.`,
                             { clause: '3.2' });

    const [numerator, denominator] = item.items;

    if (numerator?.type !== 'int' || denominator?.type !== 'int')
        throw new ValueError('ERR_VALUE_TYPE',
                             'A rational unit exponent has a part that is not an integer.',
                             { clause: '3.2' });

    const written  = [toSmallInteger(numerator.value,   'A unit exponent numerator',   'ERR_UNIT_EXPONENT_DENOMINATOR', '3.2'),
                      toSmallInteger(denominator.value, 'A unit exponent denominator', 'ERR_UNIT_EXPONENT_DENOMINATOR', '3.2')] as const;

    const exponent = unitExponent(written[0], written[1]);

    if (strict && (exponent.kind === 'integer' ||
                   exponent.numerator   !== written[0] ||
                   exponent.denominator !== written[1]))
        throw new ValueError('ERR_UNIT_EXPONENT_NOT_REDUCED',
                             `The unit exponent ${String(written[0])}/${String(written[1])} is not in lowest terms; ` +
                             `${exponent.kind === 'integer' ? String(exponent.value) : `${String(exponent.numerator)}/${String(exponent.denominator)}`} is the form an encoder writes.`,
                             { clause: '3.2' });

    return exponent;

}


/**
 * A bigint small enough to reason about as a number.
 *
 * The code is the caller's, because the four things read through here — a unit
 * exponent, its numerator, its denominator, an SI prefix, a distribution — fail
 * for four different reasons, and a prefix of 2^60 reported as a fault in the
 * denominator of a unit exponent would send the reader to the wrong clause.
 */
function toSmallInteger(value: bigint, what: string, code: McborErrorCode, clause: string): number {

    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
        throw new ValueError(code,
                             `${what} of ${String(value)} is beyond what this implementation reconstructs.`,
                             { clause });

    return bounded(value);

}


// ---------------------------------------------------------------------------
// The prefix
// ---------------------------------------------------------------------------

function readPrefix(item: CborValue): number {

    if (item.type !== 'int')
        throw new ValueError('ERR_PREFIX_INVALID',
                             `The SI prefix is ${describe(item)}; it must be an integer.`,
                             { clause: '3.3' });

    const exponent = toSmallInteger(item.value, 'An SI prefix', 'ERR_PREFIX_INVALID', '3.3');

    assertSIPrefix(exponent);

    return exponent;

}


// ---------------------------------------------------------------------------
// The uncertainty
// ---------------------------------------------------------------------------

function readUncertainty(item: CborValue, strict: boolean): Uncertainty {

    if (item.type !== 'map')
        return uncertainty({ magnitude: readNumber(item, 'The measurement uncertainty') });

    let magnitude:           DecimalNumber | undefined;
    let coverageFactor:      DecimalNumber | undefined;
    let coverageProbability: DecimalNumber | undefined;
    let distribution:        UncertaintyDistribution | undefined;
    let degreesOfFreedom:    DecimalNumber | undefined;

    for (const [key, value] of item.entries) {

        if (key.type !== 'int')
            throw new ValueError('ERR_UNCERTAINTY_UNKNOWN_KEY',
                                 `An uncertainty map has a key that is ${describe(key)}; its keys are small integers.`,
                                 { clause: '3.4' });

        switch (key.value) {

            case KEY_MAGNITUDE:
                magnitude = readNumber(value, 'The uncertainty magnitude');
                break;

            case KEY_COVERAGE_FACTOR:
                coverageFactor = readNumber(value, 'The coverage factor');
                break;

            case KEY_COVERAGE_PROBABILITY:
                coverageProbability = readNumber(value, 'The coverage probability');
                break;

            case KEY_DISTRIBUTION:
                if (value.type !== 'int')
                    throw new ValueError('ERR_UNCERTAINTY_DISTRIBUTION',
                                         `The probability distribution is ${describe(value)}; it must be an identification.`,
                                         { clause: '3.4' });
                distribution = distributionById(toSmallInteger(value.value, 'A probability distribution', 'ERR_UNCERTAINTY_DISTRIBUTION', '3.4'));
                break;

            case KEY_DEGREES_OF_FREEDOM:
                degreesOfFreedom = readNumber(value, 'The effective degrees of freedom');
                break;

            default:
                // Rejected rather than ignored: an uncertainty this library
                // only partly understands is not one it should pass on as
                // though it understood all of it.
                throw new ValueError('ERR_UNCERTAINTY_UNKNOWN_KEY',
                                     `An uncertainty map holds the key ${String(key.value)}, which this version of the specification does not define.`,
                                     { clause: '3.4' });

        }

    }

    if (magnitude === undefined)
        throw new ValueError('ERR_UNCERTAINTY_NO_MAGNITUDE',
                             'An uncertainty map has no magnitude, which is the one required key.',
                             { clause: '3.4' });

    // A map holding nothing but a magnitude says exactly what a bare number
    // says, and Section 6 does not allow one uncertainty two encodings.
    if (strict && item.entries.length === 1)
        throw new ValueError('ERR_UNCERTAINTY_REDUNDANT_MAP',
                             'An uncertainty map states nothing a bare number could not, which gives the same uncertainty two encodings.',
                             { clause: '6' });

    return uncertainty({
        magnitude,
        coverageFactor,
        coverageProbability,
        distribution,
        degreesOfFreedom,
    });

}


// ---------------------------------------------------------------------------

/** A short description of a data item, for an error message. */
function describe(item: CborValue): string {

    switch (item.type) {
        case 'int':       return `the integer ${String(item.value)}`;
        case 'float':     return `the floating-point number ${String(item.value)}`;
        case 'text':      return `the text ${JSON.stringify(item.value)}`;
        case 'bytes':     return 'a byte string';
        case 'array':     return `an array of ${String(item.items.length)} items`;
        case 'map':       return `a map of ${String(item.entries.length)} pairs`;
        case 'tag':       return `tag ${String(item.tag)}`;
        case 'bool':      return String(item.value);
        case 'null':      return 'null';
        case 'undefined': return 'undefined';
        case 'simple':    return `the simple value ${String(item.value)}`;
    }

}
