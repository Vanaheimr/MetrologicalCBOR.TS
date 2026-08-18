/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A unit the registry has never heard of.
 *
 *     npx tsx examples/05-a-private-unit.ts
 *
 * Identifications 32768..65535 are private use. Everything below that belongs
 * to the specification and stays where it is, so a value written today decodes
 * identically in twenty years — the horizon calibration law works on.
 */

import {
    bytesToHex, decodeMetrologicalValue, encodeMetrologicalValue,
    formatMetrologicalValue, hexToBytes, parseMetrologicalValue,
    UnitRegistry, Units,
} from '../src/index.js';


const standard = UnitRegistry.standard;

console.log('the volt         ', standard.byId(Units.Volt).symbol, '=', standard.byId(Units.Volt).id);
console.log('by symbol        ', standard.bySymbol('Wh').name);
console.log('by alias         ', standard.bySymbol('Ohm').name, '— the alias resolves');
console.log('by OHM SIGN      ', standard.bySymbol('Ω').name, '— U+2126 normalises onto U+03A9');
console.log('affine           ', standard.byId(Units.DegreeCelsius).symbol,
            standard.byId(Units.DegreeCelsius).affine);


// --- Registering one --------------------------------------------------------

// A registry is immutable, so an application adding a unit of its own cannot
// change how unrelated code decodes the wire. `withPrivateUnits` returns a new
// registry and leaves the standard one alone.
const extended = standard.withPrivateUnits(
    { id: 40000, symbol: 'flurbo', name: 'flurbo',  aliases: ['flb'] },
    { id: 40001, symbol: 'blicket', name: 'blicket' },
);

console.log();
console.log('registered       ', extended.byId(40000).name, 'and', extended.byId(40001).name);
console.log('by alias         ', extended.bySymbol('flb').id);
console.log('standard is intact', standard.tryById(40000) === undefined);


// --- Reading and writing with it --------------------------------------------

// 44252([5, 40000])
const wire = hexToBytes('D9ACDC8205199C40');

console.log();

try {
    decodeMetrologicalValue(wire);
    console.log('without registry  accepted — which it should not be');
}
catch (error) {
    console.log('without registry ', (error as { code: string }).code);
}

const reading = decodeMetrologicalValue(wire, { registry: extended });

console.log('with registry    ', formatMetrologicalValue(reading, { registry: extended }));
console.log('and back         ', bytesToHex(encodeMetrologicalValue(reading)) === bytesToHex(wire));

// The text format resolves against the same registry, both ways.
console.log('from text        ',
            bytesToHex(encodeMetrologicalValue(parseMetrologicalValue('5 flurbo', { registry: extended }))));


// --- What is refused --------------------------------------------------------

console.log();

for (const [what, register] of [
    ['outside private use',   () => standard.withPrivateUnits({ id: 500,   symbol: 'x', name: 'x' })],
    ['a symbol already used', () => standard.withPrivateUnits({ id: 40000, symbol: 'V', name: 'x' })],
    ['an alias already used', () => standard.withPrivateUnits({ id: 40000, symbol: 'x', name: 'x', aliases: ['Ohm'] })],
    ['two of the same symbol', () => standard.withPrivateUnits({ id: 40000, symbol: 'x', name: 'x' },
                                                               { id: 40001, symbol: 'x', name: 'y' })],
] as const) {
    try {
        register();
        console.log(`${what.padEnd(23)} accepted — which it should not be`);
    }
    catch (error) {
        console.log(`${what.padEnd(23)} ${(error as { code: string }).code}`);
    }
}
