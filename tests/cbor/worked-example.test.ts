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
 * The worked example of the specification, end to end.
 *
 * A real charging transaction: two meter readings, each signed by the meter,
 * bundled and signed by the charging station, and countersigned by the
 * operator — 713 bytes carrying three signatures and two complete metrological
 * statements.
 *
 * The point of this suite is that the core survives contact with a document it
 * did not produce. It decodes three levels of nesting, walks into byte strings
 * that turn out to be further CBOR, and re-encodes every layer to the identical
 * bytes. That last part is the one that matters: the bytes are what was signed,
 * so a core that changed any of them would invalidate the signatures it never
 * touched.
 */

import { describe, expect, it } from 'vitest';

import { METROLOGICAL_VALUE_TAG }        from '../../src/tag.js';
import { UnitRegistry }                  from '../../src/registry/index.js';
import { Units }                         from '../../src/registry/units.generated.js';
import { bytesToHex, hexToBytes }        from '../../src/cbor/hex.js';
import { decode, encode }                from '../../src/cbor/index.js';
import type { EncodeOptions }            from '../../src/cbor/index.js';
import { diagnostic }                    from '../../src/cbor/diagnostic.js';
import { walk }                          from '../../src/cbor/walk.js';
import type { CborValue }                from '../../src/cbor/types.js';
import {
    METER_READING_HEX,
    SIGNED_READING_HEX,
    SIGNED_RECORD_HEX,
} from '../vectors/signed-example.js';

const COSE_SIGN1_TAG = 18n;

/**
 * The document is read leniently and written back as it was read.
 *
 * Its outer maps are in a human order — `meter`, `transaction`, `context`,
 * `time`, `energy` — rather than the bytewise order a deterministic encoding
 * sorts them into. That is not a defect in the example: specification
 * Section 6 requires the deterministic encoding of the metrological value, and
 * says nothing about the document carrying it. Reordering those maps here
 * would invalidate three signatures over data this library did not produce.
 *
 * The metrological values inside are held to the stricter standard separately,
 * below, which is what Section 6 actually claims.
 */
const AS_SIGNED: EncodeOptions = { mapKeys: 'preserve', floats: 'preserve' };

const asRead = { strict: false } as const;

/** The payload of a COSE_Sign1: the third element of its four-element array. */
function payloadOf(message: CborValue): CborValue {

    expect(message.type).toBe('tag');
    if (message.type !== 'tag')
        throw new Error('unreachable');

    expect(message.tag).toBe(COSE_SIGN1_TAG);
    expect(message.value.type).toBe('array');
    if (message.value.type !== 'array')
        throw new Error('unreachable');

    const payload = message.value.items[2];
    expect(payload?.type).toBe('bytes');
    if (payload?.type !== 'bytes')
        throw new Error('unreachable');

    return decode(payload.value, asRead);

}

/** Every tag 44252 anywhere in a decoded document. */
function metrologicalValues(document: CborValue): CborValue[] {

    const found: CborValue[] = [];

    walk(document, value => {
        if (value.type === 'tag' && value.tag === BigInt(METROLOGICAL_VALUE_TAG))
            found.push(value);
    });

    return found;

}


describe('one meter reading, unsigned', () => {

    const reading = decode(hexToBytes(METER_READING_HEX), asRead);

    it('is 134 bytes, as the specification states', () => {
        expect(hexToBytes(METER_READING_HEX)).toHaveLength(134);
    });

    it('re-encodes to the identical bytes', () => {
        expect(bytesToHex(encode(reading, AS_SIGNED))).toBe(METER_READING_HEX);
    });

    it('reads as the diagnostic notation the specification prints', () => {
        expect(diagnostic(reading)).toBe(
            '{"meter": "1ISA0000000042", "transaction": "a4f1c9e2", ' +
            '"context": "Transaction.Begin", "time": 0("2026-08-15T08:14:00Z"), ' +
            '"energy": 44252([4([-3, 1234567]), 2, 3, {1: 4([-1, 123]), 2: 2, 3: 4([-2, 95]), 4: 1}])}',
        );
    });

    it('carries the energy reading with its scale intact', () => {

        const [energy] = metrologicalValues(reading);

        expect(energy).toBeDefined();
        if (energy?.type !== 'tag' || energy.value.type !== 'array')
            throw new Error('unreachable');

        const [value, unit, prefix, uncertainty] = energy.value.items;

        // 1234.567 as a decimal fraction: the instrument showed three decimal
        // places and the wire says so. A float would have lost that.
        expect(diagnostic(value!)).toBe('4([-3, 1234567])');
        expect(unit).toStrictEqual({ type: 'int', value: BigInt(Units.WattHour) });
        expect(prefix).toStrictEqual({ type: 'int', value: 3n });

        // Magnitude 12.3, coverage factor 2, coverage probability 0.95,
        // distribution normal.
        expect(diagnostic(uncertainty!)).toBe('{1: 4([-1, 123]), 2: 2, 3: 4([-2, 95]), 4: 1}');

    });

    it('names a unit the registry knows', () => {

        const [energy] = metrologicalValues(reading);
        if (energy?.type !== 'tag' || energy.value.type !== 'array')
            throw new Error('unreachable');

        const unit = energy.value.items[1];
        if (unit?.type !== 'int')
            throw new Error('unreachable');

        expect(UnitRegistry.standard.byId(Number(unit.value)).symbol).toBe('Wh');

    });

});


describe('one meter reading, signed', () => {

    const message = decode(hexToBytes(SIGNED_READING_HEX), asRead);

    it('is 221 bytes, as the specification states', () => {
        expect(hexToBytes(SIGNED_READING_HEX)).toHaveLength(221);
    });

    it('is a COSE_Sign1', () => {
        expect(message.type).toBe('tag');
        if (message.type === 'tag')
            expect(message.tag).toBe(COSE_SIGN1_TAG);
    });

    it('re-encodes to the identical bytes, signature included', () => {
        expect(bytesToHex(encode(message, AS_SIGNED))).toBe(SIGNED_READING_HEX);
    });

    it('carries the unsigned reading as its payload', () => {
        expect(bytesToHex(encode(payloadOf(message), AS_SIGNED))).toBe(METER_READING_HEX);
    });

});


describe('the complete record', () => {

    const record = decode(hexToBytes(SIGNED_RECORD_HEX), asRead);

    it('is 713 bytes, as the specification states', () => {
        expect(hexToBytes(SIGNED_RECORD_HEX)).toHaveLength(713);
    });

    it('re-encodes to the identical bytes, all three signatures included', () => {

        // Nothing in this document was produced by this library, and every
        // byte of it is covered by a signature. Reproducing it exactly is the
        // whole claim of a deterministic encoder.
        expect(bytesToHex(encode(record, AS_SIGNED))).toBe(SIGNED_RECORD_HEX);

    });

    it('is deterministic at its outermost layer, where a signature covers it', () => {

        // The COSE structure itself is deterministic: its unprotected bucket
        // holds the keys 4 and 11 in order, and the payload and signatures are
        // opaque byte strings. Strictness is a property of one layer at a
        // time, because a byte string is not looked into until something
        // decodes it.
        expect(() => decode(hexToBytes(SIGNED_RECORD_HEX), { strict: true })).not.toThrow();

    });

    it('carries a payload that is not, and strict mode says so on that layer', () => {

        // Inside, the meter reading is a map in a human order — meter,
        // transaction, context, time, energy — rather than the bytewise order
        // a deterministic encoding sorts them into. That is not a defect:
        // Section 6 makes its claim about the metrological value, not about
        // whatever structure carries it.
        expect(() => decode(hexToBytes(METER_READING_HEX), { strict: true }))
            .toThrow(/lexicographic order/);

    });

    it('carries metrological values that are in the deterministic encoding', () => {

        // This is the claim of Section 6, and it is the one that matters: each
        // reading re-encodes to identical bytes under the strict rules, so the
        // same measurement always produces the same signature.
        const bundle = payloadOf(record);
        if (bundle.type !== 'map')
            throw new Error('unreachable');

        const readings = bundle.entries.find(([key]) => key.type === 'text' && key.value === 'readings')?.[1];
        if (readings?.type !== 'array')
            throw new Error('unreachable');

        const values = readings.items.flatMap(reading =>
            reading.type === 'bytes' ? metrologicalValues(payloadOf(decode(reading.value, asRead))) : []);

        expect(values).toHaveLength(2);

        for (const value of values) {

            // Encoded under the deterministic rules, then decoded under them:
            // the strict decoder accepts its own output, which it would not do
            // if the value carried an unsorted map or a non-preferred number.
            const strictBytes = encode(value);

            expect(() => decode(strictBytes, { strict: true })).not.toThrow();

            // And it is the same as writing it back exactly as it arrived,
            // which is what makes the two claims compatible.
            expect(bytesToHex(strictBytes)).toBe(bytesToHex(encode(value, AS_SIGNED)));

        }

    });

    it('bundles two readings for one transaction', () => {

        const bundle = payloadOf(record);

        expect(bundle.type).toBe('map');
        if (bundle.type !== 'map')
            throw new Error('unreachable');

        const keys = bundle.entries.map(([key]) => key.type === 'text' ? key.value : '');
        expect(keys).toContain('chargingStation');
        expect(keys).toContain('transaction');
        expect(keys).toContain('readings');

    });

    it('keeps the meter signature on every reading inside it', () => {

        const bundle = payloadOf(record);
        if (bundle.type !== 'map')
            throw new Error('unreachable');

        const readings = bundle.entries.find(([key]) => key.type === 'text' && key.value === 'readings')?.[1];
        expect(readings?.type).toBe('array');
        if (readings?.type !== 'array')
            throw new Error('unreachable');

        expect(readings.items).toHaveLength(2);

        for (const reading of readings.items) {
            expect(reading.type).toBe('bytes');
            if (reading.type !== 'bytes')
                throw new Error('unreachable');

            // Each element is a complete COSE_Sign1 of its own.
            const signed = decode(reading.value, asRead);
            expect(signed.type).toBe('tag');
            if (signed.type === 'tag')
                expect(signed.tag).toBe(COSE_SIGN1_TAG);

            expect(bytesToHex(encode(signed, AS_SIGNED))).toBe(bytesToHex(reading.value));
        }

    });

    it('yields the billed quantity as the difference of two independent readings', () => {

        const bundle = payloadOf(record);
        if (bundle.type !== 'map')
            throw new Error('unreachable');

        const readings = bundle.entries.find(([key]) => key.type === 'text' && key.value === 'readings')?.[1];
        if (readings?.type !== 'array')
            throw new Error('unreachable');

        const mantissas: bigint[] = [];

        for (const reading of readings.items) {
            if (reading.type !== 'bytes')
                throw new Error('unreachable');

            const [energy] = metrologicalValues(payloadOf(decode(reading.value, asRead)));
            if (energy?.type !== 'tag' || energy.value.type !== 'array')
                throw new Error('unreachable');

            const value = energy.value.items[0];
            if (value?.type !== 'tag' || value.value.type !== 'array')
                throw new Error('unreachable');

            const exponent = value.value.items[0];
            const mantissa = value.value.items[1];
            if (exponent?.type !== 'int' || mantissa?.type !== 'int')
                throw new Error('unreachable');

            // Both readings share an exponent, so the difference is exact in
            // integers. Comparing mantissa and total exponent is what the
            // specification recommends over converting to a common prefix.
            expect(exponent.value).toBe(-3n);
            mantissas.push(mantissa.value);
        }

        expect(mantissas).toStrictEqual([1234567n, 1259869n]);

        // 25.302 kWh, exactly, with no float anywhere in the calculation.
        const difference = (mantissas[1] ?? 0n) - (mantissas[0] ?? 0n);
        expect(difference).toBe(25302n);

    });

    it('contains exactly two metrological values across all its layers', () => {

        const found: CborValue[] = [...metrologicalValues(record)];

        // The outer walk finds none: the readings are byte strings until
        // something decodes them, which is the point of the nesting.
        expect(found).toHaveLength(0);

        const bundle = payloadOf(record);
        if (bundle.type !== 'map')
            throw new Error('unreachable');

        const readings = bundle.entries.find(([key]) => key.type === 'text' && key.value === 'readings')?.[1];
        if (readings?.type !== 'array')
            throw new Error('unreachable');

        const nested = readings.items.flatMap(reading =>
            reading.type === 'bytes' ? metrologicalValues(payloadOf(decode(reading.value, asRead))) : []);

        expect(nested).toHaveLength(2);

    });

});
