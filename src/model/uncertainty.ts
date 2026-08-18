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
 * Measurement uncertainty, as the GUM defines it.
 *
 * A value without a statement of uncertainty is, strictly speaking, not a
 * measurement result. What is carried here is the symmetric uncertainty
 * associated with a reading, expressed in the same unit and the same prefix as
 * the reading itself.
 *
 * The magnitude is kept **as reported**, together with the coverage factor it
 * belongs to. A calibration certificate stating `U = 0.12 V` with `k = 2` goes
 * on saying exactly that, instead of being normalised to `u = 0.06` and losing
 * the statement the certificate was issued with. A consumer that needs the
 * standard uncertainty divides — see {@link standardUncertainty}, which makes
 * the caller state how the quotient is to be rounded.
 *
 * Asymmetric uncertainties and correlations are deliberately out of scope: a
 * correlation is a property of a *set* of values, not of a single one.
 *
 * @see The specification, Section 3.4, and JCGM 100:2008 (GUM)
 */

import { ValueError }                          from '../errors.js';
import { compareDecimal, divideDecimal, formatDecimal, integer, isNegative, isZero } from './decimal.js';
import type { DecimalNumber, DecimalFraction, RoundingMode } from './decimal.js';


/**
 * The probability distribution attributed to the measurand.
 *
 * "Not stated" is the absence of the field rather than a value of its own:
 * the identification 0 means not stated and must be omitted rather than
 * written.
 */
export type UncertaintyDistribution =
    | 'normal'
    | 'rectangular'
    | 'triangular'
    | 'u-shaped'
    | 'student-t';


/** The wire identification of each distribution. */
export const DISTRIBUTION_IDS = Object.freeze({
    normal:      1,
    rectangular: 2,
    triangular:  3,
    'u-shaped':  4,
    'student-t': 5,
} as const);

const DISTRIBUTIONS_BY_ID = new Map<number, UncertaintyDistribution>(
    Object.entries(DISTRIBUTION_IDS).map(([name, id]) => [id, name as UncertaintyDistribution]),
);


/**
 * The distribution an identification names.
 *
 * @throws {ValueError} if the identification is unknown, or is the 0 that
 *         means "not stated" and must be omitted rather than written.
 */
export function distributionById(id: number): UncertaintyDistribution {

    const distribution = DISTRIBUTIONS_BY_ID.get(id);

    if (distribution !== undefined)
        return distribution;

    throw new ValueError('ERR_UNCERTAINTY_DISTRIBUTION',
                         id === 0
                             ? 'The distribution 0 means "not stated", which is expressed by omitting the field rather than by writing it.'
                             : `${String(id)} is not a known probability distribution.`,
                         { clause: '3.4' });

}


/**
 * How the uncertainty was written.
 *
 * A bare number is the compact and by far the most common form, and states a
 * standard uncertainty. A map states more. Where only a magnitude is present
 * the two say the same thing, and the form is kept so that a document can be
 * re-serialised as it arrived.
 */
export type UncertaintyForm = 'bare' | 'map';


export interface UncertaintyOptions {

    // The optional fields accept an explicit `undefined` as well as being
    // absent, because a decoder holding an optional field has exactly that in
    // hand, and both spellings mean the same thing here: not stated.

    /** The magnitude, as reported. Never negative. */
    readonly magnitude: DecimalNumber;

    /** The coverage factor the magnitude belongs to. Defaults to 1. */
    readonly coverageFactor?: DecimalNumber | undefined;

    /** The coverage probability, a fraction in ]0, 1]. */
    readonly coverageProbability?: DecimalNumber | undefined;

    /** The probability distribution attributed to the measurand. */
    readonly distribution?: UncertaintyDistribution | undefined;

    /** The effective degrees of freedom, positive. */
    readonly degreesOfFreedom?: DecimalNumber | undefined;

    /**
     * How it is to be written. Defaults to the compact `bare` where nothing
     * but a magnitude is stated, and to `map` otherwise.
     */
    readonly form?: UncertaintyForm;

}


/**
 * A measurement uncertainty.
 *
 * Construct it with {@link uncertainty}, which validates; the fields are
 * readable but the object is not to be assembled by hand.
 */
export interface Uncertainty {

    /** The magnitude, as reported, in the unit and prefix of the reading. */
    readonly magnitude: DecimalNumber;

    /** The coverage factor the magnitude belongs to, or `undefined` for the default of 1. */
    readonly coverageFactor: DecimalNumber | undefined;

    /** The coverage probability, or `undefined` where it was not stated. */
    readonly coverageProbability: DecimalNumber | undefined;

    /** The probability distribution, or `undefined` where it was not stated. */
    readonly distribution: UncertaintyDistribution | undefined;

    /** The effective degrees of freedom, or `undefined` where they were not stated. */
    readonly degreesOfFreedom: DecimalNumber | undefined;

    /** How it is written on the wire. */
    readonly form: UncertaintyForm;

}


const ONE = integer(1);


/**
 * A measurement uncertainty, validated.
 *
 * @throws {ValueError} if the magnitude is negative, the coverage factor is
 *         not positive, the coverage probability lies outside ]0, 1], or the
 *         degrees of freedom are not positive.
 */
export function uncertainty(options: UncertaintyOptions): Uncertainty {

    const { magnitude, coverageFactor, coverageProbability, degreesOfFreedom } = options;

    if (isNegative(magnitude))
        throw new ValueError('ERR_UNCERTAINTY_NEGATIVE',
                             `A measurement uncertainty of ${formatDecimal(magnitude)} is negative.`,
                             { clause: '3.4' });

    if (coverageFactor !== undefined && (isNegative(coverageFactor) || isZero(coverageFactor)))
        throw new ValueError('ERR_UNCERTAINTY_COVERAGE_FACTOR',
                             `A coverage factor of ${formatDecimal(coverageFactor)} is not positive. The standard uncertainty is the magnitude divided by it.`,
                             { clause: '3.4' });

    if (coverageProbability !== undefined &&
        (isZero(coverageProbability) || isNegative(coverageProbability) || compareDecimal(coverageProbability, ONE) > 0))
        throw new ValueError('ERR_UNCERTAINTY_PROBABILITY',
                             `A coverage probability of ${formatDecimal(coverageProbability)} lies outside the interval ]0, 1].`,
                             { clause: '3.4' });

    if (degreesOfFreedom !== undefined && (isNegative(degreesOfFreedom) || isZero(degreesOfFreedom)))
        throw new ValueError('ERR_UNCERTAINTY_DEGREES_OF_FREEDOM',
                             `Effective degrees of freedom of ${formatDecimal(degreesOfFreedom)} are not positive.`,
                             { clause: '3.4' });

    const statesMoreThanMagnitude = coverageFactor      !== undefined ||
                                    coverageProbability !== undefined ||
                                    options.distribution !== undefined ||
                                    degreesOfFreedom    !== undefined;

    const form = options.form ?? (statesMoreThanMagnitude ? 'map' : 'bare');

    if (form === 'bare' && statesMoreThanMagnitude)
        throw new ValueError('ERR_UNCERTAINTY_NO_MAGNITUDE',
                             'An uncertainty that states more than a magnitude cannot be written as a bare number.',
                             { clause: '3.4' });

    return {
        magnitude,
        coverageFactor,
        coverageProbability,
        distribution: options.distribution,
        degreesOfFreedom,
        form,
    };

}


/**
 * The coverage factor the magnitude belongs to, which is 1 where none was
 * stated.
 */
export function effectiveCoverageFactor(value: Uncertainty): DecimalNumber {
    return value.coverageFactor ?? ONE;
}


/**
 * The standard uncertainty *u* = magnitude / *k*, at a scale the caller states.
 *
 * The scale is required. Most quotients have no exact decimal form, and a
 * library that picked a precision for a measurement result would be asserting
 * something the measurement does not say. Where the coverage factor is 1 the
 * magnitude is already the standard uncertainty, and this still rounds it to
 * the requested scale so that the result is what the caller asked for and not
 * sometimes something else.
 *
 * @example
 * ```ts
 * // A certificate stating U = 0.12 V with k = 2.
 * standardUncertainty(u, { scale: 3, rounding: 'half-even' });  // 0.060
 * ```
 */
export function standardUncertainty(value:   Uncertainty,
                                    options: { readonly scale: number; readonly rounding: RoundingMode }): DecimalFraction
{
    return divideDecimal(value.magnitude, effectiveCoverageFactor(value), options);
}


/** Whether two uncertainties are written identically. */
export function sameUncertaintyRepresentation(left:  Uncertainty | undefined,
                                              right: Uncertainty | undefined): boolean
{

    if (left === undefined || right === undefined)
        return left === right;

    const sameNumber = (a: DecimalNumber | undefined, b: DecimalNumber | undefined): boolean =>
        a === undefined || b === undefined
            ? a === b
            : a.kind === b.kind && compareDecimal(a, b) === 0 &&
              formatDecimal(a) === formatDecimal(b);

    return left.form === right.form &&
           left.distribution === right.distribution &&
           sameNumber(left.magnitude,           right.magnitude) &&
           sameNumber(left.coverageFactor,      right.coverageFactor) &&
           sameNumber(left.coverageProbability, right.coverageProbability) &&
           sameNumber(left.degreesOfFreedom,    right.degreesOfFreedom);

}
