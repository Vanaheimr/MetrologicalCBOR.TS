/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/OpenChargingCloud/MetrologicalCBOR.TS>
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
 * The unit registry against the specification it is transcribed from.
 *
 * This suite reads `spec/README.md` and compares it with the registry, entry by
 * entry and in both directions. It is the reason the data file cannot silently
 * drift away from the document: a unit added to the specification and forgotten
 * in the registry fails here, and so does a unit invented in the registry.
 *
 * It also pins the four prose passages of Section 4 that carried
 * identifications from an earlier numbering until they were corrected: the
 * alias list, the SenML paragraph, the percent reference and the note on mass.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join }    from 'node:path';
import { fileURLToPath }    from 'node:url';
import { describe, expect, it } from 'vitest';

import { UnitRegistry }     from '../../src/registry/index.js';
import { STANDARD_UNITS }   from '../../src/registry/units.generated.js';


const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_PATH = join(ROOT, 'spec', 'README.md');

// The specification is maintained in its own repository and is not committed
// here, so a fresh checkout does not have it. Where it is absent this suite
// skips rather than fails; where it is present it is authoritative, and the
// registry is compared against it entry by entry.
const SPEC_PRESENT  = existsSync(SPEC_PATH);
const SPECIFICATION = SPEC_PRESENT ? readFileSync(SPEC_PATH, 'utf8') : '';

const describeSpec = describe.skipIf(!SPEC_PRESENT);

const registry = UnitRegistry.standard;

// Non-ASCII characters are written as escapes throughout this file, so that a
// failure here always means the registry is wrong and never that the test file
// was decoded wrong.
const RIGHTWARDS_ARROW = '\u2192';
const OHM              = '\u03A9';    // GREEK CAPITAL LETTER OMEGA, the registered symbol
const OHM_SIGN         = '\u2126';    // OHM SIGN, canonically equivalent to the above
const DEGREE_CELSIUS   = '\u00B0C';
const DEGREE           = '\u00B0';
const PERMILLE         = '\u2030';
const SQUARE_METER     = 'm\u00B2';
const CUBIC_METER      = 'm\u00B3';
const MICRO_SIGN       = '\u00B5';
const GREEK_SMALL_MU   = '\u03BC';


// ---------------------------------------------------------------------------
// Parsing the specification
// ---------------------------------------------------------------------------

interface SpecificationRow {
    readonly id:     number;
    readonly cbor:   string;
    readonly symbol: string;
    readonly name:   string;
}

/** The rows of the registry table of Section 4. */
function parseTable(): SpecificationRow[] {

    const rows: SpecificationRow[] = [];

    for (const line of SPECIFICATION.split(/\r?\n/)) {

        const match = /^\|\s*(\d+)\s*\|\s*`([0-9A-F]+)`\s*\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|$/.exec(line);
        if (match === null)
            continue;

        rows.push({
            id:     Number(match[1]),
            cbor:   match[2] ?? '',
            symbol: match[3] ?? '',
            // The unit column uses bold for emphasis and one parenthetical
            // qualifier, neither of which is part of the name.
            name:   (match[4] ?? '').replace(/\*\*/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim(),
        });

    }

    return rows;

}

/**
 * The backticked spellings and the identification of one comma-separated item
 * of a prose list, for example ``  `L`/`Liter` (62)  `` or ``  `one` and `/` (1)  ``.
 */
function parseSpellingList(sentence: string): { spellings: string[]; id: number }[] {

    const items: { spellings: string[]; id: number }[] = [];

    for (const chunk of sentence.split(',')) {

        const idMatch = /\((\d+)\)/.exec(chunk);
        if (idMatch === null)
            continue;

        const spellings = [...chunk.matchAll(/`([^`]+)`/g)].map(match => match[1] ?? '');
        if (spellings.length > 0)
            items.push({ spellings, id: Number(idMatch[1]) });

    }

    return items;

}

/**
 * The first capture of a pattern applied to the specification, or the empty
 * string where it does not match.
 *
 * Returning rather than asserting keeps this usable while the suite is being
 * collected, which is where the parsed data of the tests below comes from. A
 * pattern that stops matching surfaces as an empty parse result, and every
 * block below asserts that its own parse is non-empty.
 */
function section(pattern: RegExp): string {
    return pattern.exec(SPECIFICATION)?.[1] ?? '';
}


// ---------------------------------------------------------------------------

describe('the specification document', () => {

    it('is present, or every comparison below is skipped', () => {

        if (!SPEC_PRESENT)
            console.warn(
                `\n  ${SPEC_PATH} is not present.\n` +
                '  The unit registry could not be compared against the specification.\n' +
                '  Check out the specification repository into spec/ to run these tests.\n',
            );

        expect(SPEC_PRESENT || SPECIFICATION === '').toBe(true);

    });

});


describeSpec('the registry table of Section 4', () => {

    const rows = parseTable();

    it('is parsed, and has the number of rows the registry has units', () => {
        expect(rows.length).toBeGreaterThan(0);
        expect(rows).toHaveLength(STANDARD_UNITS.length);
    });

    it.each(parseTable())('registers $id as $symbol ($name)', row => {

        const unit = registry.byId(row.id);

        expect(unit.symbol).toBe(row.symbol);
        expect(unit.name).toBe(row.name);

    });

    it('registers no unit the specification does not list', () => {

        const specified = new Set(rows.map(row => row.id));
        const surplus   = STANDARD_UNITS.filter(unit => !specified.has(unit.id));

        expect(surplus.map(unit => `${String(unit.id)} (${unit.symbol})`)).toStrictEqual([]);

    });

    it('states the CBOR encoding the identification actually has', () => {

        // The single-byte range is the scarcest thing the registry has to give
        // away, so the boundary at 23/24 is worth pinning explicitly.
        for (const row of rows)
            expect(row.cbor.length / 2, `identification ${String(row.id)}`).toBe(row.id < 24 ? 1 : 2);

    });

    it('keeps the units that dominate charging traffic in the single-byte range', () => {

        for (const symbol of ['Wh', 'W', 'A', 'V', 'Hz', 'varh'])
            expect(registry.bySymbol(symbol).id, symbol).toBeLessThan(24);

        // Taxonomy resumes above the byte boundary.
        expect(registry.bySymbol('cd').id).toBeGreaterThan(23);

    });

});


describeSpec('the alias list of Section 4', () => {

    const aliases = parseSpellingList(
        section(/Accepted symbol aliases:([\s\S]+?)\.\s/),
    );

    it('is parsed', () => {
        expect(aliases.length).toBeGreaterThan(0);
    });

    it.each(
        aliases.flatMap(({ spellings, id }) => spellings.map(spelling => ({ spelling, id }))),
    )('resolves the alias $spelling to identification $id', ({ spelling, id }) => {

        const unit = registry.bySymbol(spelling);

        expect(unit.id).toBe(id);
        expect(unit.aliases).toContain(spelling);

    });

    it('registers no alias the specification does not list', () => {

        const specified = new Set(aliases.flatMap(entry => entry.spellings));

        const surplus = STANDARD_UNITS.flatMap(
            unit => unit.aliases
                        .filter(alias => !specified.has(alias))
                        .map(alias => `${alias} (${String(unit.id)})`),
        );

        expect(surplus).toStrictEqual([]);

    });

    // These four assertions are the errata of Section 4. Before the correction
    // the prose named 2, 16, 21 and 33, which are the watt-hour, the gram, the
    // pascal and the lux.
    it('resolves Metre to the meter, not the watt-hour', () => {
        expect(registry.bySymbol('Metre').id).toBe(15);
    });

    it('resolves Ohm to the ohm, not the gram', () => {
        expect(registry.bySymbol('Ohm').id).toBe(14);
        expect(registry.bySymbol('Ohm').symbol).toBe(OHM);
    });

    it('resolves Cel to the degree Celsius, not the pascal', () => {
        expect(registry.bySymbol('Cel').id).toBe(7);
        expect(registry.bySymbol('Cel').symbol).toBe(DEGREE_CELSIUS);
    });

    it('resolves deg to the degree, not the lux', () => {
        expect(registry.bySymbol('deg').id).toBe(61);
        expect(registry.bySymbol('deg').symbol).toBe(DEGREE);
    });

});


describeSpec('the affine units of Section 4', () => {

    const affine = parseSpellingList(
        section(/\*\*Affine units\*\*[^:]*:([\s\S]+?)\.\s/),
    );

    it('names the degree Celsius', () => {

        expect(affine).toHaveLength(1);
        expect(affine[0]?.id).toBe(7);
        expect(affine[0]?.spellings).toStrictEqual([DEGREE_CELSIUS]);

    });

    it('are exactly the units the registry marks as affine', () => {

        const marked = STANDARD_UNITS.filter(unit => unit.affine).map(unit => unit.id);

        expect(marked).toStrictEqual(affine.map(entry => entry.id));

    });

});


describeSpec('the SenML paragraph of Section 4', () => {

    const identical = [
        ...section(/the symbol is either identical \(([\s\S]+?)\)/).matchAll(/`([^`]+)`/g),
    ].map(match => match[1] ?? '');

    const viaAlias = [
        ...section(/an accepted alias of ours \(([\s\S]+?)\)/)
            .matchAll(new RegExp('`([^`]+)`\\s*' + RIGHTWARDS_ARROW + '\\s*(\\d+)', 'g')),
    ].map(match => ({ spelling: match[1] ?? '', id: Number(match[2]) }));

    it('is parsed', () => {
        expect(identical.length).toBeGreaterThan(0);
        expect(viaAlias.length).toBeGreaterThan(0);
    });

    it.each(identical)('maps %s onto the identical SenML symbol', symbol => {
        expect(registry.bySymbol(symbol).senml).toBe(symbol);
    });

    it.each(viaAlias)('maps the SenML symbol $spelling onto identification $id', ({ spelling, id }) => {

        const unit = registry.byId(id);

        expect(unit.senml).toBe(spelling);
        expect(unit.aliases).toContain(spelling);

    });

    it('claims no SenML mapping the specification does not document', () => {

        const documented = new Set([...identical, ...viaAlias.map(entry => entry.spelling)]);

        const surplus = STANDARD_UNITS
                            .filter(unit => unit.senml !== undefined && !documented.has(unit.senml))
                            .map(unit => `${String(unit.id)} -> ${String(unit.senml)}`);

        expect(surplus).toStrictEqual([]);

    });

    // Errata: the prose named 21 and 39, the pascal and the steradian.
    it('maps Cel onto the degree Celsius and / onto the one', () => {
        expect(viaAlias).toStrictEqual([
            { spelling: 'Cel', id: 7 },
            { spelling: '/',   id: 1 },
        ]);
    });

    // Errata: the prose named 36, the sievert.
    it('names 6 as the identification of percent', () => {

        const id = Number(section(/this format.s percent \((\d+)\)/));

        expect(id).toBe(6);
        expect(registry.byId(id).name).toBe('percent');

    });

});


describeSpec('the note on mass of Section 4', () => {

    // Errata: the prose named 3, the watt, and encoded five kilograms as (5, 3, 3).
    it('names 16 as the identification of the gram', () => {

        const id = Number(section(/contains the gram \((\d+)\)/));

        expect(id).toBe(16);
        expect(registry.byId(id).name).toBe('gram');
        expect(registry.byId(id).symbol).toBe('g');

    });

    it('encodes five kilograms with the identification of the gram', () => {

        const id = Number(section(/`\(5, (\d+), 3\)`/));

        expect(id).toBe(registry.bySymbol('g').id);

    });

});


describeSpec('the unit factors quoted in Sections 3.2 and 3.3', () => {

    /**
     * Every product of powers the specification spells out, for example
     * `[[15, 1], [8, -2]]`.
     *
     * The match is non-greedy because Section 3.3 nests such a product inside
     * a complete value, `[3, [[15,1],[8,-2]]]`, whose trailing bracket a
     * greedy match would swallow.
     */
    const products = [...SPECIFICATION.matchAll(/\[\[[\d\s,[\]-]+?\]\]/g)]
        .map(match => {
            try       { return JSON.parse(match[0]) as unknown; }
            catch     { return undefined; }
        })
        .filter((value): value is [number, number][] =>
            Array.isArray(value) &&
            value.every(factor => Array.isArray(factor) &&
                                  factor.length === 2 &&
                                  factor.every(element => typeof element === 'number')));

    it('are parsed', () => {
        expect(products.length).toBeGreaterThanOrEqual(3);
    });

    it('reference registered units only', () => {

        for (const product of products)
            for (const [id] of product)
                expect(registry.tryById(id), `identification ${String(id)} in ${JSON.stringify(product)}`).toBeDefined();

    });

    it('spell out the acceleration and heat transfer coefficient examples', () => {

        // m*s^-2 and W*m^-2*K^-1, from Section 3.2.
        const symbols = products.map(product => product.map(([id]) => registry.byId(id).symbol));

        expect(symbols).toContainEqual(['m', 's']);
        expect(symbols).toContainEqual(['W', 'm', 'K']);

    });

});


describeSpec('the tag number', () => {

    it('is the one the specification registers with IANA', () => {

        const fromSpecification = Number(section(/[Tt]ag\s+(\d+)\s+\(`0xACDC`\)/));

        expect(fromSpecification).toBe(44252);
        expect(0xACDC).toBe(44252);

    });

});


describe('symbol spellings', () => {

    it('are all in Unicode Normalization Form C', () => {

        for (const unit of STANDARD_UNITS) {
            expect(unit.symbol.normalize('NFC'), `identification ${String(unit.id)}`).toBe(unit.symbol);
            for (const alias of unit.aliases)
                expect(alias.normalize('NFC'), `alias of ${String(unit.id)}`).toBe(alias);
        }

    });

    it('resolve the OHM SIGN onto the registered omega', () => {

        // U+2126 has a canonical decomposition to U+03A9, so normalisation
        // alone reconciles the two spellings a producer might send.
        expect(OHM_SIGN.normalize('NFC')).toBe(OHM);
        expect(registry.bySymbol(OHM_SIGN).id).toBe(14);
        expect(registry.bySymbol(OHM).id).toBe(14);

    });

    it('do not conflate the micro sign with the greek mu', () => {

        // Unlike the ohm, these two differ by a compatibility mapping rather
        // than a canonical one, so NFC keeps them apart. They are a prefix
        // rather than a unit, and reconciling them belongs to the text format.
        expect(MICRO_SIGN.normalize('NFC')).not.toBe(GREEK_SMALL_MU);

    });

    it('are unique across symbols and aliases', () => {

        const seen = new Map<string, number>();

        for (const unit of STANDARD_UNITS)
            for (const spelling of [unit.symbol, ...unit.aliases]) {
                expect(seen.get(spelling), `${spelling} is used twice`).toBeUndefined();
                seen.set(spelling, unit.id);
            }

    });

    it('distinguish case, so that the tesla is not the tonne', () => {

        expect(registry.bySymbol('T').name).toBe('tesla');
        expect(registry.bySymbol('t').name).toBe('tonne');
        expect(registry.bySymbol('S').name).toBe('siemens');
        expect(registry.bySymbol('s').name).toBe('second');
        expect(registry.bySymbol('H').name).toBe('henry');
        expect(registry.bySymbol('h').name).toBe('hour');

    });

    it('register the geometric units under both spellings', () => {

        expect(registry.bySymbol(SQUARE_METER).id).toBe(140);
        expect(registry.bySymbol('m2').id).toBe(140);
        expect(registry.bySymbol(CUBIC_METER).id).toBe(141);
        expect(registry.bySymbol('m3').id).toBe(141);

    });

    it('register the permille', () => {
        expect(registry.bySymbol(PERMILLE).id).toBe(64);
    });

});
