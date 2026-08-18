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
 * The seeds the fuzz suites start from, and the ways they are damaged.
 *
 * Random bytes are a weak fuzzer for a self-describing format: almost every
 * draw is rejected by the first byte, and the interesting code — the part that
 * has already decided it is looking at a decimal fraction, or at an uncertainty
 * map — is never reached. Starting from encodings that *are* valid and damaging
 * them one edit at a time puts the input a single bit away from correct, which
 * is where a parser's mistakes live.
 *
 * Both are run: mutation reaches the deep paths, random bytes cover the shallow
 * ones the seeds never spell.
 */

import fc from 'fast-check';

import { hexToBytes } from '../../src/cbor/hex.js';
import { METER_READING_HEX, SIGNED_READING_HEX, SIGNED_RECORD_HEX } from '../vectors/signed-example.js';


/**
 * How many cases each property runs.
 *
 * The default is what a pull request can afford; the nightly job raises it, so
 * the corpus that runs while nobody is waiting is a much larger one. Set
 * `MCBOR_FUZZ_RUNS` to any positive integer.
 */
export const FUZZ_RUNS: number = (() => {
    const stated = Number.parseInt(process.env['MCBOR_FUZZ_RUNS'] ?? '', 10);
    return Number.isSafeInteger(stated) && stated > 0 ? stated : 2_000;
})();


/**
 * Valid encodings of tag 44252, one per shape the codec has a branch for.
 *
 * The ten readings of specification Section 5, which is every construction the
 * format offers: bare and scaled values, both unit forms, products with integer
 * and rational powers, and all four uncertainty spellings.
 */
export const READING_SEEDS: readonly string[] = [
    'D9ACDC820504',                            // 5 V
    'D9ACDC8218E605',                          // 230 V
    'D9ACDC83C4822018320422',                  // 5.0 mA
    'D9ACDC83C48221186E0203',                  // 1.10 kWh
    'D9ACDC84C482211901F40422C4822102',        // (5.00 ±0.2) mA
    'D9ACDC84050400C4822005',                  // (5 ±0.5) V, prefix written out
    'D9ACDC83C4822018326141 22'.replace(/\s/g, ''),   // 5.0 mA, unit as a symbol
    'D9ACDC82C482211903D582820F01820821',      // 9.81 m·s⁻²
    'D9ACDC84C482211959D80500A201C482210C0202', // (230.00 ±0.12) V, k=2
    'D9ACDC83C48220182D82820501820982200228',  // V·Hz^-1/2, a rational power
];


/**
 * Whole documents, which is what the JSON conversion and the walker face.
 *
 * The worked example of the specification: a signed meter reading, the payload
 * inside it, and the complete countersigned record.
 */
export const DOCUMENT_SEEDS: readonly string[] = [
    METER_READING_HEX,
    SIGNED_READING_HEX,
    SIGNED_RECORD_HEX,
];


export const ALL_SEEDS: readonly Uint8Array[] =
    [...READING_SEEDS, ...DOCUMENT_SEEDS].map(hex => hexToBytes(hex));


// ---------------------------------------------------------------------------
// The edits
// ---------------------------------------------------------------------------

/**
 * One damaged copy of a seed.
 *
 * Each operator is a distinct way real data goes wrong: a bit flipped in
 * transit, a byte rewritten by a broken encoder, a stream cut short, a length
 * that no longer matches its content, two records spliced together.
 */
export type Mutation =
    | { readonly kind: 'flip-bit';    readonly at: number; readonly bit: number }
    | { readonly kind: 'set-byte';    readonly at: number; readonly to: number }
    | { readonly kind: 'truncate';    readonly at: number }
    | { readonly kind: 'delete-byte'; readonly at: number }
    | { readonly kind: 'insert-byte'; readonly at: number; readonly to: number }
    | { readonly kind: 'append';      readonly bytes: Uint8Array }
    | { readonly kind: 'prepend';     readonly bytes: Uint8Array };


export function mutate(seed: Uint8Array, mutation: Mutation): Uint8Array {

    const at = seed.length === 0 ? 0 : (('at' in mutation ? mutation.at : 0) % seed.length);

    switch (mutation.kind) {

        case 'flip-bit': {
            const out = Uint8Array.from(seed);
            out[at] = (out[at] ?? 0) ^ (1 << (mutation.bit % 8));
            return out;
        }

        case 'set-byte': {
            const out = Uint8Array.from(seed);
            out[at] = mutation.to;
            return out;
        }

        case 'truncate':
            return seed.slice(0, at);

        case 'delete-byte':
            return Uint8Array.from([...seed.slice(0, at), ...seed.slice(at + 1)]);

        case 'insert-byte':
            return Uint8Array.from([...seed.slice(0, at), mutation.to, ...seed.slice(at)]);

        case 'append':
            return Uint8Array.from([...seed, ...mutation.bytes]);

        case 'prepend':
            return Uint8Array.from([...mutation.bytes, ...seed]);

    }

}


/**
 * The edits, weighted towards the ones that keep the length.
 *
 * Unweighted, five of the seven operators change the length, and a document
 * whose length changed is almost always caught by the outermost check there is
 * — the input ended early, or it did not end where the item did. Those two
 * codes then account for seven inputs in ten and the decoder is never asked a
 * harder question. Rewriting a byte in place leaves the frame intact and the
 * content wrong, which is the input that reaches the interesting code.
 *
 * The length-changing operators stay, at a lower weight: a truncated stream is
 * a real thing that happens, and the check that catches it has to keep working.
 */
const anyMutation: fc.Arbitrary<Mutation> = fc.oneof(
    { arbitrary: fc.record({ kind: fc.constant('flip-bit' as const),    at: fc.nat(), bit: fc.integer({ min: 0, max: 7 }) }),   weight: 5 },
    { arbitrary: fc.record({ kind: fc.constant('set-byte' as const),    at: fc.nat(), to: fc.integer({ min: 0, max: 255 }) }),  weight: 5 },
    { arbitrary: fc.record({ kind: fc.constant('truncate' as const),    at: fc.nat() }),                                        weight: 1 },
    { arbitrary: fc.record({ kind: fc.constant('delete-byte' as const), at: fc.nat() }),                                        weight: 1 },
    { arbitrary: fc.record({ kind: fc.constant('insert-byte' as const), at: fc.nat(), to: fc.integer({ min: 0, max: 255 }) }),  weight: 1 },
    { arbitrary: fc.record({ kind: fc.constant('append' as const),      bytes: fc.uint8Array({ maxLength: 8 }) }),              weight: 1 },
    { arbitrary: fc.record({ kind: fc.constant('prepend' as const),     bytes: fc.uint8Array({ maxLength: 8 }) }),              weight: 1 },
);


/**
 * A seed with between one and four edits applied to it.
 *
 * More than one, because a single edit is often caught by the very check the
 * next one would have to get past — a truncation that also rewrites the length
 * is the shape of a real attack rather than of a transmission error.
 */
export function mutated(seeds: readonly Uint8Array[] = ALL_SEEDS): fc.Arbitrary<Uint8Array> {
    return fc.tuple(
        fc.constantFrom(...seeds),
        fc.array(anyMutation, { minLength: 1, maxLength: 4 }),
    ).map(([seed, mutations]) => mutations.reduce(mutate, seed));
}


/**
 * How often an action accepted its input, over a sample.
 *
 * A fuzzer that stops reaching the code it is aimed at goes on passing, which
 * makes it worse than no fuzzer: the suite reports green while the thing it was
 * covering is uncovered. Measuring what fraction of inputs get through turns
 * that silent failure into a loud one.
 */
export function acceptanceRate(arbitrary: fc.Arbitrary<Uint8Array>,
                               action:    (bytes: Uint8Array) => unknown,
                               samples    = 2_000): number
{

    let accepted = 0;

    for (const bytes of fc.sample(arbitrary, samples)) {
        try {
            action(bytes);
            accepted += 1;
        }
        catch {
            // Refusal is the expected outcome for most of a mutated corpus;
            // what the refusals were is the business of the suites themselves.
        }
    }

    return accepted / samples;

}


/** A seed prefixed by the tag, so that a mutated body still reaches the codec. */
export function mutatedReading(): fc.Arbitrary<Uint8Array> {
    return mutated(READING_SEEDS.map(hex => hexToBytes(hex)));
}
