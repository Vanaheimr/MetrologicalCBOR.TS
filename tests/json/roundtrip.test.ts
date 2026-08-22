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
 * The round-trip guarantee of the JSON profile, over generated documents.
 *
 * The promise is narrow and exact: a document made of readings, text,
 * integers within the safe range, booleans, nulls, arrays and text-keyed maps
 * comes back byte-identical. Everything outside that is a stated one-way
 * conversion, and is tested as such in conversion.test.ts rather than here.
 */

import fc                        from 'fast-check';
import { describe, it }          from 'vitest';

import { bytesToHex }            from '../../src/cbor/hex.js';
import { encode as encodeCbor }  from '../../src/cbor/writer.js';
import type { CborEntry, CborValue } from '../../src/cbor/types.js';
import { metrologicalValueToCbor } from '../../src/codec/encode.js';
import { decimal, integer }      from '../../src/model/decimal.js';
import { SI_PREFIX_EXPONENTS }   from '../../src/model/prefix.js';
import { factor, unitById, unitExponent, unitProduct } from '../../src/model/unit.js';
import { uncertainty }           from '../../src/model/uncertainty.js';
import { metrologicalValue }     from '../../src/model/value.js';
import { STANDARD_UNITS }        from '../../src/registry/units.generated.js';
import { jsonToMcbor, mcborToJson } from '../../src/json/index.js';
import { assertStable, reproducibly } from '../support/stability.js';


/** A reading, as the CBOR item a document would carry. */
const anyReading: fc.Arbitrary<CborValue> = fc.record({
    value: fc.oneof(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }).map(v => integer(v)),
        fc.tuple(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), fc.integer({ min: -12, max: -1 }))
          .map(([m, e]) => decimal(m, e)),
    ),
    unit: fc.oneof(
        fc.constantFrom(...STANDARD_UNITS.map(u => u.id)).map(id => unitById(id)),
        fc.constantFrom(...STANDARD_UNITS.map(u => u.id)).map(id => unitProduct([
            factor(unitById(id), unitExponent(1)),
            factor(unitById(8),  unitExponent(-2)),
        ])),
    ),
    prefix: fc.constantFrom(...SI_PREFIX_EXPONENTS),
    uncertainty: fc.option(
        fc.record({
            magnitude:      fc.bigInt({ min: 0n, max: 10n ** 9n }).map(v => integer(v)),
            coverageFactor: fc.option(fc.integer({ min: 1, max: 6 }).map(k => integer(k)), { nil: undefined }),
        }).map(options => uncertainty(options)),
        { nil: undefined },
    ),
}).map(options => metrologicalValueToCbor(metrologicalValue(options)));


/**
 * Text that is not a reading.
 *
 * A string that happens to parse as one is *supposed* to come back as a
 * reading, so generating one would be testing the hazard rather than the
 * guarantee. conversion.test.ts pins the hazard on purpose.
 */
const anyText: fc.Arbitrary<CborValue> = fc.string()
    .filter(value => !/^\s*[+-]?\d|^\s*\(/.test(value))
    .map((value): CborValue => ({ type: 'text', value }));

const anyLeaf: fc.Arbitrary<CborValue> = fc.oneof(
    anyReading,
    anyText,
    fc.bigInt({ min: BigInt(Number.MIN_SAFE_INTEGER), max: BigInt(Number.MAX_SAFE_INTEGER) })
      .map((value): CborValue => ({ type: 'int', value })),
    fc.boolean().map((value): CborValue => ({ type: 'bool', value })),
    fc.constant<CborValue>({ type: 'null' }),
);

const anyDocument: fc.Arbitrary<CborValue> = fc.letrec<{ value: CborValue }>(tie => ({
    value: fc.oneof(
        { maxDepth: 3, depthSize: 'small' },
        anyLeaf,
        fc.array(tie('value'), { maxLength: 5 }).map((items): CborValue => ({ type: 'array', items })),
        fc.uniqueArray(fc.tuple(fc.string({ minLength: 1, maxLength: 8 }), tie('value')),
                       { maxLength: 5, selector: ([key]) => key })
          .map((pairs): CborValue => ({
              type:    'map',
              entries: pairs.map(([key, value]): CborEntry => [{ type: 'text', value: key }, value]),
          })),
    ),
})).value;


/**
 * What the platform did with this document — printed on a failure, and only
 * then.
 *
 * The second property sends the tree through `JSON.stringify` and `JSON.parse`
 * on purpose, because a caller holding a JSON tree will do exactly that. That
 * gives a failure here two possible authors, and one of them is not this
 * library: WP8 was `JSON.parse` handing back a key it had cached from the
 * object before (nodejs/node#63785), and every hour spent on the document was
 * an hour spent on a passenger. So the message asks the platform outright
 * rather than leaving the reader to suspect the nearest code.
 *
 * A clean answer does **not** clear the platform. The fault comes and goes with
 * the state of the process and this runs after the fact, so it can miss. A
 * dirty answer is conclusive.
 */
const platformCheck = (bytes: Uint8Array): string => {

    const written = JSON.stringify(mcborToJson(bytes));
    const read    = JSON.stringify(JSON.parse(written) as unknown);

    return written === read
               ? 'JSON.parse gave back what JSON.stringify wrote — on this attempt, which does ' +
                 'not clear it; see scripts/v8-json-key-repro.mjs'
               : 'THE PLATFORM LOST IT — JSON.parse did not give back what JSON.stringify ' +
                 'wrote, so this is not a defect of this library.\n' +
                 `    written: ${written}\n` +
                 `    read:    ${read}`;

};


/**
 * These use {@link assertStable} rather than a bare `expect`.
 *
 * Not for style: the second of them failed twice on a loaded machine and its
 * reported counterexample passed on replay, after some two million further
 * executions found nothing. A property-based tool shrinks towards whatever
 * happened to fail, so a failure the input did not cause is reported as a
 * minimal counterexample that is not one — the most misleading output a test
 * can produce.
 *
 * `assertStable` repeats the computation before it reports. Asking that one
 * question is what closed WP8: the answer was *yes, twice, identically*, and
 * a failure that repeats inside one process and vanishes in the next is about
 * the process. It was `JSON.parse`. See WORKPLAN.md, WP8, and
 * `scripts/v8-json-key-repro.mjs`, which shows it in plain JavaScript with
 * nothing of this library in it.
 */

/**
 * The conversion `metrological-text.md` Section 3 describes: a string that
 * reads as a reading becomes one. It is not the default - the default guesses
 * nothing - so a round trip has to ask for it, which is the whole point of
 * the round trip.
 */
const AS_SPECIFIED = { readings: 'auto' } as const;

describe('the profile round-trips', () => {

    it('a document comes back byte-identical', () => {

        fc.assert(
            fc.property(anyDocument, document => {
                const bytes = encodeCbor(document);
                assertStable(() => bytesToHex(jsonToMcbor(mcborToJson(bytes), AS_SPECIFIED)),
                             bytesToHex(bytes),
                             () => bytesToHex(bytes));
            }),
            reproducibly(20_000),
        );

    });

    it('the JSON survives being written and read as text', () => {

        fc.assert(
            fc.property(anyDocument, document => {

                const bytes = encodeCbor(document);

                assertStable(
                    () => {
                        const json  = mcborToJson(bytes);
                        const again = JSON.parse(JSON.stringify(json)) as typeof json;
                        return bytesToHex(jsonToMcbor(again, AS_SPECIFIED));
                    },
                    bytesToHex(bytes),
                    () => `${bytesToHex(bytes)}\n  platform: ${platformCheck(bytes)}`,
                );

            }),
            reproducibly(20_000),
        );

    });

    it('every reading in it keeps its decimal scale', () => {

        fc.assert(
            fc.property(anyReading, reading => {
                const bytes = encodeCbor(reading);
                assertStable(() => bytesToHex(jsonToMcbor(mcborToJson(bytes), AS_SPECIFIED)),
                             bytesToHex(bytes),
                             () => bytesToHex(bytes));
            }),
            reproducibly(20_000),
        );

    });

});
