/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Verifying the signatures over the worked example.
 *
 *     cd examples && npm install && cd ..
 *     npx tsx examples/06-verify-a-signed-record.ts
 *
 * This library does no cryptography and never will — signing belongs to COSE,
 * and a data format that also carried a crypto stack would be unusable as the
 * leaf of somebody else's schema. What it does is produce the bytes a signature
 * is over, exactly, and that is the claim this example checks.
 *
 * The check is stronger than "the signature verifies". The specification signs
 * deterministically (RFC 6979), so the signature is a function of what it
 * signs: re-signing the structure this library builds must reproduce the
 * recorded signature byte for byte. It does.
 *
 * The example keys come from Section 7 of the specification. They were
 * generated for that document, they secure nothing, and they must never appear
 * anywhere else.
 */

import { createHash }          from 'node:crypto';

import {
    bytesToHex, decode, encode, hexToBytes, formatMetrologicalValue,
    metrologicalValueFromCbor, METROLOGICAL_VALUE_TAG, cbor,
} from '../src/index.js';
import type { CborValue }      from '../src/index.js';


// --- The one dependency, and it is not the library's ------------------------

let curves: {
    brainpoolP256r1: EcdsaCurve;
    p256:            EcdsaCurve;
    p384:            EcdsaCurve;
};

interface EcdsaCurve {
    verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array,
           options?: { prehash?: boolean; lowS?: boolean }): boolean;
    sign(message: Uint8Array, privateKey: Uint8Array,
         options?: { prehash?: boolean }): Uint8Array;
}

try {
    const [nist, misc] = await Promise.all([
        import('@noble/curves/nist.js')  as Promise<{ p256: EcdsaCurve; p384: EcdsaCurve }>,
        import('@noble/curves/misc.js')  as Promise<{ brainpoolP256r1: EcdsaCurve }>,
    ]);
    curves = { p256: nist.p256, p384: nist.p384, brainpoolP256r1: misc.brainpoolP256r1 };
}
catch {
    console.log('This example needs @noble/curves, which lives in examples/package.json');
    console.log('rather than in the library\'s own, so that a root `npm ci` never installs');
    console.log('a cryptography library to test a data format. To run it:\n');
    console.log('  cd examples && npm install && cd ..');
    console.log('  npx tsx examples/06-verify-a-signed-record.ts');
    process.exit(0);
}


// --- The record and the keys ------------------------------------------------

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

/** Section 7 of the specification. Example keys; they secure nothing. */
const KEYS = {
    meter: {
        curve: 'brainpoolP256r1', cose: 256, hash: 'sha256',
        x: 'A734FB1962C381113C746BDDBCBC774801E3B73FA7F73479615D290E91E48889',
        y: '8A188C8261A560197B37C73044E3009BA1DAED226C324A35FEE76AA144740678',
        d: '08F001BB03BEF4FBD1C59F10B50555CD37D2B53421331DBFA98815A581326FB3',
    },
    station: {
        curve: 'p256', cose: 1, hash: 'sha256',
        x: '7951E32509303CD4DB14127765B3FC9F32F62AC5C0F12350BD3ED7C746C72FE9',
        y: 'A35716031E2C44A942D886626C5D4C41E0FF62E44FED7EDA3ACC1408D90720DC',
        d: '875E51ECF18073E8B970E6DCC5A115433456E13DF966034A5A782945D2B684D3',
    },
    operator: {
        curve: 'p384', cose: 2, hash: 'sha384',
        x: '5DEF24F33251A911F43205134D568C1FB3547E2BD0B602D4B18A5FA476FF1FB8E6D321CC4ED1DCF754A81159C63389D2',
        y: 'D8298F873104BC9AE145888BB7DC574AB26501E1E78DC4613CCB4B4C1B842720724671655551F9E2918C8943EAE8C2FA',
        d: '6952487A0A16EACE6E9A69EFD062D7671D68D23FF68722326348827C3A94E2A1743A1DF8901B948412CCA26CA4372CED',
    },
} as const;

type Party = keyof typeof KEYS;


// --- COSE, in the twenty lines this example needs ---------------------------

const bstr   = (value: Uint8Array): CborValue => ({ type: 'bytes', value });
const text   = (value: string):     CborValue => ({ type: 'text',  value });
const NOTHING = new Uint8Array();

const digest = (algorithm: string, data: Uint8Array): Uint8Array =>
    new Uint8Array(createHash(algorithm).update(data).digest());

/**
 * What a COSE signature is actually over.
 *
 * RFC 9052 Section 4.4: not the message, but a canonical CBOR array naming the
 * context, the protected headers and the payload — so that a signature made in
 * one context cannot be replayed in another. This library encodes it, which is
 * the whole of its part in the transaction.
 */
const sigStructure = (items: CborValue[]): Uint8Array => encode({ type: 'array', items });

const publicKey  = (party: Party): Uint8Array => hexToBytes('04' + KEYS[party].x + KEYS[party].y);
const privateKey = (party: Party): Uint8Array => hexToBytes(KEYS[party].d);
const curveOf    = (party: Party): EcdsaCurve => curves[KEYS[party].curve];

/**
 * ECDSA has two valid signatures for every message, `(r, s)` and `(r, n − s)`.
 *
 * Several libraries reject the second by default — an anti-malleability policy
 * that Bitcoin made conventional and that COSE does not impose. The meter here
 * signs without normalising, so a verifier that insists on the low form rejects
 * a perfectly valid signature. That is a policy disagreement rather than a
 * failure, and it is worth knowing about before it costs an afternoon.
 */
const verify = (party: Party, signature: Uint8Array, signed: Uint8Array): boolean =>
    curveOf(party).verify(signature, digest(KEYS[party].hash, signed), publicKey(party),
                          { prehash: false, lowS: false });


// --- Layer by layer ---------------------------------------------------------

const bytes  = hexToBytes(SIGNED_RECORD);
const record = decode(bytes, { strict: false });

if (record.type !== 'tag' || record.value.type !== 'array')
    throw new Error('the record is not a COSE_Sign1');

const [stationProtected, stationUnprotected, stationPayload, stationSignature] = record.value.items;

if (stationProtected?.type   !== 'bytes' || stationUnprotected?.type !== 'map' ||
    stationPayload?.type     !== 'bytes' || stationSignature?.type   !== 'bytes')
    throw new Error('the record is not shaped like a COSE_Sign1');

console.log(`the record        ${String(bytes.length)} bytes, COSE_Sign1 (tag ${String(record.tag)})`);
console.log();


// 1. The charging station signed the bundle.
{
    const signed = sigStructure([
        text('Signature1'), bstr(stationProtected.value), bstr(NOTHING), bstr(stationPayload.value),
    ]);

    console.log('station   ES256  ', verify('station', stationSignature.value, signed) ? 'verifies' : 'FAILS');

    // And the stronger claim. RFC 6979 derives the nonce from the key and the
    // message, so the signature is a function of what it signs. If this library
    // built a Sig_structure that differed from the signer's by one byte, the
    // signature below would differ completely.
    const again = curveOf('station').sign(digest('sha256', signed), privateKey('station'), { prehash: false });

    console.log('          re-sign',
                bytesToHex(again) === bytesToHex(stationSignature.value)
                    ? 'reproduces the recorded signature byte for byte'
                    : 'DIFFERS from the recorded signature');
}


// 2. The meter signed every reading inside it.
{
    const payload = decode(stationPayload.value, { strict: false });

    if (payload.type !== 'map')
        throw new Error('the station payload is not a map');

    const readings = payload.entries.find(([key]) => key.type === 'text' && key.value === 'readings')?.[1];

    if (readings?.type !== 'array')
        throw new Error('the station payload has no readings');

    console.log();

    for (const [index, item] of readings.items.entries()) {

        if (item.type !== 'bytes')
            continue;

        const sign1 = decode(item.value, { strict: false });

        if (sign1.type !== 'tag' || sign1.value.type !== 'array')
            continue;

        const [meterProtected, , meterPayload, meterSignature] = sign1.value.items;

        if (meterProtected?.type !== 'bytes' || meterPayload?.type !== 'bytes' || meterSignature?.type !== 'bytes')
            continue;

        const signed = sigStructure([
            text('Signature1'), bstr(meterProtected.value), bstr(NOTHING), bstr(meterPayload.value),
        ]);

        // What the meter actually said, read by this library out of the bytes
        // its own signature covers.
        let reading = '';
        cbor.walk(decode(meterPayload.value, { strict: false }), value => {
            if (cbor.isTagged(value, METROLOGICAL_VALUE_TAG))
                reading = formatMetrologicalValue(metrologicalValueFromCbor(value, { strict: false }));
        });

        console.log(`meter[${String(index)}]  ESB256 `,
                    verify('meter', meterSignature.value, signed) ? 'verifies' : 'FAILS',
                    ' ', reading);

    }
}


// 3. The operator countersigned the station's signature.
{
    const counter = stationUnprotected.entries
        .find(([key]) => key.type === 'int' && key.value === 11n)?.[1];

    if (counter?.type !== 'array')
        throw new Error('the record carries no countersignature');

    const [counterProtected, , counterSignature] = counter.items;

    if (counterProtected?.type !== 'bytes' || counterSignature?.type !== 'bytes')
        throw new Error('the countersignature is not shaped like one');

    // RFC 9338 Section 3.3. The context differs from a plain signature, and so
    // does the structure: it names the body's protected headers *and* the
    // countersigner's, and it covers the body's signature. That is what makes
    // this "I vouch for that signature" rather than "I signed the same thing".
    const signed = sigStructure([
        text('CounterSignatureV2'),
        bstr(stationProtected.value),
        bstr(counterProtected.value),
        bstr(NOTHING),
        bstr(stationPayload.value),
        { type: 'array', items: [bstr(stationSignature.value)] },
    ]);

    console.log();
    console.log('operator  ES384  ', verify('operator', counterSignature.value, signed) ? 'verifies' : 'FAILS');
}


// --- The key identifiers ----------------------------------------------------

/**
 * RFC 9679: a COSE key thumbprint is the hash of the key's own canonical CBOR
 * encoding — which this library can produce, so a verifier can check that the
 * key it was handed is the key the record names.
 *
 * Because the thumbprint covers the curve, a signer who changes algorithm
 * necessarily gets a different identifier: an algorithm downgrade under an
 * unchanged identity is not expressible.
 */
function thumbprint(party: Party): string {

    const key = encode({
        type: 'map',
        entries: [
            [{ type: 'int', value:  1n }, { type: 'int',   value: 2n }],                       // kty = EC2
            [{ type: 'int', value: -1n }, { type: 'int',   value: BigInt(KEYS[party].cose) }], // crv
            [{ type: 'int', value: -2n }, { type: 'bytes', value: hexToBytes(KEYS[party].x) }],
            [{ type: 'int', value: -3n }, { type: 'bytes', value: hexToBytes(KEYS[party].y) }],
        ],
    });

    return bytesToHex(digest('sha256', key)).slice(0, 16);

}

console.log();

const kids: [Party, string][] = [
    ['meter',    'C6738177A6E6D04B'],
    ['station',  '4F4E4267CBA43440'],
    ['operator', '6B1F337BA0EC88BB'],
];

for (const [party, stated] of kids)
    console.log(`${party.padEnd(9)} kid    `,
                thumbprint(party) === stated ? `matches ${stated}` : `MISMATCH: ${thumbprint(party)} vs ${stated}`);
