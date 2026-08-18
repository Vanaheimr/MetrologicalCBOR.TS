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
 * Every unit against every prefix, and every unit against every power.
 *
 * The ambiguities this format can suffer from are structured rather than
 * random: a prefix folded onto a symbol spells another symbol (`cd`), or a
 * symbol and its superscript do (`m` cubed spells `m³`). Random sampling finds
 * those only by luck — it took a hundred thousand cases to turn up the first
 * one — so the whole grid is walked here instead.
 *
 * It is deliberately deterministic. A generator that finds a defect one run in
 * fifty is a defect that ships.
 */

import { describe, expect, it } from 'vitest';

import { bytesToHex }              from '../../src/cbor/hex.js';
import { encodeMetrologicalValue } from '../../src/codec/index.js';
import { decimal }                 from '../../src/model/decimal.js';
import { SI_PREFIX_EXPONENTS }     from '../../src/model/prefix.js';
import { factor, unitById, unitExponent, unitProduct } from '../../src/model/unit.js';
import type { UnitRef }            from '../../src/model/unit.js';
import { metrologicalValue }       from '../../src/model/value.js';
import { STANDARD_UNITS }          from '../../src/registry/units.generated.js';
import { formatMetrologicalValue, parseMetrologicalValue } from '../../src/text/index.js';

const IDS       = STANDARD_UNITS.map(unit => unit.id);
const EXPONENTS = [-9, -3, -2, -1, 0, 2, 3, 4, 9];
const RATIONALS: readonly (readonly [number, number])[] = [[-1, 2], [1, 2], [-3, 4], [3, 2]];

const READING = decimal(50, -1);


/** The readings whose text does not read back to the same bytes. */
function survey(cases: Iterable<{ unit: UnitRef; prefix: number; label: string }>): string[] {

    const broken: string[] = [];

    for (const { unit, prefix, label } of cases)
        for (const ascii of [false, true]) {

            const reading = metrologicalValue({ value: READING, unit, prefix });

            let text = '';
            try {
                text = formatMetrologicalValue(reading, { ascii });
                const want = bytesToHex(encodeMetrologicalValue(reading));
                const got  = bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(text)));
                if (want !== got)
                    broken.push(`${label} prefix=${String(prefix)} text=${JSON.stringify(text)} want=${want} got=${got}`);
            }
            catch (error) {
                broken.push(`${label} prefix=${String(prefix)} text=${JSON.stringify(text)} threw ${(error as Error).message}`);
            }

        }

    return broken;

}


describe('every named unit against every prefix', () => {

    it('round-trips', () => {

        const cases = IDS.flatMap(id =>
            SI_PREFIX_EXPONENTS.map(prefix => ({
                unit:   unitById(id),
                prefix,
                label:  `${STANDARD_UNITS.find(unit => unit.id === id)?.name ?? ''}`,
            })));

        expect(survey(cases)).toStrictEqual([]);
        expect(cases.length).toBe(STANDARD_UNITS.length * 25);

    });

    it('never folds a prefix into a token that spells another unit', () => {

        // The centi-day would fold into `cd`, which is the candela. The
        // renderer has to notice that and write a factor of ten instead.
        const centiDay = metrologicalValue({
            value:  READING,
            unit:   unitById(60),
            prefix: -2,
        });

        const text = formatMetrologicalValue(centiDay);

        expect(text).not.toContain('cd');
        expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(text))))
            .toBe(bytesToHex(encodeMetrologicalValue(centiDay)));

    });

});


describe('every unit against every whole power', () => {

    it('round-trips', () => {

        const cases = IDS.flatMap(id =>
            EXPONENTS.map(exponent => ({
                unit:   unitProduct([factor(unitById(id), unitExponent(exponent))]),
                prefix: 0,
                label:  `${String(id)}^${String(exponent)}`,
            })));

        expect(survey(cases)).toStrictEqual([]);

    });

    it('never writes a superscript that spells another unit', () => {

        // The metre cubed would be written `m³`, which is the cubic metre.
        // Both are expressible and they are different units, so the renderer
        // has to reach for the caret.
        const metreCubed = metrologicalValue({
            value: READING,
            unit:  unitProduct([factor(unitById(15), unitExponent(3))]),
        });

        expect(formatMetrologicalValue(metreCubed)).toBe('5.0 m^3');

        // ...while the registered cubic metre keeps its own symbol.
        const cubicMetre = metrologicalValue({ value: READING, unit: unitById(141) });

        expect(formatMetrologicalValue(cubicMetre)).toBe('5.0 m³');

    });

    it('never runs a superscript into a symbol that ends in one', () => {

        // The cubic metre to the power -1: `m³⁻¹` would read as the two
        // superscripts `3` and `-1` side by side, which is no exponent at all.
        const inverse = metrologicalValue({
            value: READING,
            unit:  unitProduct([factor(unitById(141), unitExponent(-1))]),
        });

        expect(formatMetrologicalValue(inverse)).toBe('5.0 m³^-1');

    });

});


describe('every unit against every rational power', () => {

    it('round-trips, alone and beside another factor', () => {

        const cases = IDS.flatMap(id =>
            RATIONALS.flatMap(([numerator, denominator]) => [
                {
                    unit:   unitProduct([factor(unitById(id), unitExponent(numerator, denominator))]),
                    prefix: 0,
                    label:  `${String(id)}^${String(numerator)}/${String(denominator)}`,
                },
                {
                    unit:   unitProduct([
                        factor(unitById(id), unitExponent(1)),
                        factor(unitById(9), unitExponent(numerator, denominator)),
                    ]),
                    prefix: 3,
                    label:  `${String(id)}*Hz^${String(numerator)}/${String(denominator)}`,
                },
            ]));

        expect(survey(cases)).toStrictEqual([]);

    });

});


describe('every unit as the leading factor of a product', () => {

    it('round-trips at a prefix that has to be folded or written out', () => {

        const cases = IDS.flatMap(id =>
            [0, 3, -6, -30].flatMap(prefix =>
                EXPONENTS.map(exponent => ({
                    unit:   unitProduct([
                        factor(unitById(id), unitExponent(exponent)),
                        factor(unitById(id === 8 ? 15 : 8), unitExponent(-1)),
                    ]),
                    prefix,
                    label:  `${String(id)}^${String(exponent)}*x^-1`,
                }))));

        expect(survey(cases)).toStrictEqual([]);

    });

});
