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
 * The metrological value itself.
 *
 * The readings used here are the examples of specification Section 5, built
 * from the model rather than decoded, so that the model is shown to express
 * them before WP4 makes it encode them.
 */

import { describe, expect, it } from 'vitest';

import { Units }                from '../../src/registry/units.generated.js';
import { decimal, integer }     from '../../src/model/decimal.js';
import { SIPrefix }             from '../../src/model/prefix.js';
import { factor, unitById, unitBySymbol, unitExponent, unitProduct } from '../../src/model/unit.js';
import { uncertainty }          from '../../src/model/uncertainty.js';
import {
    MetrologicalValue, compareQuantity, metrologicalValue, sameQuantity,
} from '../../src/model/value.js';
import { codeOf }           from '../support/errors.js';



/** `5 A`, the first example of Section 5. */
const fiveAmpere = metrologicalValue({
    value: integer(5),
    unit:  unitById(Units.Ampere),
});

/** `5.0 mA`. */
const fiveMilliampere = metrologicalValue({
    value:  decimal(50, -1),
    unit:   unitById(Units.Ampere),
    prefix: SIPrefix.Milli,
});

/** `1.10 kWh`. */
const energy = metrologicalValue({
    value:  decimal(110, -2),
    unit:   unitById(Units.WattHour),
    prefix: SIPrefix.Kilo,
});


describe('construction', () => {

    it('expresses the readings of Section 5', () => {

        expect(fiveAmpere.formatValue()).toBe('5');
        expect(fiveAmpere.unit.kind).toBe('named');
        expect(fiveAmpere.prefix).toBe(0);
        expect(fiveAmpere.uncertainty).toBeUndefined();

        expect(fiveMilliampere.formatValue()).toBe('5.0');
        expect(fiveMilliampere.prefix).toBe(-3);

        expect(energy.formatValue()).toBe('1.10');
        expect(energy.prefix).toBe(3);

    });

    it('expresses an acceleration in a product of powers', () => {

        // 9.81 m*s^-2
        const acceleration = metrologicalValue({
            value: decimal(981, -2),
            unit:  unitProduct([
                factor(unitById(Units.Meter)),
                factor(unitById(Units.Second), unitExponent(-2)),
            ]),
        });

        expect(acceleration.formatValue()).toBe('9.81');
        expect(acceleration.unit.kind).toBe('product');

    });

    it('expresses a reading with a rational unit exponent', () => {

        // 4.5 nV*Hz^-1/2
        const density = metrologicalValue({
            value:  decimal(45, -1),
            unit:   unitProduct([
                factor(unitById(Units.Volt)),
                factor(unitById(Units.Hertz), unitExponent(-1, 2)),
            ]),
            prefix: SIPrefix.Nano,
        });

        expect(density.formatValue()).toBe('4.5');
        expect(density.prefix).toBe(-9);

    });

    it('expresses a reading with a full GUM uncertainty', () => {

        // (230.00 +/- 0.12) V, k = 2
        const voltage = metrologicalValue({
            value:  decimal(23000, -2),
            unit:   unitById(Units.Volt),
            prefix: SIPrefix.None,
            uncertainty: uncertainty({
                magnitude:      decimal(12, -2),
                coverageFactor: integer(2),
            }),
        });

        expect(voltage.formatValue()).toBe('230.00');
        expect(voltage.uncertainty?.form).toBe('map');

    });

    it('defaults the prefix to none', () => {
        expect(fiveAmpere.prefix).toBe(SIPrefix.None);
    });

    it('refuses a prefix that is not one of the 25', () => {

        expect(codeOf(() => metrologicalValue({
            value:  integer(1),
            unit:   unitById(Units.Volt),
            prefix: 4,
        }))).toBe('ERR_PREFIX_INVALID');

    });

    it('is immutable', () => {

        expect(Object.isFrozen(fiveAmpere)).toBe(true);
        expect(() => {
            (fiveAmpere as unknown as { prefix: number }).prefix = 3;
        }).toThrow();

    });

    it('copies with a change, validating the result', () => {

        const copy = energy.with({ prefix: SIPrefix.Mega });

        expect(copy.prefix).toBe(6);
        expect(energy.prefix).toBe(3);
        expect(copy).toBeInstanceOf(MetrologicalValue);
        expect(codeOf(() => energy.with({ prefix: 4 }))).toBe('ERR_PREFIX_INVALID');

    });

    it('drops an uncertainty on request, and keeps it otherwise', () => {

        const withUncertainty = fiveAmpere.with({
            uncertainty: uncertainty({ magnitude: decimal(5, -1) }),
        });

        expect(withUncertainty.uncertainty).toBeDefined();
        expect(withUncertainty.with({ prefix: 3 }).uncertainty).toBeDefined();
        expect(withUncertainty.with({ uncertainty: undefined }).uncertainty).toBeUndefined();

    });

});


describe('absent uncertainty', () => {

    it('means "not stated" and never zero', () => {

        // Specification Section 7. The distinction is the whole point of
        // modelling it as undefined rather than as a default of zero.
        expect(fiveAmpere.uncertainty).toBeUndefined();

        const stated = fiveAmpere.with({ uncertainty: uncertainty({ magnitude: integer(0) }) });

        expect(stated.uncertainty).toBeDefined();
        expect(stated.uncertainty?.magnitude).toStrictEqual(integer(0));

    });

});


describe('affine units', () => {

    const celsius = metrologicalValue({
        value: decimal(215, -1),
        unit:  unitById(Units.DegreeCelsius),
    });

    it('are recognised', () => {
        expect(celsius.affine).toBe(true);
        expect(fiveAmpere.affine).toBe(false);
    });

    it('flag a prefixed reading, which denotes a difference', () => {

        // A reading of m degrees Celsius is a difference of a thousandth of a
        // degree; nothing about it becomes kelvin by multiplication alone.
        expect(celsius.prefixedAffine).toBe(false);
        expect(celsius.with({ prefix: SIPrefix.Milli }).prefixedAffine).toBe(true);
        expect(fiveMilliampere.prefixedAffine).toBe(false);

    });

});


describe('comparison of representations', () => {

    it('distinguishes readings written differently', () => {

        // 5 A and 5.0 A denote the same quantity at different resolutions, and
        // both must survive a round trip unchanged, so they are not equal here.
        const five    = metrologicalValue({ value: integer(5),      unit: unitById(Units.Ampere) });
        const fivePt0 = metrologicalValue({ value: decimal(50, -1), unit: unitById(Units.Ampere) });

        expect(five.equalsRepresentation(fivePt0)).toBe(false);
        expect(five.equalsRepresentation(five)).toBe(true);

    });

    it('distinguishes a unit written as an identification from one written as a symbol', () => {

        const byId     = metrologicalValue({ value: integer(5), unit: unitById(Units.Ampere) });
        const bySymbol = metrologicalValue({ value: integer(5), unit: unitBySymbol('A') });

        expect(byId.equalsRepresentation(bySymbol)).toBe(false);

    });

    it('notices a different prefix', () => {
        expect(fiveMilliampere.equalsRepresentation(fiveMilliampere.with({ prefix: SIPrefix.Micro }))).toBe(false);
    });

    it('notices an uncertainty appearing or disappearing', () => {

        const stated = fiveAmpere.with({ uncertainty: uncertainty({ magnitude: decimal(5, -1) }) });

        expect(fiveAmpere.equalsRepresentation(stated)).toBe(false);
        expect(stated.equalsRepresentation(stated)).toBe(true);

    });

});


describe('comparison of quantities', () => {

    it('sees through the prefix', () => {

        // 5.0 mA and 0.005 A are the same quantity. Their bytes differ, and
        // the specification says so deliberately.
        const milli = metrologicalValue({
            value: decimal(50, -1), unit: unitById(Units.Ampere), prefix: SIPrefix.Milli,
        });
        const ampere = metrologicalValue({
            value: decimal(5000, -6), unit: unitById(Units.Ampere),
        });

        expect(milli.compareQuantity(ampere)).toBe(0);
        expect(sameQuantity(milli, ampere)).toBe(true);
        expect(milli.equalsRepresentation(ampere)).toBe(false);

    });

    it('orders readings across prefixes', () => {

        const milliampere = metrologicalValue({
            value: integer(5), unit: unitById(Units.Ampere), prefix: SIPrefix.Milli,
        });
        const ampere = metrologicalValue({ value: integer(5), unit: unitById(Units.Ampere) });

        expect(milliampere.compareQuantity(ampere)).toBe(-1);
        expect(ampere.compareQuantity(milliampere)).toBe(1);
        expect(compareQuantity(ampere, ampere)).toBe(0);

    });

    it('sees through the spelling of the unit', () => {

        const byId     = metrologicalValue({ value: integer(5), unit: unitById(Units.Ampere) });
        const bySymbol = metrologicalValue({ value: integer(5), unit: unitBySymbol('A') });

        expect(byId.compareQuantity(bySymbol)).toBe(0);

    });

    it('is exact across an enormous difference in scale', () => {

        // Converting to a common prefix would overflow; comparing mantissa and
        // total exponent does not, which is what Section 6 recommends.
        const tiny = metrologicalValue({
            value: decimal(1, -9000), unit: unitById(Units.Volt), prefix: SIPrefix.Quecto,
        });
        const huge = metrologicalValue({
            value: decimal(1, 9000), unit: unitById(Units.Volt), prefix: SIPrefix.Quetta,
        });

        expect(tiny.compareQuantity(huge)).toBe(-1);

    });

    it('refuses to compare different units', () => {

        // The registry carries no conversion factors, deliberately, so this
        // cannot silently turn watt hours into joules.
        const volts = metrologicalValue({ value: integer(1), unit: unitById(Units.Volt) });
        const amps  = metrologicalValue({ value: integer(1), unit: unitById(Units.Ampere) });

        expect(codeOf(() => volts.compareQuantity(amps))).toBe('ERR_VALUE_TYPE');
        expect(() => volts.compareQuantity(amps)).toThrow(/no conversion factors/);

    });

    it('refuses to compare an interval scale across prefixes', () => {

        // Converting a prefixed degree Celsius needs an offset, not a factor.
        const celsius = metrologicalValue({ value: integer(20), unit: unitById(Units.DegreeCelsius) });
        const milli   = celsius.with({ prefix: SIPrefix.Milli });

        expect(codeOf(() => celsius.compareQuantity(milli))).toBe('ERR_PREFIX_INVALID');
        expect(() => celsius.compareQuantity(milli)).toThrow(/scaling alone/);

        // At the same prefix there is nothing to convert, so it compares.
        expect(celsius.compareQuantity(celsius)).toBe(0);

    });

    it('compares products of powers regardless of factor order', () => {

        const forwards = metrologicalValue({
            value: integer(1),
            unit:  unitProduct([factor(unitById(Units.Meter)), factor(unitById(Units.Second), unitExponent(-2))]),
        });
        const backwards = metrologicalValue({
            value: integer(1),
            unit:  unitProduct([factor(unitById(Units.Second), unitExponent(-2)), factor(unitById(Units.Meter))]),
        });

        expect(forwards.compareQuantity(backwards)).toBe(0);
        expect(forwards.equalsRepresentation(backwards)).toBe(false);

    });

    it('ignores the uncertainty, which says how well the quantity is known', () => {

        const bare   = metrologicalValue({ value: integer(5), unit: unitById(Units.Ampere) });
        const stated = bare.with({ uncertainty: uncertainty({ magnitude: decimal(5, -1) }) });

        expect(bare.compareQuantity(stated)).toBe(0);

    });

});


describe('the total exponent', () => {

    it('is the reading exponent plus the prefix', () => {

        // 1.10 kWh: exponent -2, prefix 3.
        expect(energy.totalExponent).toBe(1);
        expect(energy.mantissa).toBe(110n);

        // Which says 110 * 10^1 Wh = 1100 Wh, exactly.
        expect(energy.mantissa * 10n ** BigInt(energy.totalExponent)).toBe(1100n);

    });

    it('is what makes an exact difference of two readings possible', () => {

        // The worked example: 1259.869 kWh minus 1234.567 kWh is 25.302 kWh,
        // with no float anywhere in the calculation.
        const begin = metrologicalValue({
            value: decimal(1234567, -3), unit: unitById(Units.WattHour), prefix: SIPrefix.Kilo,
        });
        const end = metrologicalValue({
            value: decimal(1259869, -3), unit: unitById(Units.WattHour), prefix: SIPrefix.Kilo,
        });

        expect(begin.totalExponent).toBe(end.totalExponent);
        expect(end.mantissa - begin.mantissa).toBe(25302n);
        expect(end.compareQuantity(begin)).toBe(1);

    });

});
