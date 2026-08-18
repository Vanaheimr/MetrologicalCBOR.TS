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
 * The two readings of the worked example, as readings.
 *
 * `tests/cbor/worked-example.test.ts` shows that the 713 bytes survive the
 * CBOR layer. This suite goes one level further and asks what they *say*:
 * 1234.567 kWh with an expanded uncertainty of 12.3 kWh at k = 2, and the
 * billed 25.302 kWh that follows from the pair — all in exact integers, with
 * no float anywhere in the arithmetic.
 */

import { describe, expect, it } from 'vitest';

import { decode as decodeCbor } from '../../src/cbor/reader.js';
import { bytesToHex, hexToBytes } from '../../src/cbor/hex.js';
import { encode as encodeCbor } from '../../src/cbor/writer.js';
import { walk }                 from '../../src/cbor/walk.js';
import type { CborValue }       from '../../src/cbor/types.js';
import {
    decodeMetrologicalValue, encodeMetrologicalValue, metrologicalValueFromCbor,
} from '../../src/codec/index.js';
import { formatDecimal }        from '../../src/model/decimal.js';
import { SIPrefix }             from '../../src/model/prefix.js';
import { standardUncertainty }  from '../../src/model/uncertainty.js';
import type { MetrologicalValue } from '../../src/model/value.js';
import { METROLOGICAL_VALUE_TAG } from '../../src/tag.js';
import { Units }                from '../../src/registry/units.generated.js';
import { METER_READING_HEX, SIGNED_RECORD_HEX } from '../vectors/signed-example.js';

const asRead = { strict: false } as const;
const COSE_SIGN1_TAG = 18n;


/** Every reading in a decoded document, decoded through the codec. */
function readingsIn(document: CborValue): MetrologicalValue[] {

    const found: MetrologicalValue[] = [];

    walk(document, item => {
        if (item.type === 'tag' && item.tag === BigInt(METROLOGICAL_VALUE_TAG))
            found.push(metrologicalValueFromCbor(item));
    });

    return found;

}


/** The payload of a COSE_Sign1, decoded. */
function payloadOf(message: CborValue): CborValue {

    if (message.type !== 'tag' || message.tag !== COSE_SIGN1_TAG || message.value.type !== 'array')
        throw new Error('not a COSE_Sign1');

    const payload = message.value.items[2];

    if (payload?.type !== 'bytes')
        throw new Error('no payload');

    return decodeCbor(payload.value, asRead);

}


describe('the energy reading of the meter', () => {

    const [energy] = readingsIn(decodeCbor(hexToBytes(METER_READING_HEX), asRead));

    it('is found inside the payload', () => {
        expect(energy).toBeDefined();
    });

    it('is 1234.567 kilowatt hours, digit for digit', () => {

        expect(formatDecimal(energy!.value)).toBe('1234.567');
        expect(energy!.value.kind).toBe('decimal');
        expect(energy!.prefix).toBe(SIPrefix.Kilo);

        const unit = energy!.unit;
        expect(unit.kind).toBe('named');
        if (unit.kind === 'named')
            expect(unit.unit.id).toBe(Units.WattHour);

    });

    it('carries the complete GUM statement of the certificate', () => {

        const u = energy!.uncertainty;

        expect(u).toBeDefined();
        expect(formatDecimal(u!.magnitude)).toBe('12.3');
        expect(formatDecimal(u!.coverageFactor!)).toBe('2');
        expect(formatDecimal(u!.coverageProbability!)).toBe('0.95');
        expect(u!.distribution).toBe('normal');

    });

    it('yields a standard uncertainty of 6.15 kWh, once a scale is stated', () => {

        // u = U / k. The library will not pick the scale; the document says
        // 12.3 at k = 2, and two decimal places make that exact.
        expect(formatDecimal(standardUncertainty(energy!.uncertainty!, { scale: 2, rounding: 'half-even' })))
            .toBe('6.15');

    });

    it('re-encodes to the bytes it was read from', () => {

        // The reading is 31 of the 134 bytes, and it is covered by the meter's
        // signature, so reproducing it exactly is the whole point.
        const bytes = encodeMetrologicalValue(energy!, { units: 'preserve' });

        expect(bytesToHex(bytes))
            .toBe('D9ACDC84C482221A0012D6870203A401C48220187B020203C48221185F0401');

    });

    it('is in the deterministic encoding, which is what Section 6 claims', () => {

        // Its carrying map is not, but the reading itself is: the strict
        // decoder accepts the encoder's own output for it.
        const bytes = encodeMetrologicalValue(energy!);

        expect(() => decodeMetrologicalValue(bytes, { strict: true })).not.toThrow();
        expect(bytesToHex(bytes)).toBe(bytesToHex(encodeMetrologicalValue(energy!, { units: 'preserve' })));

    });

});


describe('the two readings of the transaction', () => {

    const record   = decodeCbor(hexToBytes(SIGNED_RECORD_HEX), asRead);
    const bundle   = payloadOf(record);

    const readings = (() => {

        if (bundle.type !== 'map')
            throw new Error('unreachable');

        const entry = bundle.entries.find(([key]) => key.type === 'text' && key.value === 'readings')?.[1];

        if (entry?.type !== 'array')
            throw new Error('unreachable');

        return entry.items.flatMap(item =>
            item.type === 'bytes' ? readingsIn(payloadOf(decodeCbor(item.value, asRead))) : []);

    })();

    it('are two, one at each end of the transaction', () => {
        expect(readings).toHaveLength(2);
    });

    it('are 1234.567 and 1259.869 kilowatt hours', () => {
        expect(readings.map(reading => reading.formatValue())).toStrictEqual(['1234.567', '1259.869']);
    });

    it('are the same unit and prefix, so their difference is exact', () => {

        const [begin, end] = readings;

        expect(begin!.prefix).toBe(end!.prefix);
        expect(begin!.totalExponent).toBe(end!.totalExponent);

        // 25.302 kWh, in integers, with nothing rounded along the way.
        expect(end!.mantissa - begin!.mantissa).toBe(25302n);

    });

    it('order the way the meter counted', () => {
        expect(readings[1]!.compareQuantity(readings[0]!)).toBe(1);
    });

    it('re-encode into a record that is byte-identical to the original', () => {

        // Nothing here was produced by this library, and three signatures
        // cover it. Decoding every layer and writing it back must not move a
        // single byte.
        expect(bytesToHex(encodeCbor(record, { mapKeys: 'preserve', floats: 'preserve' })))
            .toBe(SIGNED_RECORD_HEX);

    });

});
