/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A reading, on the wire and back.
 *
 *     npx tsx examples/01-a-reading.ts
 *
 * The point of the format in nine bytes: a number, a unit, and the resolution
 * the instrument actually reported.
 */

import {
    bytesToHex, decimal, decodeMetrologicalValue, encodeMetrologicalValue,
    formatMetrologicalValue, hexToBytes, metrologicalValue, SIPrefix,
    unitById, Units,
} from '../src/index.js';


// --- Reading one ------------------------------------------------------------

// 44252([4([-1, 50]), 4, -3]) — nine bytes.
const wire    = hexToBytes('D9ACDC83C4822018320422');
const reading = decodeMetrologicalValue(wire);

console.log('the bytes        ', bytesToHex(wire));
console.log('the reading      ', formatMetrologicalValue(reading));
console.log('the number       ', reading.formatValue());
console.log('the unit         ', reading.unit.kind === 'named' ? reading.unit.unit.name : '(a product)');
console.log('the prefix       ', reading.prefix, '(milli)');

// The trailing zero is not decoration. `5.0` says the instrument resolved to
// a tenth; `5` would say it resolved to a unit. They are different readings.
console.log('scale kept       ', reading.formatValue() === '5.0');

// And what came in is what goes out, byte for byte — which is what makes a
// signature over the bytes a signature over the reading.
console.log('bytes reproduced ', bytesToHex(encodeMetrologicalValue(reading)) === bytesToHex(wire));


// --- Writing one ------------------------------------------------------------

// 1.10 kWh, exactly: mantissa 110, exponent -2. Never 1.1, and never a float.
const energy = metrologicalValue({
    value:  decimal(110n, -2),
    unit:   unitById(Units.WattHour),
    prefix: SIPrefix.Kilo,
});

console.log();
console.log('written          ', formatMetrologicalValue(energy));
console.log('as bytes         ', bytesToHex(encodeMetrologicalValue(energy)));

// The same reading always produces the same bytes. RFC 8949 Section 4.2.1 and
// specification Section 6: that is what makes the encoding signable.
console.log('deterministic    ',
            bytesToHex(encodeMetrologicalValue(energy)) === bytesToHex(encodeMetrologicalValue(energy)));


// --- What is refused --------------------------------------------------------

console.log();

for (const [what, hex] of [
    ['a float reading',      'D9ACDC82FB3FF199999999999A04'],
    ['an unknown unit',      'D9ACDC820519FFFF'],
    ['a prefix of 4',        'D9ACDC83050404'],
    ['a negative uncertainty', 'D9ACDC8405040020'],
] as const) {
    try {
        decodeMetrologicalValue(hexToBytes(hex));
        console.log(`${what.padEnd(24)} accepted — which it should not be`);
    }
    catch (error) {
        console.log(`${what.padEnd(24)} ${(error as { code: string }).code}`);
    }
}
