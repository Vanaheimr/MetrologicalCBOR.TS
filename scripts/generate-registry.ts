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
 * Generates `src/registry/units.generated.ts` from `src/registry/units.json`.
 *
 *   npm run generate:registry     write the generated file
 *   npm run check:registry        fail if the generated file is out of date
 *
 * The generator is also a validator. It rejects a source file whose
 * identifications are not ascending, whose symbols or aliases collide, whose
 * symbols are not in Unicode Normalization Form C, or whose stated CBOR
 * encoding does not match the encoding it computes itself. That last check
 * makes the `cbor` field of the source a cross-check against the
 * specification table rather than a duplication of it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }               from 'node:path';
import { fileURLToPath }               from 'node:url';

const HERE   = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(HERE, '..');
const SOURCE = join(ROOT, 'src', 'registry', 'units.json');
const TARGET = join(ROOT, 'src', 'registry', 'units.generated.ts');

const SOURCE_NAME = 'src/registry/units.json';
const TARGET_NAME = 'src/registry/units.generated.ts';


// ---------------------------------------------------------------------------
// The validated model
// ---------------------------------------------------------------------------

interface UnitRecord {
    readonly id:        number;
    readonly cbor:      string;
    readonly symbol:    string;
    readonly name:      string;
    readonly constant:  string;
    readonly aliases:   readonly string[];
    readonly senml:     string | undefined;
    readonly affine:    boolean;
    readonly note:      string | undefined;
}

interface Specification {
    readonly title:    string;
    readonly version:  string;
    readonly date:     string;
    readonly section:  string;
    readonly tag:      number;
}

interface Identifications {
    readonly reserved:              number;
    readonly specificationManaged:  readonly [number, number];
    readonly privateUse:            readonly [number, number];
    readonly maximum:               number;
}

interface RegistryModel {
    readonly specification:    Specification;
    readonly identifications:  Identifications;
    readonly units:            readonly UnitRecord[];
}


class SourceError extends Error {}

function fail(message: string): never {
    throw new SourceError(message);
}


// ---------------------------------------------------------------------------
// Reading and validating the source
// ---------------------------------------------------------------------------

function asRecord(value: unknown, where: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        fail(`${where}: expected an object`);
    return value as Record<string, unknown>;
}

function asString(value: unknown, where: string): string {
    if (typeof value !== 'string' || value.length === 0)
        fail(`${where}: expected a non-empty string`);
    return value;
}

function asInteger(value: unknown, where: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value))
        fail(`${where}: expected an integer`);
    return value;
}

function asOptionalString(value: unknown, where: string): string | undefined {
    if (value === undefined)
        return undefined;
    return asString(value, where);
}

function asIntegerPair(value: unknown, where: string): readonly [number, number] {
    if (!Array.isArray(value) || value.length !== 2)
        fail(`${where}: expected a pair of integers`);
    return [asInteger(value[0], `${where}[0]`), asInteger(value[1], `${where}[1]`)];
}

/**
 * The CBOR encoding of an unsigned integer, as uppercase hexadecimal
 * (RFC 8949, Section 3, major type 0, shortest form).
 */
function cborUnsigned(value: number): string {

    const hex = (v: number, digits: number): string =>
        v.toString(16).toUpperCase().padStart(digits, '0');

    if (value < 24)      return hex(value, 2);
    if (value < 0x100)   return '18' + hex(value, 2);
    if (value < 0x10000) return '19' + hex(value, 4);

    fail(`cannot encode ${String(value)}: outside the registry range`);

}

function readSource(): RegistryModel {

    const raw  = asRecord(JSON.parse(readFileSync(SOURCE, 'utf8')), SOURCE_NAME);

    const spec = asRecord(raw['specification'], 'specification');
    const specification: Specification = {
        title:   asString (spec['title'],   'specification.title'),
        version: asString (spec['version'], 'specification.version'),
        date:    asString (spec['date'],    'specification.date'),
        section: asString (spec['section'], 'specification.section'),
        tag:     asInteger(spec['tag'],     'specification.tag'),
    };

    const ids = asRecord(raw['identifications'], 'identifications');
    const identifications: Identifications = {
        reserved:             asInteger   (ids['reserved'],             'identifications.reserved'),
        specificationManaged: asIntegerPair(ids['specificationManaged'], 'identifications.specificationManaged'),
        privateUse:           asIntegerPair(ids['privateUse'],           'identifications.privateUse'),
        maximum:              asInteger   (ids['maximum'],              'identifications.maximum'),
    };

    const rawUnits = raw['units'];
    if (!Array.isArray(rawUnits) || rawUnits.length === 0)
        fail('units: expected a non-empty array');

    const units:     UnitRecord[]     = [];
    const seenId = new Map<number, string>();
    const seenName = new Map<string, string>();
    const seenConst = new Map<string, string>();

    let previousId = 0;

    for (const [index, entry] of rawUnits.entries()) {

        const where = `units[${String(index)}]`;
        const unit  = asRecord(entry, where);

        const id       = asInteger(unit['id'],       `${where}.id`);
        const cbor     = asString (unit['cbor'],     `${where}.cbor`);
        const symbol   = asString (unit['symbol'],   `${where}.symbol`);
        const name     = asString (unit['name'],     `${where}.name`);
        const constant = asString (unit['constant'], `${where}.constant`);

        // -- Identification -------------------------------------------------

        if (id < identifications.specificationManaged[0] || id > identifications.specificationManaged[1])
            fail(`${where}: identification ${String(id)} is outside the range the specification manages`);

        if (id <= previousId)
            fail(`${where}: identification ${String(id)} does not follow ${String(previousId)}; the file must be in ascending order`);

        previousId = id;

        // -- The CBOR encoding stated by the specification table -------------

        const computed = cborUnsigned(id);
        if (cbor !== computed)
            fail(`${where}: identification ${String(id)} encodes as ${computed}, but the source says ${cbor}`);

        // -- Symbol and aliases ---------------------------------------------

        if (symbol.normalize('NFC') !== symbol)
            fail(`${where}: the symbol ${JSON.stringify(symbol)} is not in Unicode Normalization Form C`);

        const rawAliases = unit['aliases'];
        if (!Array.isArray(rawAliases))
            fail(`${where}.aliases: expected an array`);

        const aliases = rawAliases.map((alias, aliasIndex) => {
            const value = asString(alias, `${where}.aliases[${String(aliasIndex)}]`);
            if (value.normalize('NFC') !== value)
                fail(`${where}: the alias ${JSON.stringify(value)} is not in Unicode Normalization Form C`);
            return value;
        });

        for (const spelling of [symbol, ...aliases]) {
            const owner = seenName.get(spelling);
            if (owner !== undefined)
                fail(`${where}: the spelling ${JSON.stringify(spelling)} is already used by ${owner}`);
            seenName.set(spelling, `identification ${String(id)}`);
        }

        // -- Constant name --------------------------------------------------

        if (!/^[A-Z][A-Za-z0-9]*$/.test(constant))
            fail(`${where}: the constant ${JSON.stringify(constant)} is not a PascalCase identifier`);

        const constantOwner = seenConst.get(constant);
        if (constantOwner !== undefined)
            fail(`${where}: the constant ${constant} is already used by ${constantOwner}`);
        seenConst.set(constant, `identification ${String(id)}`);

        const idOwner = seenId.get(id);
        if (idOwner !== undefined)
            fail(`${where}: identification ${String(id)} is already used by ${idOwner}`);
        seenId.set(id, constant);

        // -- Optional fields -------------------------------------------------

        const affineRaw = unit['affine'];
        if (affineRaw !== undefined && typeof affineRaw !== 'boolean')
            fail(`${where}.affine: expected a boolean`);

        units.push({
            id,
            cbor,
            symbol,
            name,
            constant,
            aliases,
            senml:  asOptionalString(unit['senml'], `${where}.senml`),
            affine: affineRaw === true,
            note:   asOptionalString(unit['note'],  `${where}.note`),
        });

    }

    return { specification, identifications, units };

}


// ---------------------------------------------------------------------------
// Emitting the TypeScript
// ---------------------------------------------------------------------------

/**
 * A TypeScript string literal in which every non-ASCII character is escaped.
 *
 * The unit symbols contain characters such as U+03A9 and U+2030, and this
 * library is used where a mangled byte is a defect rather than a typo. Keeping
 * the runtime-relevant literals to plain ASCII removes the file encoding as a
 * possible source of that defect.
 *
 * Written without a character class of literal non-ASCII characters, for the
 * same reason: this function must not depend on its own file being decoded
 * correctly.
 */
function tsString(value: string): string {

    const json = JSON.stringify(value);
    let   out  = '';

    for (let index = 0; index < json.length; index++) {
        const code = json.charCodeAt(index);
        out += code < 0x80
                   ? json.charAt(index)
                   : '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
    }

    return out;

}

function emit(model: RegistryModel): string {

    const { specification, identifications, units } = model;
    const out: string[] = [];

    out.push('/*');
    out.push(' * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>');
    out.push(' * This file is part of Metrological CBOR <https://github.com/OpenChargingCloud/MetrologicalCBOR.TS>');
    out.push(' *');
    out.push(' * Licensed under the Apache License, Version 2.0 (the "License");');
    out.push(' * you may not use this file except in compliance with the License.');
    out.push(' * You may obtain a copy of the License at');
    out.push(' *');
    out.push(' *     http://www.apache.org/licenses/LICENSE-2.0');
    out.push(' *');
    out.push(' * Unless required by applicable law or agreed to in writing, software');
    out.push(' * distributed under the License is distributed on an "AS IS" BASIS,');
    out.push(' * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.');
    out.push(' * See the License for the specific language governing permissions and');
    out.push(' * limitations under the License.');
    out.push(' */');
    out.push('');
    out.push('/* eslint-disable */');
    out.push('');
    out.push('// THIS FILE IS GENERATED. DO NOT EDIT.');
    out.push('//');
    out.push('//   source:    ' + SOURCE_NAME);
    out.push('//   generator: scripts/generate-registry.ts');
    out.push('//   command:   npm run generate:registry');
    out.push('//');
    out.push('// Every string literal below is escaped to plain ASCII on purpose, so that the');
    out.push('// unit symbols cannot be damaged by a file encoding mishap. The comments keep');
    out.push('// the readable spelling.');
    out.push('');
    out.push("import type { UnitDefinition } from './types.js';");
    out.push('');
    out.push('');

    // -- The specification this registry was transcribed from ---------------

    out.push('/**');
    out.push(' * The specification revision this registry was transcribed from.');
    out.push(' */');
    out.push('export const REGISTRY_SPECIFICATION = Object.freeze({');
    out.push('    title:   ' + tsString(specification.title)   + ',');
    out.push('    version: ' + tsString(specification.version) + ',');
    out.push('    date:    ' + tsString(specification.date)    + ',');
    out.push('    section: ' + tsString(specification.section) + ',');
    out.push('} as const);');
    out.push('');
    out.push('');

    // -- The identification ranges ------------------------------------------

    out.push('/** The unit identification 0, reserved and never valid on the wire. */');
    out.push('export const UNIT_ID_RESERVED = ' + String(identifications.reserved) + ';');
    out.push('');
    out.push('/** The lowest valid unit identification. */');
    out.push('export const UNIT_ID_MIN = ' + String(identifications.specificationManaged[0]) + ';');
    out.push('');
    out.push('/** The highest unit identification the specification manages. */');
    out.push('export const UNIT_ID_SPECIFICATION_MAX = ' + String(identifications.specificationManaged[1]) + ';');
    out.push('');
    out.push('/** The lowest unit identification available for private use. */');
    out.push('export const UNIT_ID_PRIVATE_USE_MIN = ' + String(identifications.privateUse[0]) + ';');
    out.push('');
    out.push('/** The highest valid unit identification. Anything above is an error. */');
    out.push('export const UNIT_ID_MAX = ' + String(identifications.maximum) + ';');
    out.push('');
    out.push('');

    // -- The named constants -------------------------------------------------

    out.push('/**');
    out.push(' * The identification of every unit the specification registers.');
    out.push(' *');
    out.push(' * Encoders should use the numeric identification rather than the symbol:');
    out.push(' * it costs one byte up to 23 and two beyond, where a symbol costs its length');
    out.push(' * plus one.');
    out.push(' */');
    out.push('export const Units = Object.freeze({');
    out.push('');

    for (const unit of units) {
        out.push('    /** ' + unit.name + ' - `' + unit.symbol + '` (identification ' + String(unit.id) + ', CBOR `' + unit.cbor + '`) */');
        out.push('    ' + unit.constant + ': ' + String(unit.id) + ',');
        out.push('');
    }

    out.push('} as const);');
    out.push('');
    out.push('');
    out.push('/** The name of a unit constant, for example `Volt`. */');
    out.push('export type UnitConstantName = keyof typeof Units;');
    out.push('');
    out.push('/** The identification of a unit the specification registers. */');
    out.push('export type StandardUnitId = (typeof Units)[UnitConstantName];');
    out.push('');
    out.push('');

    // -- The definitions -----------------------------------------------------

    out.push('/**');
    out.push(' * Every unit of specification Section ' + specification.section + ', in the order of its table.');
    out.push(' */');
    out.push('export const STANDARD_UNITS: readonly UnitDefinition[] = Object.freeze([');
    out.push('');

    for (const unit of units) {

        out.push('    // ' + String(unit.id).padStart(3) + '  ' + unit.symbol + '  ' + unit.name);
        out.push('    Object.freeze({');
        out.push('        id:         ' + String(unit.id) + ',');
        out.push('        symbol:     ' + tsString(unit.symbol) + ',');
        out.push('        name:       ' + tsString(unit.name) + ',');
        out.push('        aliases:    Object.freeze([' + unit.aliases.map(tsString).join(', ') + ']),');
        out.push('        senml:      ' + (unit.senml === undefined ? 'undefined' : tsString(unit.senml)) + ',');
        out.push('        affine:     ' + String(unit.affine) + ',');
        out.push('        privateUse: false,');
        out.push('        note:       ' + (unit.note === undefined ? 'undefined' : tsString(unit.note)) + ',');
        out.push('    }),');
        out.push('');

    }

    out.push(']);');
    out.push('');

    return out.join('\n');

}


// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function normalise(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

function main(): number {

    const check = process.argv.includes('--check');

    let generated: string;
    try {
        generated = emit(readSource());
    }
    catch (error) {
        if (error instanceof SourceError) {
            console.error(`\n  ${SOURCE_NAME} is invalid:\n\n    ${error.message}\n`);
            return 1;
        }
        throw error;
    }

    if (check) {

        let existing: string;
        try {
            existing = normalise(readFileSync(TARGET, 'utf8'));
        }
        catch {
            console.error(`\n  ${TARGET_NAME} does not exist. Run: npm run generate:registry\n`);
            return 1;
        }

        if (existing !== normalise(generated)) {
            console.error(`\n  ${TARGET_NAME} is out of date with respect to ${SOURCE_NAME}.`);
            console.error('  Run: npm run generate:registry\n');
            return 1;
        }

        console.log(`${TARGET_NAME} is up to date.`);
        return 0;

    }

    writeFileSync(TARGET, generated, 'utf8');
    console.log(`Wrote ${TARGET_NAME}.`);
    return 0;

}

process.exit(main());
