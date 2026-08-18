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
 * Measurement uncertainty.
 *
 * The behaviour worth pinning is what the library refuses to do: it never
 * normalises an expanded uncertainty to a standard one behind the caller's
 * back, and it never picks a rounding for them. A certificate stating
 * `U = 0.12 V` with `k = 2` goes on saying that.
 */

import { describe, expect, it } from 'vitest';

import { decimal, formatDecimal, integer } from '../../src/model/decimal.js';
import {
    DISTRIBUTION_IDS, distributionById, effectiveCoverageFactor, statesMoreThanMagnitude, uncertaintyForm,
    sameUncertaintyRepresentation, standardUncertainty, uncertainty,
} from '../../src/model/uncertainty.js';
import { codeOf }           from '../support/errors.js';




describe('construction', () => {

    it('takes a bare magnitude as a standard uncertainty', () => {

        const u = uncertainty({ magnitude: decimal(2, -2) });

        expect(formatDecimal(u.magnitude)).toBe('0.02');
        expect(u.coverageFactor).toBeUndefined();
        expect(uncertaintyForm(u)).toBe('bare');
        expect(formatDecimal(effectiveCoverageFactor(u))).toBe('1');

    });

    it('takes the full statement of a calibration certificate', () => {

        // (230.00 +/- 0.12) V, k = 2, p = 0.95, normal - from Section 5.
        const u = uncertainty({
            magnitude:           decimal(12, -2),
            coverageFactor:      integer(2),
            coverageProbability: decimal(95, -2),
            distribution:        'normal',
        });

        expect(formatDecimal(u.magnitude)).toBe('0.12');
        expect(formatDecimal(u.coverageFactor!)).toBe('2');
        expect(formatDecimal(u.coverageProbability!)).toBe('0.95');
        expect(u.distribution).toBe('normal');
        expect(uncertaintyForm(u)).toBe('map');

    });

    it('keeps the magnitude as reported rather than normalising it', () => {

        // The certificate said 0.12 at k = 2. It still does.
        const u = uncertainty({ magnitude: decimal(12, -2), coverageFactor: integer(2) });

        expect(formatDecimal(u.magnitude)).toBe('0.12');

    });

    it('writes a map by itself as soon as anything beyond a magnitude is stated', () => {

        expect(uncertaintyForm(uncertainty({ magnitude: integer(1) }))).toBe('bare');
        expect(uncertaintyForm(uncertainty({ magnitude: integer(1), coverageFactor: integer(2) }))).toBe('map');
        expect(uncertaintyForm(uncertainty({ magnitude: integer(1), distribution: 'normal' }))).toBe('map');

    });

    it('offers no choice of form, because there is nothing to choose', () => {

        // A map holding only a magnitude says exactly what a bare number says.
        // Section 6 requires the encoding to be a function of the value alone,
        // so the compact form is not a preference but the answer.
        expect(statesMoreThanMagnitude(uncertainty({ magnitude: integer(1) }))).toBe(false);
        expect(statesMoreThanMagnitude(uncertainty({ magnitude: integer(1), coverageFactor: integer(2) }))).toBe(true);

    });

    it('treats an explicit undefined as not stated', () => {

        // Which is what a decoder holding an optional field has in hand.
        const bare = uncertainty({
            magnitude:           integer(1),
            coverageFactor:      undefined,
            coverageProbability: undefined,
            distribution:        undefined,
            degreesOfFreedom:    undefined,
        });

        expect(uncertaintyForm(bare)).toBe('bare');

    });

});


describe('validation', () => {

    it('refuses a negative magnitude', () => {
        expect(codeOf(() => uncertainty({ magnitude: integer(-1) }))).toBe('ERR_UNCERTAINTY_NEGATIVE');
        expect(codeOf(() => uncertainty({ magnitude: decimal(-1, -3) }))).toBe('ERR_UNCERTAINTY_NEGATIVE');
    });

    it('accepts a magnitude of zero, which is a statement rather than an absence', () => {

        // An uncertainty of zero says the quantity is known exactly. That is
        // not the same as no uncertainty being stated at all, which is what an
        // absent field means.
        expect(() => uncertainty({ magnitude: integer(0) })).not.toThrow();

    });

    it.each([integer(0), integer(-1), decimal(-5, -1)])('refuses the coverage factor %o', coverageFactor => {
        expect(codeOf(() => uncertainty({ magnitude: integer(1), coverageFactor })))
            .toBe('ERR_UNCERTAINTY_COVERAGE_FACTOR');
    });

    it.each([integer(0), decimal(0, -2), integer(-1), decimal(101, -2), integer(2)])(
        'refuses the coverage probability %o, which is outside ]0, 1]', coverageProbability => {
            expect(codeOf(() => uncertainty({ magnitude: integer(1), coverageProbability })))
                .toBe('ERR_UNCERTAINTY_PROBABILITY');
        });

    it('accepts a coverage probability of exactly 1, which the interval includes', () => {
        expect(() => uncertainty({ magnitude: integer(1), coverageProbability: integer(1) })).not.toThrow();
        expect(() => uncertainty({ magnitude: integer(1), coverageProbability: decimal(100, -2) })).not.toThrow();
    });

    it.each([integer(0), integer(-1)])('refuses degrees of freedom of %o', degreesOfFreedom => {
        expect(codeOf(() => uncertainty({ magnitude: integer(1), degreesOfFreedom })))
            .toBe('ERR_UNCERTAINTY_DEGREES_OF_FREEDOM');
    });

});


describe('distributions', () => {

    it('names the five the specification lists', () => {
        expect(DISTRIBUTION_IDS).toStrictEqual({
            normal: 1, rectangular: 2, triangular: 3, 'u-shaped': 4, 'student-t': 5,
        });
    });

    it.each([
        [1, 'normal'],
        [2, 'rectangular'],
        [3, 'triangular'],
        [4, 'u-shaped'],
        [5, 'student-t'],
    ] as const)('resolves %i to %s', (id, name) => {
        expect(distributionById(id)).toBe(name);
    });

    it('refuses the 0 that means "not stated"', () => {

        // Not stated is expressed by omitting the field, not by writing a zero.
        expect(codeOf(() => distributionById(0))).toBe('ERR_UNCERTAINTY_DISTRIBUTION');
        expect(() => distributionById(0)).toThrow(/omitting the field/);

    });

    it.each([6, 7, 255, -1])('refuses the unknown distribution %i', id => {
        expect(codeOf(() => distributionById(id))).toBe('ERR_UNCERTAINTY_DISTRIBUTION');
    });

});


describe('the standard uncertainty', () => {

    it('is the magnitude divided by the coverage factor', () => {

        // U = 0.12 V at k = 2 gives u = 0.06 V.
        const u = uncertainty({ magnitude: decimal(12, -2), coverageFactor: integer(2) });

        expect(formatDecimal(standardUncertainty(u, { scale: 3, rounding: 'half-even' }))).toBe('0.060');
        expect(formatDecimal(standardUncertainty(u, { scale: 2, rounding: 'half-even' }))).toBe('0.06');

    });

    it('is the magnitude itself where no coverage factor was stated', () => {

        const u = uncertainty({ magnitude: decimal(2, -2) });

        expect(formatDecimal(standardUncertainty(u, { scale: 2, rounding: 'half-even' }))).toBe('0.02');

    });

    it('makes the caller state the scale, rather than choosing one', () => {

        // 12.3 at k = 2 is 6.15 exactly; at k = 3 it is not exact at all, and
        // the library will not decide how many digits a measurement result has.
        const u = uncertainty({ magnitude: decimal(123, -1), coverageFactor: integer(3) });

        expect(formatDecimal(standardUncertainty(u, { scale: 1, rounding: 'half-even' }))).toBe('4.1');
        expect(formatDecimal(standardUncertainty(u, { scale: 4, rounding: 'half-even' }))).toBe('4.1000');
        expect(formatDecimal(standardUncertainty(u, { scale: 6, rounding: 'half-even' }))).toBe('4.100000');

    });

    it('derives the worked example: 12.3 kWh at k = 2 is 6.15', () => {

        const u = uncertainty({
            magnitude:           decimal(123, -1),
            coverageFactor:      integer(2),
            coverageProbability: decimal(95, -2),
            distribution:        'normal',
        });

        expect(formatDecimal(standardUncertainty(u, { scale: 2, rounding: 'half-even' }))).toBe('6.15');

    });

});


describe('comparison', () => {

    it('treats absence and presence as different', () => {

        const u = uncertainty({ magnitude: integer(1) });

        expect(sameUncertaintyRepresentation(undefined, undefined)).toBe(true);
        expect(sameUncertaintyRepresentation(u, undefined)).toBe(false);
        expect(sameUncertaintyRepresentation(undefined, u)).toBe(false);

    });

    it('distinguishes magnitudes written at different scales', () => {

        // 0.1 and 0.10 state different resolutions of the same quantity.
        expect(sameUncertaintyRepresentation(
            uncertainty({ magnitude: decimal(1, -1) }),
            uncertainty({ magnitude: decimal(10, -2) }),
        )).toBe(false);

    });

    it('finds two uncertainties that state the same thing equal', () => {

        // There is no longer a form to differ in: what an uncertainty says
        // determines how it is written, so saying the same thing is being the
        // same thing.
        expect(sameUncertaintyRepresentation(
            uncertainty({ magnitude: integer(1) }),
            uncertainty({ magnitude: integer(1), coverageFactor: undefined }),
        )).toBe(true);

    });

    it('recognises identical statements', () => {

        const make = () => uncertainty({
            magnitude:           decimal(12, -2),
            coverageFactor:      integer(2),
            coverageProbability: decimal(95, -2),
            distribution:        'normal',
            degreesOfFreedom:    integer(45),
        });

        expect(sameUncertaintyRepresentation(make(), make())).toBe(true);

    });

    it('notices a different coverage factor', () => {

        expect(sameUncertaintyRepresentation(
            uncertainty({ magnitude: decimal(12, -2), coverageFactor: integer(2) }),
            uncertainty({ magnitude: decimal(12, -2), coverageFactor: integer(3) }),
        )).toBe(false);

    });

});
