/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A whole meter reading through JSON, with the measurement intact.
 *
 *     npx tsx examples/02-a-document-through-json.ts
 *
 * The payload of the worked example of the specification, converted to a plain
 * JSON object a person can read, and read back.
 */

import {
    bytesToHex, decodeHex, diagnostic, hexToBytes, jsonToMcbor, mcborToJson,
} from '../src/index.js';


/**
 * One meter reading as the meter measured it, before signing.
 *
 * From `spec/tag-44252-signed-example.md`, Section 2.
 */
const METER_READING =
    'A5656D657465726E31495341303030303030303034326B7472616E73616374696F6E6861' +
    '3466316339653267636F6E74657874715472616E73616374696F6E2E426567696E647469' +
    '6D65C074323032362D30382D31355430383A31343A30305A66656E65726779D9ACDC84C4' +
    '82221A0012D6870203A401C48220187B020203C48221185F0401';


console.log('as CBOR');
console.log(' ', diagnostic(decodeHex(METER_READING, { strict: false })));

const json = mcborToJson(hexToBytes(METER_READING));

console.log();
console.log('as JSON');
console.log(JSON.stringify(json, null, 2));

// Everything the reading said, in one string: the value, its decimal scale,
// the unit, the prefix, the magnitude of the uncertainty, the coverage factor
// it belongs to, the coverage probability and the distribution.
console.log();
console.log('the energy       ', (json as Record<string, string>)['energy']);

// And back. The document does not return byte-identically — its map was not
// written in the deterministic order and the date was a tag rather than a
// string — but every member survives, and the measurement is exact.
const back = mcborToJson(jsonToMcbor(json)) as Record<string, unknown>;
const same = (value: unknown): string =>
    JSON.stringify(value, (_key, member: unknown) =>
        typeof member === 'object' && member !== null && !Array.isArray(member)
            ? Object.fromEntries(Object.entries(member as Record<string, unknown>).sort())
            : member);

console.log('members survive  ', same(back) === same(json));
console.log('energy exact     ', back['energy'] === (json as Record<string, string>)['energy']);

// The member order changed, because the encoder sorts map keys — deterministic
// encoding is what makes the bytes signable, and it is not the order the
// document was written in.
console.log('order is the encoder\'s', Object.keys(back).join(', '));


// --- What JSON cannot hold --------------------------------------------------

console.log();

// An integer past 2^53 is refused rather than rounded. A nanosecond timestamp
// passes that boundary, so this is not an exotic case, and the nearest double
// is a different number.
try {
    mcborToJson(hexToBytes('1B7FFFFFFFFFFFFFFF'));
    console.log('2^63-1            accepted — which it should not be');
}
catch (error) {
    console.log('2^63-1           ', (error as { code: string }).code);
}

console.log('as digits        ', mcborToJson(hexToBytes('1B7FFFFFFFFFFFFFFF'), { bigIntegers: 'string' }));


// --- Which strings are readings ---------------------------------------------

// By default every string that starts like a number is tried against the
// grammar. That is what makes the round trip work with no configuration, and
// it has a documented hazard: a prose field holding "1 h" becomes one hour.
console.log();
console.log('auto             ', bytesToHex(jsonToMcbor({ note: '1 h' })));
console.log('none             ', bytesToHex(jsonToMcbor({ note: '1 h' }, { readings: 'none' })));

// An application with a schema says which paths hold measurements.
const schema = jsonToMcbor(
    { note: '1 h', energy: '1.10 kWh' },
    { readings: (_text, path) => path.at(-1) === 'energy' },
);

console.log('by path          ', bytesToHex(schema));
console.log('                 ', diagnostic(decodeHex(bytesToHex(schema))));
