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
 * The ten examples of specification Section 5, byte for byte.
 *
 * These are the acceptance criterion of the codec, and they are external: the
 * bytes come from the document, not from this code, so they can disprove it. A
 * vector that fails is a defect here, never a vector to be adjusted.
 *
 * Where the specification is present the table below is checked against it, so
 * that a change to the document cannot pass unnoticed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import { fileURLToPath }            from 'node:url';
import { describe, expect, it }     from 'vitest';

import { bytesToHex, hexToBytes }   from '../../src/cbor/hex.js';
import { decode as decodeCbor }     from '../../src/cbor/reader.js';
import { diagnostic }               from '../../src/cbor/diagnostic.js';
import { decimal, formatDecimal, integer } from '../../src/model/decimal.js';
import { SIPrefix }                 from '../../src/model/prefix.js';
import { factor, unitById, unitBySymbol, unitExponent, unitProduct } from '../../src/model/unit.js';
import { uncertainty, uncertaintyForm }              from '../../src/model/uncertainty.js';
import { metrologicalValue }        from '../../src/model/value.js';
import type { MetrologicalValue }   from '../../src/model/value.js';
import { Units }                    from '../../src/registry/units.generated.js';
import {
    decodeMetrologicalValue, encodeMetrologicalValue,
} from '../../src/codec/index.js';


interface Vector {
    /** The reading, as the specification's table names it. */
    readonly reading: string;
    /** The encoding, as the specification's table prints it. */
    readonly hex:     string;
    /** The same reading, built from the model. */
    readonly value:   MetrologicalValue;
    /** Whether the unit is written symbolically, so canonical output differs. */
    readonly symbolic?: boolean;
}


const VECTORS: readonly Vector[] = [

    {
        reading: '5 A',
        hex:     'D9ACDC820504',
        value:   metrologicalValue({ value: integer(5), unit: unitById(Units.Ampere) }),
    },

    {
        reading: '230 V',
        hex:     'D9ACDC8218E605',
        value:   metrologicalValue({ value: integer(230), unit: unitById(Units.Volt) }),
    },

    {
        reading: '5.0 mA',
        hex:     'D9ACDC83C4822018320422',
        value:   metrologicalValue({
            value:  decimal(50, -1),
            unit:   unitById(Units.Ampere),
            prefix: SIPrefix.Milli,
        }),
    },

    {
        reading: '1.10 kWh',
        hex:     'D9ACDC83C48221186E0203',
        value:   metrologicalValue({
            value:  decimal(110, -2),
            unit:   unitById(Units.WattHour),
            prefix: SIPrefix.Kilo,
        }),
    },

    {
        reading: '(5.00 +/- 0.02) mA',
        hex:     'D9ACDC84C482211901F40422C4822102',
        value:   metrologicalValue({
            value:       decimal(500, -2),
            unit:        unitById(Units.Ampere),
            prefix:      SIPrefix.Milli,
            uncertainty: uncertainty({ magnitude: decimal(2, -2) }),
        }),
    },

    {
        reading: '(5 +/- 0.5) A',
        hex:     'D9ACDC84050400C4822005',
        value:   metrologicalValue({
            value:       integer(5),
            unit:        unitById(Units.Ampere),
            prefix:      SIPrefix.None,
            uncertainty: uncertainty({ magnitude: decimal(5, -1) }),
        }),
    },

    {
        reading:  '5.0 mA, symbolic unit',
        hex:      'D9ACDC83C4822018326141 22'.replace(/\s/g, ''),
        symbolic: true,
        value:    metrologicalValue({
            value:  decimal(50, -1),
            unit:   unitBySymbol('A'),
            prefix: SIPrefix.Milli,
        }),
    },

    {
        reading: '9.81 m*s^-2',
        hex:     'D9ACDC82C482211903D582820F01820821',
        value:   metrologicalValue({
            value: decimal(981, -2),
            unit:  unitProduct([
                factor(unitById(Units.Meter)),
                factor(unitById(Units.Second), unitExponent(-2)),
            ]),
        }),
    },

    {
        reading: '(230.00 +/- 0.12) V, k = 2',
        hex:     'D9ACDC84C482211959D80500A201C482210C0202',
        value:   metrologicalValue({
            value:       decimal(23000, -2),
            unit:        unitById(Units.Volt),
            prefix:      SIPrefix.None,
            uncertainty: uncertainty({
                magnitude:      decimal(12, -2),
                coverageFactor: integer(2),
            }),
        }),
    },

    {
        reading: '4.5 nV*Hz^-1/2',
        hex:     'D9ACDC83C48220182D82820501820982200228',
        value:   metrologicalValue({
            value:  decimal(45, -1),
            unit:   unitProduct([
                factor(unitById(Units.Volt)),
                factor(unitById(Units.Hertz), unitExponent(-1, 2)),
            ]),
            prefix: SIPrefix.Nano,
        }),
    },

];


describe('the examples of Section 5', () => {

    it('are all ten of them', () => {
        expect(VECTORS).toHaveLength(10);
    });

    it.each(VECTORS)('decodes $reading', ({ hex, value }) => {

        const decoded = decodeMetrologicalValue(hexToBytes(hex));

        expect(decoded.equalsRepresentation(value)).toBe(true);

    });

    it.each(VECTORS)('encodes $reading', ({ hex, value, symbolic }) => {

        // A symbolic unit is legal but discouraged, so the canonical encoding
        // writes the identification instead; preserve mode reproduces it.
        const bytes = encodeMetrologicalValue(value, { units: symbolic === true ? 'preserve' : 'canonical' });

        expect(bytesToHex(bytes)).toBe(hex);

    });

    it.each(VECTORS)('round-trips $reading through the bytes', ({ hex, symbolic }) => {

        const decoded = decodeMetrologicalValue(hexToBytes(hex));
        const bytes   = encodeMetrologicalValue(decoded, { units: symbolic === true ? 'preserve' : 'canonical' });

        expect(bytesToHex(bytes)).toBe(hex);

    });

    it.each(VECTORS)('round-trips $reading through the model', ({ hex }) => {

        const once  = decodeMetrologicalValue(hexToBytes(hex));
        const twice = decodeMetrologicalValue(encodeMetrologicalValue(once, { units: 'preserve' }));

        expect(twice.equalsRepresentation(once)).toBe(true);

    });

    it('writes a symbolic unit as an identification when asked to be canonical', () => {

        const symbolic = VECTORS.find(vector => vector.symbolic === true);
        expect(symbolic).toBeDefined();

        const canonical = encodeMetrologicalValue(symbolic!.value);

        // 6141 is the text "A"; 04 is the identification of the ampere.
        expect(bytesToHex(canonical)).toBe('D9ACDC83C4822018320422');
        expect(bytesToHex(canonical)).not.toBe(symbolic!.hex);

    });

});


describe('what the vectors say about the readings', () => {

    const byReading = new Map(VECTORS.map(vector => [vector.reading, vector]));

    function decoded(reading: string): MetrologicalValue {
        const vector = byReading.get(reading);
        expect(vector, reading).toBeDefined();
        return decodeMetrologicalValue(hexToBytes(vector!.hex));
    }

    it('keeps the trailing zero of 5.0 mA', () => {

        const value = decoded('5.0 mA');

        expect(formatDecimal(value.value)).toBe('5.0');
        expect(value.prefix).toBe(SIPrefix.Milli);

    });

    it('keeps both decimal places of 1.10 kWh', () => {
        expect(formatDecimal(decoded('1.10 kWh').value)).toBe('1.10');
    });

    it('writes the prefix of (5 +/- 0.5) A explicitly although it is zero', () => {

        // The array is positional and the uncertainty is trailing, so the
        // prefix has to be there for it to be reached.
        const item = decodeCbor(hexToBytes(byReading.get('(5 +/- 0.5) A')!.hex));

        expect(diagnostic(item)).toBe('44252([5, 4, 0, 4([-1, 5])])');
        expect(decoded('(5 +/- 0.5) A').prefix).toBe(SIPrefix.None);

    });

    it('keeps the coverage factor of the calibration certificate', () => {

        const value = decoded('(230.00 +/- 0.12) V, k = 2');

        expect(formatDecimal(value.value)).toBe('230.00');
        expect(formatDecimal(value.uncertainty!.magnitude)).toBe('0.12');
        expect(formatDecimal(value.uncertainty!.coverageFactor!)).toBe('2');
        expect(uncertaintyForm(value.uncertainty!)).toBe('map');

    });

    it('reads the acceleration as a product of two powers', () => {

        const value = decoded('9.81 m*s^-2');

        expect(value.unit.kind).toBe('product');
        if (value.unit.kind !== 'product')
            throw new Error('unreachable');

        expect(value.unit.factors).toHaveLength(2);
        expect(value.unit.factors[0]?.unit.unit.symbol).toBe('m');
        expect(value.unit.factors[1]?.unit.unit.symbol).toBe('s');
        expect(value.unit.factors[1]?.exponent).toStrictEqual({ kind: 'integer', value: -2 });

    });

    it('reads the spectral density with its rational power', () => {

        const value = decoded('4.5 nV*Hz^-1/2');

        if (value.unit.kind !== 'product')
            throw new Error('unreachable');

        expect(value.unit.factors[1]?.exponent).toStrictEqual({ kind: 'rational', numerator: -1, denominator: 2 });
        expect(value.prefix).toBe(SIPrefix.Nano);

    });

    it('reads the symbolic unit as the ampere, remembering the spelling', () => {

        const value = decoded('5.0 mA, symbolic unit');

        expect(value.unit.kind).toBe('named');
        if (value.unit.kind !== 'named')
            throw new Error('unreachable');

        expect(value.unit.unit.id).toBe(Units.Ampere);
        expect(value.unit.written).toStrictEqual({ form: 'symbol', spelling: 'A' });

    });

});


// ---------------------------------------------------------------------------
// Against the specification itself
// ---------------------------------------------------------------------------

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_PATH = join(ROOT, 'spec', 'README.md');
const PRESENT   = existsSync(SPEC_PATH);


/**
 * The `| reading | encoding |` rows of Section 5 whose encoding is hexadecimal.
 *
 * Read here rather than inside the `describe`, and returning nothing where the
 * specification is absent, because `it.each` needs its cases while the suite is
 * being *collected* — and a suite is collected even when it is about to be
 * skipped. Reading the file behind `describe.skipIf` therefore did not guard it
 * at all: the guard suppressed the tests and the read threw first.
 *
 * That is what broke the first release. The specification is fetched rather
 * than committed, CI fetches it before testing and the release workflow does
 * not, so a suite that was supposed to skip failed instead — and it failed only
 * where nobody had a working copy of the document lying about, which is
 * everywhere except a maintainer's machine.
 */
function specificationTable(): { reading: string; hex: string }[] {

    if (!PRESENT)
        return [];

    const document = readFileSync(SPEC_PATH, 'utf8');
    const rows: { reading: string; hex: string }[] = [];

    for (const line of document.split(/\r?\n/)) {

        const match = /^\|\s*`([^`]+)`[^|]*\|\s*`([0-9A-F][0-9A-F ]*)`\s*\|$/.exec(line);
        if (match === null)
            continue;

        rows.push({ reading: match[1] ?? '', hex: (match[2] ?? '').replace(/\s/g, '') });

    }

    return rows;

}


const TABLE = specificationTable();


describe.skipIf(!PRESENT)('the table of Section 5', () => {

    it('is parsed, and holds ten encodings', () => {
        expect(TABLE).toHaveLength(10);
    });

    it('holds exactly the encodings this suite tests', () => {

        const fromSpecification = TABLE.map(row => row.hex).sort();
        const fromTests         = VECTORS.map(vector => vector.hex).sort();

        expect(fromTests).toStrictEqual(fromSpecification);

    });

    // `TABLE` is empty where the specification is absent, and `it.each([])`
    // registers no cases — which is the same nothing the skip would have
    // produced, arrived at without reading a file that is not there.
    it.each(TABLE)('decodes and re-encodes $hex', ({ hex }) => {

        const value = decodeMetrologicalValue(hexToBytes(hex));

        expect(bytesToHex(encodeMetrologicalValue(value, { units: 'preserve' }))).toBe(hex);

    });

});
