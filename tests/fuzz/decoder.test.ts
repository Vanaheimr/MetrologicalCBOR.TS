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
 * The decoder against input that is trying to break it.
 *
 * A library that reads legally relevant measurement data reads it from a
 * network, from a file someone else wrote, from a meter that may be faulty and
 * from a party that may be hostile. The requirement is not that it decode
 * everything, it is that every possible input have exactly one of two outcomes
 * — a value, or a typed refusal — and that neither take unbounded time.
 *
 * A third outcome is a defect, and {@link outcome} re-throws it as itself.
 */

import fc                        from 'fast-check';
import { describe, expect, it }  from 'vitest';

import { bytesToHex }            from '../../src/cbor/hex.js';
import { decode, encode, diagnostic, walk } from '../../src/cbor/index.js';
import { decodeMetrologicalValue, encodeMetrologicalValue } from '../../src/codec/index.js';
import { formatMetrologicalValue, parseMetrologicalValue }  from '../../src/text/index.js';
import { mcborToJson }           from '../../src/json/index.js';
import { FUZZ_RUNS, acceptanceRate, mutated, mutatedReading } from './corpus.js';
import { outcome }               from '../support/errors.js';


describe('the fuzzer itself', () => {

    // Everything below is of the form "if it was accepted, then ...". Those
    // properties hold vacuously over a corpus that is never accepted, so a
    // corpus that stopped reaching the decoder would go on passing while
    // covering nothing. These two numbers are what makes the rest mean
    // something, and they are floors far below what is measured (18 % and
    // 4.4 %) rather than targets, so that ordinary variation does not trip
    // them and a corpus gone wrong still does.

    it('gets past the CBOR reader often enough to be testing it', () => {
        expect(acceptanceRate(mutated(), bytes => decode(bytes))).toBeGreaterThan(0.08);
    });

    it('gets past the codec often enough to be testing it', () => {
        expect(acceptanceRate(mutatedReading(), bytes => decodeMetrologicalValue(bytes))).toBeGreaterThan(0.02);
    });

});


describe('the CBOR reader, against damaged documents', () => {

    it('either decodes or refuses, and never a third thing', () => {

        fc.assert(
            fc.property(mutated(), bytes => {
                outcome(() => decode(bytes));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('accepts, in strict mode, only bytes it would itself have written', () => {

        // The strongest statement the reader makes, and the one a signature
        // rests on: in strict mode the accepted set and the encodable set are
        // the same set, so decode-then-encode is the identity on it. Anything
        // accepted that re-encodes differently would be a second spelling of a
        // document, and a second spelling is a second signature.
        fc.assert(
            fc.property(mutated(), bytes => {

                const result = outcome(() => decode(bytes));

                if (result.ok)
                    expect(bytesToHex(encode(result.value))).toBe(bytesToHex(bytes));

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('either decodes or refuses in lenient mode too', () => {

        fc.assert(
            fc.property(mutated(), bytes => {
                outcome(() => decode(bytes, { strict: false }));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('walks and describes whatever it decoded', () => {

        // Two consumers that run over an already-decoded document. Neither
        // validates anything, so neither has any business failing.
        fc.assert(
            fc.property(mutated(), bytes => {

                const result = outcome(() => decode(bytes, { strict: false }));

                if (!result.ok)
                    return;

                expect(typeof diagnostic(result.value)).toBe('string');

                let visited = 0;
                walk(result.value, () => { visited += 1; });
                expect(visited).toBeGreaterThan(0);

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

});


describe('the tag 44252 codec, against damaged readings', () => {

    it('either decodes or refuses, and never a third thing', () => {

        fc.assert(
            fc.property(mutatedReading(), bytes => {
                outcome(() => decodeMetrologicalValue(bytes));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('reproduces the bytes of every reading it accepts', () => {

        // In preserve mode, because a symbolic unit is legal and is not the
        // spelling the encoder would choose. The claim is that nothing is lost,
        // not that nothing is normalised.
        fc.assert(
            fc.property(mutatedReading(), bytes => {

                const result = outcome(() => decodeMetrologicalValue(bytes));

                if (result.ok)
                    expect(bytesToHex(encodeMetrologicalValue(result.value, { units: 'preserve' })))
                        .toBe(bytesToHex(bytes));

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('carries every reading it accepts through text unchanged', () => {

        // The cross-representation property: bytes to model to text to model to
        // bytes. Compared canonically, because text names a unit by its symbol
        // and the wire may have named it by its identification - the two are
        // the same unit, and normalising both sides is what says so.
        fc.assert(
            fc.property(mutatedReading(), bytes => {

                const result = outcome(() => decodeMetrologicalValue(bytes));

                if (!result.ok)
                    return;

                const written  = formatMetrologicalValue(result.value);
                const reread   = parseMetrologicalValue(written);

                expect(bytesToHex(encodeMetrologicalValue(reread)))
                    .toBe(bytesToHex(encodeMetrologicalValue(result.value)));

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('carries every reading it accepts through JSON unchanged', () => {

        fc.assert(
            fc.property(mutatedReading(), bytes => {

                const result = outcome(() => decodeMetrologicalValue(bytes));

                if (!result.ok)
                    return;

                const json = mcborToJson(bytes);

                expect(typeof json).toBe('string');
                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(json as string))))
                    .toBe(bytesToHex(encodeMetrologicalValue(result.value)));

            }),
            { numRuns: FUZZ_RUNS },
        );

    });

});


describe('the decoder, against bytes with no seed behind them', () => {

    it('either decodes or refuses, whatever the length', () => {

        // Random bytes rarely reach far into the format, which is exactly why
        // they are worth running: they cover the first byte of every major
        // type, including the ones no valid seed contains.
        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 256 }), bytes => {
                outcome(() => decode(bytes));
                outcome(() => decode(bytes, { strict: false }));
                outcome(() => decodeMetrologicalValue(bytes));
                outcome(() => decodeMetrologicalValue(bytes, { strict: false }));
            }),
            { numRuns: FUZZ_RUNS },
        );

    });

    it('refuses every one-byte and two-byte input, or reproduces it', () => {

        // Small enough to enumerate rather than sample, so this is a proof for
        // the shortest inputs rather than evidence about them: every initial
        // byte, and every initial byte with every possible successor.
        for (let first = 0; first <= 0xFF; first += 1) {

            const single = outcome(() => decode(Uint8Array.from([first])));

            if (single.ok)
                expect(bytesToHex(encode(single.value))).toBe(bytesToHex(Uint8Array.from([first])));

            for (let second = 0; second <= 0xFF; second += 1) {

                const bytes = Uint8Array.from([first, second]);
                const pair  = outcome(() => decode(bytes));

                if (pair.ok)
                    expect(bytesToHex(encode(pair.value))).toBe(bytesToHex(bytes));

            }

        }

    });

});
