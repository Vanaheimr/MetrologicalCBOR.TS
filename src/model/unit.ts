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
 * Units of measure: a registered unit, or a product of powers of them.
 *
 * The product form expresses every derived quantity the registry does not
 * name, in the order it is to be displayed: `m*s^-2` is
 * `[[15, 1], [8, -2]]`. Its exponents may be rational, which is not
 * decoration — an amplitude spectral density is stated per root hertz, and
 * fracture toughness in `Pa*m^1/2`.
 *
 * A named unit remembers how it was written, by identification or by which
 * spelling, so that a document can be re-serialised exactly as it arrived.
 *
 * @see The specification, Section 3.2
 */

import { ValueError }        from '../errors.js';
import { UnitRegistry }      from '../registry/index.js';
import type { UnitDefinition } from '../registry/types.js';


// ---------------------------------------------------------------------------
// Exponents
// ---------------------------------------------------------------------------

/** A whole power, for example the `-2` of `m*s^-2`. */
export interface IntegerExponent {
    readonly kind:  'integer';
    readonly value: number;
}

/**
 * A rational power in lowest terms, for example the `-1/2` of `V*Hz^-1/2`.
 *
 * The denominator is always greater than one: a fraction that reduces to a
 * whole number is an {@link IntegerExponent} instead, so that `[-2, 4]` and
 * `[-1, 2]` are the same exponent and `[2, 1]` is simply `2`.
 */
export interface RationalExponent {
    readonly kind:        'rational';
    readonly numerator:   number;
    readonly denominator: number;
}

/** The power a unit is raised to within a product. */
export type UnitExponent = IntegerExponent | RationalExponent;


/**
 * An exponent, reduced to its lowest terms.
 *
 * @throws {ValueError} if the denominator is not positive, or if a fractional
 *         exponent has a numerator of zero.
 */
export function unitExponent(numerator: number, denominator = 1): UnitExponent {

    if (!Number.isInteger(numerator) || !Number.isInteger(denominator))
        throw new ValueError('ERR_UNIT_EXPONENT_DENOMINATOR',
                             `The exponent ${String(numerator)}/${String(denominator)} is not a ratio of integers.`,
                             { clause: '3.2' });

    if (denominator <= 0)
        throw new ValueError('ERR_UNIT_EXPONENT_DENOMINATOR',
                             `The exponent denominator ${String(denominator)} is not positive.`,
                             { clause: '3.2' });

    if (numerator === 0)
        throw new ValueError('ERR_UNIT_EXPONENT_ZERO',
                             'A unit exponent of zero states no factor at all.',
                             { clause: '3.2' });

    const divisor = greatestCommonDivisor(numerator < 0 ? -numerator : numerator, denominator);
    const reduced = { numerator: numerator / divisor, denominator: denominator / divisor };

    return reduced.denominator === 1
               ? { kind: 'integer',  value: reduced.numerator }
               : { kind: 'rational', numerator: reduced.numerator, denominator: reduced.denominator };

}


function greatestCommonDivisor(left: number, right: number): number {

    let a = left;
    let b = right;

    while (b !== 0) {
        const next = a % b;
        a = b;
        b = next;
    }

    // The 1 is unreachable: `a` ends at zero only if both arguments were, and
    // a rational exponent with a numerator of zero is rejected before it can
    // be reduced. Returning 1 rather than dividing by zero is what the caller
    // would need if that ever changed.
    return a === 0 ? 1 : a;

}


/** Whether two exponents denote the same power. */
export function sameExponent(left: UnitExponent, right: UnitExponent): boolean {

    if (left.kind !== right.kind)
        return false;

    return left.kind === 'integer'
               ? left.value === (right as IntegerExponent).value
               : left.numerator   === (right as RationalExponent).numerator &&
                 left.denominator === (right as RationalExponent).denominator;

}


/** An exponent as `-2` or `-1/2`. */
export function formatExponent(exponent: UnitExponent): string {
    return exponent.kind === 'integer'
               ? String(exponent.value)
               : `${String(exponent.numerator)}/${String(exponent.denominator)}`;
}


/** The exponent `1`, which is what a factor without a stated power carries. */
export const EXPONENT_ONE: IntegerExponent = Object.freeze({ kind: 'integer', value: 1 });


// ---------------------------------------------------------------------------
// Named units
// ---------------------------------------------------------------------------

/**
 * How a named unit was written on the wire.
 *
 * Encoders should use the numeric identification, and decoders must accept
 * both; keeping the distinction is what lets a document be re-serialised as it
 * arrived rather than merely equivalently.
 */
export type UnitSpelling =

    /** By its numeric identification, which is the compact form. */
    | { readonly form: 'id' }

    /** By a symbol: the registered one, or one of its accepted aliases. */
    | { readonly form: 'symbol'; readonly spelling: string };


/** A unit from the registry. */
export interface NamedUnit {
    readonly kind:    'named';
    readonly unit:    UnitDefinition;
    readonly written: UnitSpelling;
}


/** A registered unit, written by its identification. */
export function unitById(id: number, registry: UnitRegistry = UnitRegistry.standard): NamedUnit {
    return { kind: 'named', unit: registry.byId(id), written: { form: 'id' } };
}


/**
 * A registered unit, written by a symbol or one of its aliases.
 *
 * The spelling is kept as given, so that `Ohm` re-serialises as `Ohm` rather
 * than as the registered symbol.
 */
export function unitBySymbol(symbol: string, registry: UnitRegistry = UnitRegistry.standard): NamedUnit {
    return { kind: 'named', unit: registry.bySymbol(symbol), written: { form: 'symbol', spelling: symbol } };
}


/** A registered unit, in the form encoders should prefer. */
export function namedUnit(unit: UnitDefinition): NamedUnit {
    return { kind: 'named', unit, written: { form: 'id' } };
}


// ---------------------------------------------------------------------------
// Products of powers
// ---------------------------------------------------------------------------

/** One factor of a product of powers. */
export interface UnitFactor {
    readonly unit:     NamedUnit;
    readonly exponent: UnitExponent;
}


/** A product of powers, in the order the factors are to be displayed. */
export interface UnitProduct {
    readonly kind:    'product';
    readonly factors: readonly UnitFactor[];
}


/** A unit of measure: one registered unit, or a product of powers of them. */
export type UnitRef = NamedUnit | UnitProduct;


/**
 * A product of powers.
 *
 * @throws {ValueError} if there are no factors, or if the product is a single
 *         unit raised to the first power — which is a named unit, and which an
 *         encoder must never write as a one-element array. A canonical
 *         encoding does not have two spellings for the same unit.
 */
export function unitProduct(factors: readonly UnitFactor[]): UnitProduct {

    if (factors.length === 0)
        throw new ValueError('ERR_UNIT_PRODUCT_EMPTY',
                             'A product of powers has no factors.',
                             { clause: '3.2' });

    const only = factors[0];

    if (factors.length === 1 && only !== undefined && sameExponent(only.exponent, EXPONENT_ONE))
        throw new ValueError('ERR_UNIT_SINGLE_AS_PRODUCT',
                             `A single ${only.unit.unit.name} to the first power is a named unit, not a product. The compact form is the one that stays cheap on the wire.`,
                             { clause: '3.2' });

    return { kind: 'product', factors };

}


/** A factor, defaulting to the first power. */
export function factor(unit: NamedUnit, exponent: UnitExponent = EXPONENT_ONE): UnitFactor {
    return { unit, exponent };
}


// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

/** Whether a unit reference is a single registered unit. */
export function isNamedUnit(unit: UnitRef): unit is NamedUnit {
    return unit.kind === 'named';
}

/** Whether a unit reference is a product of powers. */
export function isUnitProduct(unit: UnitRef): unit is UnitProduct {
    return unit.kind === 'product';
}


/**
 * Whether the unit is an interval scale, so that a prefix on it denotes a
 * difference rather than an absolute quantity.
 *
 * The degree Celsius is the only such unit in the registry. A product
 * containing one is affine too: consumers must not convert it by scaling
 * alone (specification Section 3.3).
 */
export function isAffine(unit: UnitRef): boolean {
    return unit.kind === 'named'
               ? unit.unit.affine
               : unit.factors.some(each => each.unit.unit.affine);
}


/**
 * Whether two unit references are written the same way: the same units, the
 * same exponents, in the same order, with the same spellings.
 */
export function sameUnitRepresentation(left: UnitRef, right: UnitRef): boolean {

    if (left.kind !== right.kind)
        return false;

    if (left.kind === 'named') {

        const other = right as NamedUnit;

        if (left.unit.id !== other.unit.id || left.written.form !== other.written.form)
            return false;

        return left.written.form === 'id' ||
               left.written.spelling === (other.written as { spelling: string }).spelling;

    }

    const other = right as UnitProduct;

    return left.factors.length === other.factors.length &&
           left.factors.every((each, index) => {
               const counterpart = other.factors[index];
               return counterpart !== undefined &&
                      sameUnitRepresentation(each.unit, counterpart.unit) &&
                      sameExponent(each.exponent, counterpart.exponent);
           });

}


/**
 * Whether two unit references denote the same unit, whatever order their
 * factors are written in and whichever spelling names them.
 *
 * This is a comparison of quantities rather than of representations: `m*s^-2`
 * and `s^-2*m` are the same unit displayed differently. It does not convert
 * between units — the registry carries no conversion factors — so the watt
 * hour and the joule remain different units here, as they should: whether they
 * may be exchanged is a question about the quantity, not about the unit.
 */
export function sameUnitQuantity(left: UnitRef, right: UnitRef): boolean {

    const normalise = (unit: UnitRef): string[] =>
        (unit.kind === 'named'
             ? [{ unit: unit.unit, exponent: EXPONENT_ONE }]
             : [...unit.factors].map(each => ({ unit: each.unit.unit, exponent: each.exponent })))
        .map(each => `${String(each.unit.id)}^${formatExponent(each.exponent)}`)
        .sort();

    const a = normalise(left);
    const b = normalise(right);

    return a.length === b.length && a.every((each, index) => each === b[index]);

}
