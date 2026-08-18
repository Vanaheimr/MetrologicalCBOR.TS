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
    '6056AA831918D6215BFE6ABAA02791C8FB619E0C2661F55E8C1F95967A67A02863E1ACC9' +
    'EB090F4A2DD5BE6134380A29D65BA71661A2BA7D337C84C4E4C2C2D87F8925618D0CC7EF' +
    '3E1EBD6D4279B55514A156B4E5315237488B681C20118283175901FFA36F636861726769' +
    '6E6753746174696F6E7244452A4745462A4531323334353637382A316B7472616E736163' +
    '74696F6E6861346631633965326872656164696E67738258DDD28445A101390108A10448' +
    'C6738177A6E6D04B5886A5656D657465726E31495341303030303030303034326B747261' +
    '6E73616374696F6E68613466316339653267636F6E74657874715472616E73616374696F' +
    '6E2E426567696E6474696D65C074323032362D30382D31355430383A31343A30305A6665' +
    '6E65726779D9ACDC84C482221A0012D6870203A401C48220187B020203C48221185F0401' +
    '58406A40B66B6D228217D87F6751D1919BA82CCA959F079EFC98F805BAE4CBC340A3611A' +
    'BAC58B3AA2E1FB51EA85CACB978C03DCF78F407039DA41A2E653A60E138958DBD28445A1' +
    '01390108A10448C6738177A6E6D04B5884A5656D657465726E3149534130303030303030' +
    '3034326B7472616E73616374696F6E68613466316339653267636F6E746578746F547261' +
    '6E73616374696F6E2E456E646474696D65C074323032362D30382D31355430393A30323A' +
    '30305A66656E65726779D9ACDC84C482221A0013395D0203A401C48220187E020203C482' +
    '21185F040158401D92018570E22306441FDD0E1645124C03F63CDE0D75A154B7ECD78411' +
    '2020F25834508FD5D9A6A016025A85B8BD7F5DF27056B33EDFC7A823E55449061562CC58' +
    '40C521E083F44F35D056F5B6F75893B7B2AD8E32CFB2F60DFEAA405466083C16267C6E92' +
    '56110BDBD204D81878E195A9E4BE644FE034BC7A640A42F82CC931AA2E';

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
