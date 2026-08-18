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
import { assertStable }          from '../support/stability.js';


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
 * These use {@link assertStable} rather than a bare `expect`.
 *
 * Not for style: the second of them failed twice on a loaded machine and its
 * reported counterexample passed on replay, after some two million further
 * executions found nothing. A property-based tool shrinks towards whatever
 * happened to fail, so an unstable execution is reported as a minimal
 * counterexample that is not one — which is the most misleading output a test
 * can produce. `assertStable` repeats the computation before it reports, and
 * says which of the two it is. See WORKPLAN.md, WP8.
 */
describe('the profile round-trips', () => {

    it('a document comes back byte-identical', () => {

        fc.assert(
            fc.property(anyDocument, document => {
                const bytes = encodeCbor(document);
                assertStable(() => bytesToHex(jsonToMcbor(mcborToJson(bytes))),
                             bytesToHex(bytes),
                             () => bytesToHex(bytes));
            }),
            { numRuns: 20_000 },
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
                        return bytesToHex(jsonToMcbor(again));
                    },
                    bytesToHex(bytes),
                    () => bytesToHex(bytes),
                );

            }),
            { numRuns: 20_000 },
        );

    });

    it('every reading in it keeps its decimal scale', () => {

        fc.assert(
            fc.property(anyReading, reading => {
                const bytes = encodeCbor(reading);
                assertStable(() => bytesToHex(jsonToMcbor(mcborToJson(bytes))),
                             bytesToHex(bytes),
                             () => bytesToHex(bytes));
            }),
            { numRuns: 20_000 },
        );

    });

});
