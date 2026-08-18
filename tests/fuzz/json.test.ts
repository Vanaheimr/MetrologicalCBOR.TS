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
 * Both directions of the JSON conversion, against documents nobody designed.
 *
 * The JSON side is where input arrives already parsed by someone else, which
 * means it can hold anything a JavaScript value can hold — a `bigint` a caller
 * thought was a number, an `undefined` from a missing field, a nesting depth no
 * hand-written document reaches. None of that is JSON, and all of it will be
 * passed in eventually.
 *
 * Two things are asserted throughout: the two allowed outcomes, and — where a
 * document does convert — that what comes out is JSON in fact and not only in
 * type, which `JSON.stringify` is the arbiter of.
 */

import fc                        from 'fast-check';
import { describe, expect, it }  from 'vitest';

import { bytesToHex }            from '../../src/cbor/hex.js';
import { decode, diagnostic }    from '../../src/cbor/index.js';
import { decodeMetrologicalValue, encodeMetrologicalValue } from '../../src/codec/index.js';
import { parseMetrologicalValue } from '../../src/text/index.js';
import { jsonToCbor, jsonToMcbor, mcborToJson } from '../../src/json/index.js';
import type { JsonValue }        from '../../src/json/index.js';
import { FUZZ_RUNS, mutated, mutatedReading } from './corpus.js';
import { outcome }               from '../support/errors.js';


/** JSON as a caller would build it, readings and all. */
const anyJson: fc.Arbitrary<JsonValue> = fc.letrec<{ value: JsonValue }>(tie => ({
    value: fc.oneof(
        { maxDepth: 4, depthSize: 'small' },
        fc.constant(null),
        fc.boolean(),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.double({ noDefaultInfinity: true, noNaN: true }),
        fc.string(),
        // Strings that look like readings, so the detection is exercised on
        // more than prose: under 'auto' these are what becomes a measurement.
        fc.constantFrom('5 V', '230 V', '1.10 kWh', '(230.00 ±0.12) V, k=2',
                        '9.81 m·s⁻²', '5×10³ A', '20 °C', '1 h', '2026-08-15T08:14:00Z'),
        fc.array(tie('value'), { maxLength: 5 }),
        fc.dictionary(fc.string(), tie('value'), { maxKeys: 5 }),
    ),
})).value;


describe('JSON into CBOR', () => {

    it('either converts or refuses, and never a third thing', () => {

        fc.assert(
            fc.property(anyJson, json => {
                outcome(() => jsonToMcbor(json));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('produces bytes that decode, for everything it converts', () => {

        // The output is not merely bytes: it is a document, and it has to
        // survive the reader that will meet it at the other end — the strict
        // one, since what this library writes is what it says a conforming
        // encoder writes.
        fc.assert(
            fc.property(anyJson, json => {

                const result = outcome(() => jsonToMcbor(json));

                if (result.ok)
                    expect(typeof decode(result.value).type).toBe('string');

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('either converts or refuses under every detection setting', () => {

        fc.assert(
            fc.property(anyJson, json => {
                outcome(() => jsonToCbor(json, { readings: 'none' }));
                outcome(() => jsonToCbor(json, { readings: 'auto' }));
                outcome(() => jsonToCbor(json, { readings: text => text.length > 2 }));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('refuses what is not JSON at all, rather than inventing a meaning for it', () => {

        // A JavaScript caller has no type checker at run time, and these are
        // the values that arrive when a field was missing, when a number was
        // built as a bigint, or when a method came along with its object.
        // `JSON.stringify` drops them from an object and writes null for them
        // in an array; this refuses them, because a measurement that quietly
        // became null is the failure this library exists to prevent.
        for (const value of [undefined, 1n, Symbol('x'), (): void => undefined])
            expect(outcome(() => jsonToCbor(value as unknown as JsonValue)).ok).toBe(false);

    });

    it('converts an object that states its own JSON form the way it states it', () => {

        // A Date is the commonest non-primitive in a measurement record. Its
        // enumerable own fields are none at all, so converting it as an
        // ordinary object would write `{}` and lose the instant entirely.
        expect(diagnostic(jsonToCbor(new Date(0) as unknown as JsonValue)))
            .toBe('"1970-01-01T00:00:00.000Z"');

        expect(diagnostic(jsonToCbor({ at: new Date(Date.UTC(2026, 7, 15, 8, 14)) } as unknown as JsonValue)))
            .toBe('{"at": "2026-08-15T08:14:00.000Z"}');

        // Each member is asked in its own right, as the serialisation
        // algorithm asks, so a stated form nested inside one is honoured too.
        expect(diagnostic(jsonToCbor({ outer: { toJSON: (): string => 'inner' } } as unknown as JsonValue)))
            .toBe('{"outer": "inner"}');

        // Asked once per value, though, which is what keeps a toJSON returning
        // itself from recursing forever. The outcome is a refusal — the
        // substituted object has a function for a member — and the point of
        // the test is that there is an outcome at all.
        const loop: { toJSON?: () => unknown } = {};
        loop.toJSON = () => loop;
        expect(outcome(() => jsonToCbor(loop as unknown as JsonValue)).ok).toBe(false);

    });

    it('refuses a number JSON can write but CBOR cannot carry as one', () => {
        expect(outcome(() => jsonToCbor(Number.NaN as unknown as JsonValue)).ok).toBe(false);
        expect(outcome(() => jsonToCbor(Infinity as unknown as JsonValue)).ok).toBe(false);
    });

});


describe('CBOR into JSON', () => {

    it('either converts or refuses a damaged document', () => {

        fc.assert(
            fc.property(mutated(), bytes => {
                outcome(() => mcborToJson(bytes));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('produces JSON in fact, not only in type', () => {

        // `JsonValue` is a TypeScript claim; `JSON.stringify` is the run-time
        // one. A value that types as JSON and does not serialise would reach a
        // caller as a document that cannot be written to disk.
        fc.assert(
            fc.property(mutated(), bytes => {

                const result = outcome(() => mcborToJson(bytes, { bytes: 'base64url', mapKeys: 'stringify' }));

                if (result.ok)
                    expect(typeof JSON.stringify(result.value)).toBe('string');

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('either converts or refuses under every option', () => {

        fc.assert(
            fc.property(mutated(), bytes => {
                outcome(() => mcborToJson(bytes, { bytes: 'hex' }));
                outcome(() => mcborToJson(bytes, { bytes: 'error' }));
                outcome(() => mcborToJson(bytes, { bigIntegers: 'string' }));
                outcome(() => mcborToJson(bytes, { floats: 'error' }));
                outcome(() => mcborToJson(bytes, { mapKeys: 'stringify' }));
                outcome(() => mcborToJson(bytes, { onUnknownTag: (tag) => tag.toString() }));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('never turns a reading into something other than a reading', () => {

        // The one conversion that must not lose anything. Damage can destroy
        // the tag itself, and what is left is then an ordinary CBOR item that
        // correctly becomes an ordinary JSON value — so the claim is
        // conditional on the bytes still *being* a reading. Where they are, the
        // JSON is one string and that string reads back to the same reading.
        fc.assert(
            fc.property(mutatedReading(), bytes => {

                const reading = outcome(() => decodeMetrologicalValue(bytes, { strict: false }));

                if (!reading.ok)
                    return;

                const json = mcborToJson(bytes);

                expect(typeof json).toBe('string');
                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(json as string))))
                    .toBe(bytesToHex(encodeMetrologicalValue(reading.value)));

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

});


describe('the two directions together', () => {

    it('carries a document of readings and text back byte for byte', () => {

        // The narrow guarantee stated in the README, held against generated
        // documents rather than chosen ones: what JSON can hold exactly comes
        // back exactly.
        const roundTrippable: fc.Arbitrary<JsonValue> = fc.letrec<{ value: JsonValue }>(tie => ({
            value: fc.oneof(
                { maxDepth: 3, depthSize: 'small' },
                fc.constant(null),
                fc.boolean(),
                fc.integer({ min: -1_000_000, max: 1_000_000 }),
                fc.constantFrom('5 V', '230 V', '1.10 kWh', '(230.00 ±0.12) V, k=2', 'Transaction.Begin'),
                fc.array(tie('value'), { maxLength: 4 }),
                fc.dictionary(fc.string({ minLength: 1 }), tie('value'), { maxKeys: 4 }),
            ),
        })).value;

        fc.assert(
            fc.property(roundTrippable, json => {

                const bytes = jsonToMcbor(json);

                expect(bytesToHex(jsonToMcbor(mcborToJson(bytes)))).toBe(bytesToHex(bytes));

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

});
