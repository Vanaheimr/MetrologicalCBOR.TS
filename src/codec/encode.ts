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
 * Writing a metrological value as CBOR.
 *
 * The encoding of a reading is a function of its value, scale, unit, prefix
 * and uncertainty and of nothing else, which is what makes measurement data
 * signable: the same reading always produces the same bytes and therefore the
 * same signature.
 *
 * One thing the encoder deliberately does *not* normalise is the reading
 * itself. Encoders should write an integral reading as a plain integer, but
 * that is advice for an instrument writing down what it just measured, not
 * licence to rewrite a reading that arrived as `4([0, 5])`. The decimal scale
 * is part of the datum and survives untouched.
 */

import { METROLOGICAL_VALUE_TAG }  from '../tag.js';
import { encode as encodeCbor }    from '../cbor/writer.js';
import type { CborEntry, CborValue } from '../cbor/types.js';
import { exponentOf, mantissaOf }  from '../model/decimal.js';
import type { DecimalNumber }      from '../model/decimal.js';
import { SIPrefix }                from '../model/prefix.js';
import { DISTRIBUTION_IDS }        from '../model/uncertainty.js';
import type { Uncertainty }        from '../model/uncertainty.js';
import type { NamedUnit, UnitExponent, UnitRef } from '../model/unit.js';
import type { MetrologicalValue }  from '../model/value.js';

const TAG_DECIMAL_FRACTION = 4;


export interface EncodeValueOptions {

    /**
     * How to spell what the specification allows to be spelled two ways.
     *
     * `'canonical'` (the default) writes every unit by its numeric
     * identification, which is what encoders should do and what stays cheap on
     * the wire. `'preserve'` writes each unit the way it was decoded, which is
     * what re-serialising a document byte for byte needs — a symbolic unit is
     * discouraged but legal, and a signature over it must survive.
     */
    readonly units?: 'canonical' | 'preserve';

}


/**
 * Writes a metrological value as CBOR bytes.
 */
export function encodeMetrologicalValue(value:    MetrologicalValue,
                                        options?: EncodeValueOptions): Uint8Array
{
    return encodeCbor(metrologicalValueToCbor(value, options));
}


/**
 * Writes a metrological value as a CBOR item, for embedding in a document.
 */
export function metrologicalValueToCbor(value:    MetrologicalValue,
                                        options?: EncodeValueOptions): CborValue
{

    const preserveUnits = options?.units === 'preserve';

    const items: CborValue[] = [
        writeNumber(value.value),
        writeUnit(value.unit, preserveUnits),
    ];

    // The array is positional, so an uncertainty forces the prefix to be
    // written even where it is 0 (Section 3.3). Where nothing follows it, a
    // prefix of 0 is left out: writing it would give the same reading a second
    // encoding, which Section 6 does not allow.
    if (value.uncertainty !== undefined) {
        items.push({ type: 'int', value: BigInt(value.prefix) });
        items.push(writeUncertainty(value.uncertainty));
    }
    else if (value.prefix !== SIPrefix.None) {
        items.push({ type: 'int', value: BigInt(value.prefix) });
    }

    return {
        type:  'tag',
        tag:   BigInt(METROLOGICAL_VALUE_TAG),
        value: { type: 'array', items },
    };

}


// ---------------------------------------------------------------------------

function writeNumber(value: DecimalNumber): CborValue {

    if (value.kind === 'int')
        return { type: 'int', value: value.value };

    return {
        type:  'tag',
        tag:   BigInt(TAG_DECIMAL_FRACTION),
        value: {
            type:  'array',
            items: [
                { type: 'int', value: BigInt(exponentOf(value)) },
                { type: 'int', value: mantissaOf(value) },
            ],
        },
    };

}


function writeUnit(unit: UnitRef, preserve: boolean): CborValue {

    if (unit.kind === 'named')
        return writeNamedUnit(unit, preserve);

    return {
        type:  'array',
        items: unit.factors.map(each => ({
            type:  'array' as const,
            items: [writeNamedUnit(each.unit, preserve), writeExponent(each.exponent)],
        })),
    };

}


function writeNamedUnit(unit: NamedUnit, preserve: boolean): CborValue {

    return preserve && unit.written.form === 'symbol'
               ? { type: 'text', value: unit.written.spelling }
               : { type: 'int',  value: BigInt(unit.unit.id) };

}


function writeExponent(exponent: UnitExponent): CborValue {

    if (exponent.kind === 'integer')
        return { type: 'int', value: BigInt(exponent.value) };

    return {
        type:  'array',
        items: [
            { type: 'int', value: BigInt(exponent.numerator) },
            { type: 'int', value: BigInt(exponent.denominator) },
        ],
    };

}


function writeUncertainty(value: Uncertainty): CborValue {

    // A bare number is the compact form and says everything a magnitude alone
    // can say. Anything more needs the map.
    if (value.form === 'bare')
        return writeNumber(value.magnitude);

    const entries: CborEntry[] = [
        [{ type: 'int', value: 1n }, writeNumber(value.magnitude)],
    ];

    if (value.coverageFactor !== undefined)
        entries.push([{ type: 'int', value: 2n }, writeNumber(value.coverageFactor)]);

    if (value.coverageProbability !== undefined)
        entries.push([{ type: 'int', value: 3n }, writeNumber(value.coverageProbability)]);

    if (value.distribution !== undefined)
        entries.push([{ type: 'int', value: 4n }, { type: 'int', value: BigInt(DISTRIBUTION_IDS[value.distribution]) }]);

    if (value.degreesOfFreedom !== undefined)
        entries.push([{ type: 'int', value: 5n }, writeNumber(value.degreesOfFreedom)]);

    return { type: 'map', entries };

}
