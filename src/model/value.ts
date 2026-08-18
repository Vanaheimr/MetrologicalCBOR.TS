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
 * A metrological value: a quantity value with its unit of measure, its SI
 * prefix and its measurement uncertainty.
 *
 * That is all it is. The kind of quantity — `N*m` and `J` have the same
 * dimension but are torque and energy — the instant of measurement, the
 * instrument, the calibration certificate and the operator all belong to the
 * structure carrying the value, not to the value. This is a division of
 * labour rather than an omission: a value that also carried provenance would
 * be unusable as the leaf of somebody else's schema.
 *
 * @see The specification, Sections 3 and 6a
 */

import { ValueError }             from '../errors.js';
import { assertSIPrefix, SIPrefix } from './prefix.js';
import {
    equalsExact, exponentOf, formatDecimal, mantissaOf,
} from './decimal.js';
import type { DecimalNumber }     from './decimal.js';
import { isAffine, sameUnitQuantity, sameUnitRepresentation } from './unit.js';
import type { UnitRef }           from './unit.js';
import { sameUncertaintyRepresentation } from './uncertainty.js';
import type { Uncertainty }       from './uncertainty.js';


export interface MetrologicalValueOptions {

    /** The reading, scaled by the prefix and expressed in the unit. */
    readonly value: DecimalNumber;

    /** The unit of measure. */
    readonly unit: UnitRef;

    /** The decimal power of the SI prefix. Defaults to none. */
    readonly prefix?: number;

    /**
     * The measurement uncertainty, in the same unit and prefix as the reading.
     *
     * Its absence means "not stated". It never means zero. An explicit
     * `undefined` says the same thing as omitting it, which is what a decoder
     * with an optional field in hand needs.
     */
    readonly uncertainty?: Uncertainty | undefined;

}


/**
 * The parts of a reading that {@link MetrologicalValue.with} may replace.
 *
 * Passing `uncertainty: undefined` explicitly drops the uncertainty, whereas
 * leaving the property out keeps whatever the original had — the difference
 * between "not stated" and "unchanged".
 */
export interface MetrologicalValueChanges {
    readonly value?:       DecimalNumber;
    readonly unit?:        UnitRef;
    readonly prefix?:      number;
    readonly uncertainty?: Uncertainty | undefined;
}


/**
 * A quantity value with its unit, prefix and uncertainty.
 *
 * Immutable. Construct it with {@link metrologicalValue}, which validates.
 */
export class MetrologicalValue {

    /** The reading, exactly as it was reported, decimal scale included. */
    readonly value: DecimalNumber;

    /** The unit of measure. */
    readonly unit: UnitRef;

    /**
     * The decimal power of the SI prefix: 3 for kilo, -3 for milli.
     *
     * It scales the quantity as a whole, not an individual factor of a
     * compound unit: a reading of `1` at prefix 3 in `m*s^-2` is `1 km*s^-2`,
     * not `1 m*(ks)^-2`.
     */
    readonly prefix: number;

    /**
     * The measurement uncertainty, or `undefined` where none was stated.
     *
     * `undefined` means "not stated". It does not mean zero, and no consumer
     * may treat it as such.
     */
    readonly uncertainty: Uncertainty | undefined;


    constructor(options: MetrologicalValueOptions) {

        const prefix = options.prefix ?? SIPrefix.None;

        assertSIPrefix(prefix);

        this.value       = options.value;
        this.unit        = options.unit;
        this.prefix      = prefix;
        this.uncertainty = options.uncertainty;

        Object.freeze(this);

    }


    /**
     * Whether the unit is an interval scale, so that the prefix denotes a
     * difference rather than an absolute quantity.
     *
     * The degree Celsius is the only such unit in the registry. A reading of
     * `1 m°C` is a difference of a thousandth of a degree, and nothing about
     * it can be turned into kelvin by multiplication alone.
     */
    get affine(): boolean {
        return isAffine(this.unit);
    }


    /**
     * Whether this reading is an absolute quantity on an interval scale that
     * also carries a prefix.
     *
     * Encoders should write absolute temperatures with a prefix of 0, so this
     * being true is a sign that the reading denotes a difference — which is
     * legitimate, and which a consumer must not scale away.
     */
    get prefixedAffine(): boolean {
        return this.affine && this.prefix !== SIPrefix.None;
    }


    /**
     * The total decimal exponent of the reading: its own exponent plus the
     * prefix.
     *
     * Together with the mantissa this is the exact quantity, and comparing the
     * two is what specification Section 6 recommends over converting to a
     * common prefix, which can overflow.
     */
    get totalExponent(): number {
        return exponentOf(this.value) + this.prefix;
    }


    /** The mantissa of the reading. */
    get mantissa(): bigint {
        return mantissaOf(this.value);
    }


    /**
     * Whether two readings are written identically, down to the spelling of
     * the unit and the scale of the number.
     *
     * `5.0 mA` and `5 mA` are not equal here, and neither are the same reading
     * with its unit written as an identification and as a symbol.
     */
    equalsRepresentation(other: MetrologicalValue): boolean {

        return equalsExact(this.value, other.value) &&
               this.prefix === other.prefix &&
               sameUnitRepresentation(this.unit, other.unit) &&
               sameUncertaintyRepresentation(this.uncertainty, other.uncertainty);

    }


    /**
     * Compares the quantities two readings denote, exactly.
     *
     * Only readings in the same unit can be compared: the registry carries no
     * conversion factors, deliberately, so this cannot silently turn watt
     * hours into joules. The comparison is over mantissa and total exponent,
     * so `5.0 mA` and `0.005 A` compare equal although their bytes differ —
     * they are the same quantity in different representations.
     *
     * The uncertainty plays no part: it says how well the quantity is known,
     * not what it is.
     *
     * @throws {ValueError} if the units differ, or if the unit is affine —
     *         where an offset, not a factor, separates two prefixes, so
     *         scaling alone would compare the wrong things.
     */
    compareQuantity(other: MetrologicalValue): -1 | 0 | 1 {

        if (!sameUnitQuantity(this.unit, other.unit))
            throw new ValueError('ERR_VALUE_TYPE',
                                 'Two readings in different units cannot be compared: the registry carries no conversion factors.',
                                 { clause: '6' });

        if (this.affine && this.prefix !== other.prefix)
            throw new ValueError('ERR_PREFIX_INVALID',
                                 'Two readings on an interval scale with different prefixes cannot be compared by scaling alone.',
                                 { clause: '3.3' });

        // Align on the smaller total exponent, in exact integer arithmetic.
        const mine  = this.totalExponent;
        const yours = other.totalExponent;

        const difference = mine > yours ? mine - yours : yours - mine;
        const scaled     = 10n ** BigInt(difference);

        const a = mine  > yours ? this.mantissa  * scaled : this.mantissa;
        const b = yours > mine  ? other.mantissa * scaled : other.mantissa;

        return a === b ? 0 : (a < b ? -1 : 1);

    }


    /** A copy with one or more parts replaced, validated as a new value. */
    with(changes: MetrologicalValueChanges): MetrologicalValue {

        return new MetrologicalValue({
            value:       changes.value  ?? this.value,
            unit:        changes.unit   ?? this.unit,
            prefix:      changes.prefix ?? this.prefix,
            uncertainty: 'uncertainty' in changes ? changes.uncertainty : this.uncertainty,
        });

    }


    /**
     * The reading and its scale, without the unit.
     *
     * The full text form — value, prefix, unit and uncertainty together — is
     * the business of the text format, which has a grammar of its own.
     */
    formatValue(): string {
        return formatDecimal(this.value);
    }

}


/**
 * A metrological value, validated.
 *
 * @throws {ValueError} if the prefix is not one of the 25 SI prefixes.
 */
export function metrologicalValue(options: MetrologicalValueOptions): MetrologicalValue {
    return new MetrologicalValue(options);
}


/**
 * Compares the quantities two readings denote, where they are comparable.
 *
 * A free function beside the method, for sorting: `readings.sort(compareQuantity)`.
 */
export function compareQuantity(left: MetrologicalValue, right: MetrologicalValue): -1 | 0 | 1 {
    return left.compareQuantity(right);
}


/** Whether two readings denote the same quantity, in the same unit. */
export function sameQuantity(left: MetrologicalValue, right: MetrologicalValue): boolean {
    return sameUnitQuantity(left.unit, right.unit) &&
           !(left.affine && left.prefix !== right.prefix) &&
           left.compareQuantity(right) === 0;
}
