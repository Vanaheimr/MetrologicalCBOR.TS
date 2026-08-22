/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Finding the readings in somebody else's document, without disturbing it.
 *
 *     npx tsx examples/04-a-foreign-document.ts
 *
 * The worked example of the specification: a charging transaction, signed by
 * the meter, bundled by the charging station and countersigned by the
 * operator. 713 bytes, six levels deep, and not written by this library.
 */

import {
    bytesToHex, cbor, decode, encode, hexToBytes, metrologicalValueFromCbor,
    formatMetrologicalValue, METROLOGICAL_VALUE_TAG,
} from '../src/index.js';
import type { CborPath, CborValue } from '../src/index.js';


/** From `spec/tag-44252-signed-example.md`, Section 6. */
const SIGNED_RECORD =
    'D28443A10126A204484F4E4267CBA434400B8344A1013822A104486B1F337BA0EC88BB58' +
    '6061C12A64FC1DB9E8943FCB43F8D9786D2FF7F8FF4EB6BD11AA175068F6DCA81EDC7EF9' +
    '38E169461927DF33CC63E2DD90A9247CB85B5D5D95FAC1B24C5E775482E817D331E84878' +
    '416C8A43F7C7486692A3CA5F6D8FF8A182D6008BC72B092C595901FFA36872656164696E' +
    '67738258DDD28445A101390108A10448C6738177A6E6D04B5886A56474696D65C0743230' +
    '32362D30382D31355430383A31343A30305A656D657465726E3149534130303030303030' +
    '30343266656E65726779D9ACDC84C482221A0012D6870203A401C48220187B020203C482' +
    '21185F040167636F6E74657874715472616E73616374696F6E2E426567696E6B7472616E' +
    '73616374696F6E6861346631633965325840A8C6B9738D3A312248D78467C688147EA583' +
    '170D25E8F2D14475BA2404C8DE62369749AE5425975F50886C3C7C957A154DA788EF46C4' +
    '5276B1BEC4FCE2A00FA558DBD28445A101390108A10448C6738177A6E6D04B5884A56474' +
    '696D65C074323032362D30382D31355430393A30323A30305A656D657465726E31495341' +
    '3030303030303030343266656E65726779D9ACDC84C482221A0013395D0203A401C48220' +
    '187E020203C48221185F040167636F6E746578746F5472616E73616374696F6E2E456E64' +
    '6B7472616E73616374696F6E6861346631633965325840008A537E8890CEF6D909BC8324' +
    '94718173315CC01E48FD779D6897FCC081E83270FCBE16A5E6939D5F8B1D5B80C1C4EC56' +
    '9335D5B175B3B49EB0DEFD994C0A6C6B7472616E73616374696F6E686134663163396532' +
    '6F6368617267696E6753746174696F6E7244452A4745462A4531323334353637382A3158' +
    '40EE16FB2B5B12407D00DFDC582601AE543AFE062D797CE222A1411A00C92EEEB6D68E3E' +
    'B9F259C02531AB438D6CC65BC7CC888C4DC5DE27DE106AF82AD13E89A7';

const bytes = hexToBytes(SIGNED_RECORD);

console.log('the record       ', bytes.length, 'bytes');

// Not deterministically encoded throughout — the inner payloads are somebody
// else's bytes and their maps are in their own order. Strictness is per layer:
// the outer COSE structure is deterministic, and what it carries need not be.
const record = decode(bytes, { strict: false });

console.log('re-encoded exact ',
            bytesToHex(encode(record, { mapKeys: 'preserve', floats: 'preserve' })) === bytesToHex(bytes));


// --- Every reading, wherever it is ------------------------------------------

console.log();
console.log('readings found:');

/** A path as something a person can read: `readings/0 ▸ energy`. */
function show(path: CborPath): string {
    return path
        .map(segment =>
            segment.kind === 'index' ? String(segment.index)
          : segment.kind === 'tag'   ? `#${String(segment.tag)}`
          : segment.key.type === 'text' ? segment.key.value
          : cbor.diagnostic(segment.key))
        .join('/');
}

function readings(value: CborValue, where: string): void {

    cbor.walk(value, (item: CborValue, path: CborPath) => {

        // A reading.
        if (cbor.isTagged(item, METROLOGICAL_VALUE_TAG)) {
            const reading = metrologicalValueFromCbor(item, { strict: false });
            console.log(`  ${where}${show(path)}`.padEnd(40), formatMetrologicalValue(reading));
            return;
        }

        // A byte string that is itself a document: descend into it. The signed
        // payloads are byte strings, so the readings inside them are not
        // reachable by walking the outer document alone — which is what a
        // signature is, an opaque blob to everyone but the party checking it.
        if (item.type === 'bytes' && item.value.length > 8) {
            try {
                readings(decode(item.value, { strict: false }), `${where}${show(path)} ▸ `);
            }
            catch {
                // Most byte strings here are signatures and key identifiers,
                // which are not documents. Failing to decode one is the
                // ordinary case, not an error.
            }
        }

    });

}

readings(record, '');


// --- Rewriting one, without touching anything else --------------------------

// `transform` rebuilds only the branches that changed, so a document comes
// back with the same identity everywhere it was not edited.
const same = cbor.transform(record, item => item);

console.log();
console.log('untouched is identical', same === record);
