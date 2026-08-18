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
 * The text format, as a second encoding of a reading.
 *
 * The claim under test is losslessness: text written by the renderer parses
 * back to the same reading and therefore to the same canonical bytes. That is
 * what the JSON mapping rests on, so a case that fails here is a measurement
 * that would be corrupted by a trip through JSON.
 */

import { describe, expect, it } from 'vitest';

import { bytesToHex, hexToBytes } from '../../src/cbor/hex.js';
import { decodeMetrologicalValue, encodeMetrologicalValue } from '../../src/codec/index.js';
import { formatMetrologicalValue, parseMetrologicalValue } from '../../src/text/index.js';
import { tryResolveUnitToken }   from '../../src/text/parse.js';
import { fromSuperscript, toSuperscript } from '../../src/text/symbols.js';
import { UnitRegistry }          from '../../src/registry/index.js';
import { Units }                 from '../../src/registry/units.generated.js';
import { codeOf }                from '../support/errors.js';

const MICRO_SIGN     = 'µ';
const GREEK_SMALL_MU = 'μ';
const OHM            = 'Ω';
const OHM_SIGN       = 'Ω';
const DEGREE_CELSIUS = '°C';
const MIDDLE_DOT     = '·';
const PLUS_MINUS     = '±';
const SQUARE_METER   = 'm²';
const SUPER_MINUS_2  = '⁻²';
const TIMES_TEN_3    = '×10³';


/** The bytes of a reading given as text, through the model. */
function bytesOf(text: string): string {
    return bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(text)));
}

/** The canonical text of a reading given as bytes. */
function textOf(hex: string): string {
    return formatMetrologicalValue(decodeMetrologicalValue(hexToBytes(hex)));
}


describe('the readings of Section 5', () => {

    // The specification's own reading column, against its own encodings.
    const READINGS: readonly (readonly [text: string, hex: string])[] = [
        ['5 A',                                   'D9ACDC820504'],
        ['230 V',                                 'D9ACDC8218E605'],
        ['5.0 mA',                                'D9ACDC83C4822018320422'],
        ['1.10 kWh',                              'D9ACDC83C48221186E0203'],
        [`(5.00 ${PLUS_MINUS}0.02) mA`,           'D9ACDC84C482211901F40422C4822102'],
        [`(5 ${PLUS_MINUS}0.5) A`,                'D9ACDC84050400C4822005'],
        [`9.81 m${MIDDLE_DOT}s${SUPER_MINUS_2}`,  'D9ACDC82C482211903D582820F01820821'],
        [`(230.00 ${PLUS_MINUS}0.12) V, k=2`,     'D9ACDC84C482211959D80500A201C482210C0202'],
        [`4.5 nV${MIDDLE_DOT}Hz^-1/2`,            'D9ACDC83C48220182D82820501820982200228'],
    ];

    it.each(READINGS)('writes %s from its bytes', (text, hex) => {
        expect(textOf(hex)).toBe(text);
    });

    it.each(READINGS)('reads %s back to its bytes', (text, hex) => {
        expect(bytesOf(text)).toBe(hex);
    });

});


describe('the decimal scale', () => {

    it('survives, which is the whole point', () => {

        // 1.10 and 1.1 are different readings of the same quantity.
        expect(bytesOf('1.10 kWh')).not.toBe(bytesOf('1.1 kWh'));
        expect(textOf(bytesOf('1.10 kWh'))).toBe('1.10 kWh');
        expect(textOf(bytesOf('1.100 kWh'))).toBe('1.100 kWh');

    });

    it('distinguishes an integer from a fraction of the same value', () => {

        // 5 is a plain integer on the wire; 5e0 is a decimal fraction that
        // happens to have no fractional digits. Different bytes, so the text
        // has to tell them apart too.
        expect(bytesOf('5 A')).toBe('D9ACDC820504');
        expect(bytesOf('5e0 A')).toBe('D9ACDC82C48200050 4'.replace(/\s/g, ''));
        expect(textOf(bytesOf('5e0 A'))).toBe('5e0 A');

    });

    it('writes a coarse resolution in scientific form rather than positionally', () => {

        // 5e2 states a resolution of a hundred. Writing it as 500 would read
        // back as an integer and claim a resolution of one.
        expect(textOf(bytesOf('5e2 A'))).toBe('5e2 A');
        expect(bytesOf('5e2 A')).not.toBe(bytesOf('500 A'));

    });

});


describe('prefixes', () => {

    it('are folded into the symbol where that is what the SI means', () => {
        expect(textOf(bytesOf('5.0 mA'))).toBe('5.0 mA');
        expect(textOf(bytesOf('1.10 kWh'))).toBe('1.10 kWh');
        expect(textOf(bytesOf(`21.5 m${DEGREE_CELSIUS}`))).toBe(`21.5 m${DEGREE_CELSIUS}`);
    });

    it('are folded onto the leading factor of a product', () => {

        // The specification's own example: [3, [[15,1],[8,-2]]] is km*s^-2,
        // meaning the whole reading scaled by 1000.
        const text = textOf('D9ACDC83C482211903D582820F0182082103');

        expect(text).toBe(`9.81 km${MIDDLE_DOT}s${SUPER_MINUS_2}`);
        expect(bytesOf(text)).toBe('D9ACDC83C482211903D582820F0182082103');

    });

    it('become a factor of ten where folding them would square them', () => {

        // km^2 is a square kilometre - a million square metres, not a
        // thousand - so the prefix cannot go on the symbol.
        const text = textOf('D9ACDC8305188C03');

        expect(text).toBe(`5${TIMES_TEN_3} ${SQUARE_METER}`);
        expect(bytesOf(text)).toBe('D9ACDC8305188C03');

    });

    it('become a factor of ten on a product whose leading power is not one', () => {

        // s^-2 alone: folding a prefix onto s would raise it to the power -2.
        const text = textOf('D9ACDC8305818208210 3'.replace(/\s/g, ''));

        expect(text).toContain(TIMES_TEN_3);
        expect(bytesOf(text)).toBe('D9ACDC830581820821 03'.replace(/\s/g, ''));

    });

    it('reject a reading that carries one twice', () => {
        expect(codeOf(() => parseMetrologicalValue(`5${TIMES_TEN_3} mA`))).toBe('ERR_TEXT_SYNTAX');
    });

});


describe('the dimensionless unit', () => {

    it('is written as a bare number', () => {
        expect(textOf(bytesOf('0.95'))).toBe('0.95');
        expect(bytesOf('0.95')).toBe('D9ACDC82C48221185F01');
    });

    it('is what a bare number reads back as', () => {

        const value = parseMetrologicalValue('0.95');

        expect(value.unit.kind).toBe('named');
        if (value.unit.kind === 'named')
            expect(value.unit.unit.id).toBe(Units.One);

    });

    it('takes a prefix as a factor of ten, having no symbol to fold it into', () => {
        expect(textOf(bytesOf(`5${TIMES_TEN_3}`))).toBe(`5${TIMES_TEN_3}`);
    });

    it('is not the same as percent, which has a symbol', () => {
        expect(textOf(bytesOf('95 %'))).toBe('95 %');
        expect(bytesOf('95 %')).not.toBe(bytesOf('95'));
    });

});


describe('tokenising a unit', () => {

    it('tries the whole token before splitting a prefix off it', () => {

        // Each of these would mean something else entirely if a prefix were
        // peeled off first.
        expect(parseMetrologicalValue('1 cd').unit).toMatchObject({ unit: { name: 'candela' } });
        expect(parseMetrologicalValue('1 min').unit).toMatchObject({ unit: { name: 'minute' } });
        expect(parseMetrologicalValue('1 kat').unit).toMatchObject({ unit: { name: 'katal' } });
        expect(parseMetrologicalValue('1 mol').unit).toMatchObject({ unit: { name: 'mole' } });
        expect(parseMetrologicalValue('1 Pa').unit).toMatchObject({ unit: { name: 'pascal' } });
        expect(parseMetrologicalValue('1 rad').unit).toMatchObject({ unit: { name: 'radian' } });
        expect(parseMetrologicalValue('1 ppm').unit).toMatchObject({ unit: { name: 'parts per million' } });

    });

    it('splits a prefix off where the whole token is not a unit', () => {

        expect(parseMetrologicalValue('1 mA').prefix).toBe(-3);
        expect(parseMetrologicalValue('1 kWh').prefix).toBe(3);
        expect(parseMetrologicalValue('1 mm').prefix).toBe(-3);
        expect(parseMetrologicalValue('1 mT').prefix).toBe(-3);
        expect(parseMetrologicalValue('1 nm').prefix).toBe(-9);
        expect(parseMetrologicalValue('1 MWh').prefix).toBe(6);

    });

    it('takes the longer prefix first, so das is a decasecond', () => {

        const value = parseMetrologicalValue('1 das');

        expect(value.prefix).toBe(1);
        expect(value.unit).toMatchObject({ unit: { name: 'second' } });

    });

    it('reads the kilogram as kilo and gram, which is how the SI writes it', () => {

        // The base unit of mass is the kilogram, but prefixes attach to the
        // gram, so five kilograms is (5, 16, 3).
        const value = parseMetrologicalValue('5 kg');

        expect(value.prefix).toBe(3);
        expect(value.unit).toMatchObject({ unit: { id: Units.Gram } });
        expect(bytesOf('5 kg')).toBe('D9ACDC83051003');

    });

    it('distinguishes case, so the tesla is not the tonne', () => {

        expect(parseMetrologicalValue('1 T').unit).toMatchObject({ unit: { name: 'tesla' } });
        expect(parseMetrologicalValue('1 t').unit).toMatchObject({ unit: { name: 'tonne' } });
        expect(parseMetrologicalValue('1 S').unit).toMatchObject({ unit: { name: 'siemens' } });
        expect(parseMetrologicalValue('1 s').unit).toMatchObject({ unit: { name: 'second' } });
        expect(parseMetrologicalValue('1 mS').prefix).toBe(-3);
        expect(parseMetrologicalValue('1 Ms').prefix).toBe(6);

    });

    it('reads dB as a deci-byte, because the bel is not registered', () => {

        // A documented consequence rather than a defect: nothing in the
        // registry is the bel, so the token splits the only way it can.
        const value = parseMetrologicalValue('1 dB');

        expect(value.prefix).toBe(-1);
        expect(value.unit).toMatchObject({ unit: { name: 'byte' } });

    });

    it('rejects a prefix on any factor but the leading one', () => {

        // A prefix applies to the quantity as a whole, so m*(ks)^-2 is not
        // something this format can say.
        expect(codeOf(() => parseMetrologicalValue(`1 m${MIDDLE_DOT}ks${SUPER_MINUS_2}`))).toBe('ERR_UNIT_UNKNOWN');

    });

    it('rejects an unknown symbol rather than guessing', () => {
        expect(codeOf(() => parseMetrologicalValue('1 parsec'))).toBe('ERR_UNIT_UNKNOWN');
        expect(codeOf(() => parseMetrologicalValue('1 zzz'))).toBe('ERR_UNIT_UNKNOWN');
    });

});


describe('Unicode', () => {

    it('accepts both spellings of the ohm, which normalisation reconciles', () => {
        expect(bytesOf(`5 ${OHM}`)).toBe(bytesOf(`5 ${OHM_SIGN}`));
        expect(textOf(bytesOf(`5 ${OHM_SIGN}`))).toBe(`5 ${OHM}`);
    });

    it('accepts both spellings of micro, which normalisation does not', () => {

        // These differ by a compatibility mapping, so the prefix table has to
        // accept them explicitly.
        expect(MICRO_SIGN.normalize('NFC')).not.toBe(GREEK_SMALL_MU);
        expect(bytesOf(`5 ${MICRO_SIGN}A`)).toBe(bytesOf(`5 ${GREEK_SMALL_MU}A`));
        expect(textOf(bytesOf(`5 ${GREEK_SMALL_MU}A`))).toBe(`5 ${MICRO_SIGN}A`);

    });

    it('writes the degree Celsius and the permille from the registry', () => {
        expect(textOf(bytesOf(`21.5 ${DEGREE_CELSIUS}`))).toBe(`21.5 ${DEGREE_CELSIUS}`);
        expect(textOf(bytesOf('5 ‰'))).toBe('5 ‰');
        expect(textOf(bytesOf('90 °'))).toBe('90 °');
    });

});


describe('ASCII input and output', () => {

    it.each([
        ['9.81 m*s^-2',        `9.81 m${MIDDLE_DOT}s${SUPER_MINUS_2}`],
        ['9.81 m s^-2',        `9.81 m${MIDDLE_DOT}s${SUPER_MINUS_2}`],
        ['(230.00 +/-0.12) V', `(230.00 ${PLUS_MINUS}0.12) V`],
        ['(230.00 +-0.12) V',  `(230.00 ${PLUS_MINUS}0.12) V`],
        ['5x10^3 m2',          `5${TIMES_TEN_3} ${SQUARE_METER}`],
        ['4.5 nV*Hz^-1/2',     `4.5 nV${MIDDLE_DOT}Hz^-1/2`],
    ])('reads %s as %s', (ascii, canonical) => {
        expect(textOf(bytesOf(ascii))).toBe(canonical);
    });

    it('writes ASCII on request, and reads its own output back', () => {

        const value = decodeMetrologicalValue(hexToBytes('D9ACDC82C482211903D582820F01820821'));
        const ascii = formatMetrologicalValue(value, { ascii: true });

        expect(ascii).toBe('9.81 m*s^-2');
        expect(bytesOf(ascii)).toBe('D9ACDC82C482211903D582820F01820821');

    });

    it('writes an ASCII uncertainty and factor of ten', () => {

        const uncertain = decodeMetrologicalValue(hexToBytes('D9ACDC84C482211959D80500A201C482210C0202'));
        expect(formatMetrologicalValue(uncertain, { ascii: true })).toBe('(230.00 +/-0.12) V, k=2');

        const squared = decodeMetrologicalValue(hexToBytes('D9ACDC8305188C03'));
        expect(formatMetrologicalValue(squared, { ascii: true })).toBe('5x10^3 m²');

    });

});


describe('the uncertainty', () => {

    it('carries every part of a calibration certificate', () => {

        const text = textOf('D9ACDC84C482221A0012D6870203A401C48220187B020203C48221185F0401');

        expect(text).toBe(`(1234.567 ${PLUS_MINUS}12.3) kWh, k=2, p=0.95, dist=normal`);
        expect(bytesOf(text)).toBe('D9ACDC84C482221A0012D6870203A401C48220187B020203C48221185F0401');

    });

    it('carries the degrees of freedom', () => {

        const hex  = 'D9ACDC84050400A2010105182D';
        const text = textOf(hex);

        expect(text).toBe(`(5 ${PLUS_MINUS}1) A, nu=45`);
        expect(bytesOf(text)).toBe(hex);

    });

    it('accepts the Greek nu on input', () => {
        expect(bytesOf(`(5 ${PLUS_MINUS}1) A, ν=45`)).toBe(bytesOf(`(5 ${PLUS_MINUS}1) A, nu=45`));
    });

    it('rejects an extension without an uncertainty to attach it to', () => {
        expect(codeOf(() => parseMetrologicalValue('5 A, k=2'))).toBe('ERR_TEXT_SYNTAX');
    });

    it('rejects an unknown extension', () => {
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}1) A, q=2`))).toBe('ERR_TEXT_SYNTAX');
    });

    it('rejects the same statement twice', () => {
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}1) A, k=2, k=3`))).toBe('ERR_TEXT_SYNTAX');
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}1) A, p=0.95, p=0.99`))).toBe('ERR_TEXT_SYNTAX');
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}1) A, dist=normal, dist=normal`))).toBe('ERR_TEXT_SYNTAX');
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}1) A, nu=45, ν=45`))).toBe('ERR_TEXT_SYNTAX');
    });

    it('rejects an unknown distribution', () => {
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}1) A, dist=bimodal`)))
            .toBe('ERR_UNCERTAINTY_DISTRIBUTION');
    });

    it('rejects a negative uncertainty, as the model does', () => {
        expect(codeOf(() => parseMetrologicalValue(`(5 ${PLUS_MINUS}-1) A`))).toBe('ERR_UNCERTAINTY_NEGATIVE');
    });

});


describe('what the parser refuses', () => {

    it.each([
        ['',              'nothing at all'],
        ['V',             'a unit with no number'],
        ['abc',           'words'],
        ['(5 A',          'an unclosed bracket'],
        ['(5) A',         'brackets without an uncertainty'],
        ['5 A extra',     'a trailing word'],
        ['5..0 A',        'a malformed number'],
        ['5 m^',          'a caret with no exponent'],
        ['5 m^1/0',       'a zero denominator'],
        ['5.0mA',         'a missing space before the unit'],
        ['(5 ±1)A',  'a missing space after the bracket'],
    ])('rejects %s (%s)', text => {
        expect(codeOf(() => parseMetrologicalValue(text))).not.toBe('no throw');
    });

    it('rejects a prefix that is not an SI prefix', () => {
        expect(codeOf(() => parseMetrologicalValue('5x10^4 A'))).toBe('ERR_PREFIX_INVALID');
    });

    it('rejects two superscripts run together', () => {

        // This is what `m^3^-1` becomes once both exponents are written in
        // superscript, and it is the reason the renderer never writes `m³` for
        // the metre cubed. Read leniently, parseInt would take "3-1" for 3 and
        // return a reading in cubic metres.
        expect(codeOf(() => parseMetrologicalValue('1 m³⁻¹'))).toBe('ERR_TEXT_SYNTAX');

    });

});


describe('the pieces the format is assembled from', () => {

    // Reachable from the outside only in combinations the parser rejects
    // earlier, and load-bearing all the same: the renderer calls
    // tryResolveUnitToken to check its own output before writing it.

    it('reads a superscript back to ordinary digits', () => {
        expect(fromSuperscript('⁻¹²')).toBe('-12');
        expect(fromSuperscript('³')).toBe('3');
    });

    it('reads nothing from an empty superscript', () => {
        expect(fromSuperscript('')).toBeUndefined();
    });

    it('reads nothing from a character that is not one', () => {
        expect(fromSuperscript('x')).toBeUndefined();
        expect(fromSuperscript('²x')).toBeUndefined();
    });

    it('writes an integer as a superscript, sign and all', () => {
        expect(toSuperscript(-12)).toBe('⁻¹²');
        expect(toSuperscript(0)).toBe('⁰');
        expect(toSuperscript(1234567890)).toBe('¹²³⁴⁵⁶⁷⁸⁹⁰');
    });

    it('resolves nothing from an empty token', () => {
        expect(tryResolveUnitToken('', UnitRegistry.standard, true)).toBeUndefined();
    });

});
