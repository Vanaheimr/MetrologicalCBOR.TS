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
 * The instrument needs an instrument.
 *
 * `assertStable` exists to answer one question — *does it fail the second
 * time?* — and its answer decides whether someone spends a day shrinking an
 * input or a day looking at the machine. An instrument that gives the wrong
 * answer is worse than none, because it is believed.
 *
 * Four executions are possible and each has to be named correctly: agreeing,
 * disagreeing stably, disagreeing unstably, and throwing. The last one is why
 * this file exists: the first version of `assertStable` let a thrown error
 * straight through without ever asking its question, so the one shape of
 * failure where the reported input is least trustworthy was the one it said
 * nothing about.
 */

import { describe, expect, it } from 'vitest';

import { assertStable, PROPERTY_SEED, reproducibly } from './stability.js';


/** A computation that behaves differently on each call, from a script. */
function scripted(...outcomes: (string | Error)[]): () => string {

    let call = 0;

    return () => {
        const outcome = outcomes[Math.min(call++, outcomes.length - 1)]!;
        if (outcome instanceof Error) throw outcome;
        return outcome;
    };

}


describe('assertStable', () => {

    it('says nothing when the computation agrees', () => {

        expect(() => assertStable(scripted('abcd'), 'abcd', () => 'input')).not.toThrow();

    });

    it('calls a repeatable mismatch a counterexample', () => {

        expect(() => assertStable(scripted('beef', 'beef'), 'abcd', () => 'input'))
            .toThrowError(/is a counterexample: it fails the same way twice/);

    });

    it('calls a mismatch that goes away an unstable execution', () => {

        expect(() => assertStable(scripted('beef', 'abcd'), 'abcd', () => 'input'))
            .toThrowError(/UNSTABLE EXECUTION/);

    });

    it('calls a mismatch that changes its answer unstable too', () => {

        // Two different wrong answers are not a counterexample either: nothing
        // about the input explains a computation that cannot repeat itself.
        expect(() => assertStable(scripted('beef', 'f00d'), 'abcd', () => 'input'))
            .toThrowError(/UNSTABLE EXECUTION/);

    });

    it('asks its question of a thrown error as well', () => {

        // The case the first version missed: it propagated the throw, so the
        // property reported an input that had never been shown to be at fault.
        expect(() => assertStable(scripted(new Error('boom'), 'abcd'), 'abcd', () => 'input'))
            .toThrowError(/UNSTABLE EXECUTION/);

    });

    it('calls a repeatable throw a counterexample', () => {

        expect(() => assertStable(scripted(new Error('boom'), new Error('boom')), 'abcd', () => 'input'))
            .toThrowError(/is a counterexample: it fails the same way twice/);

    });

    it('reports a throw as what it was rather than as a value', () => {

        expect(() => assertStable(scripted(new Error('boom'), new Error('boom')), 'abcd', () => 'input'))
            .toThrowError(/produced: threw boom/);

    });

    it('carries the error code where the library supplied one', () => {

        const coded = Object.assign(new Error('not valid UTF-8'), { code: 'ERR_CBOR_INVALID_UTF8' });

        expect(() => assertStable(scripted(coded, coded), 'abcd', () => 'input'))
            .toThrowError(/ERR_CBOR_INVALID_UTF8: not valid UTF-8/);

    });

    it('two throws with different messages are unstable, not one counterexample', () => {

        expect(() => assertStable(scripted(new Error('boom'), new Error('bang')), 'abcd', () => 'input'))
            .toThrowError(/UNSTABLE EXECUTION/);

    });

    it('names the input and the seed, so the case can be looked at again', () => {

        expect(() => assertStable(scripted('beef', 'beef'), 'abcd', () => 'D9ACDC820504'))
            .toThrowError(new RegExp(`input:\\s+D9ACDC820504[\\s\\S]*seed:\\s+${PROPERTY_SEED}`));

    });

    it('evaluates the subject only when there is something to report', () => {

        let asked = 0;
        assertStable(scripted('abcd'), 'abcd', () => { asked++; return 'input'; });

        // Describing the input can mean encoding a whole document; a passing
        // property must not pay for a message nobody reads.
        expect(asked).toBe(0);

    });

});


describe('reproducibly', () => {

    it('pins the seed, so a red run can be run again', () => {

        expect(reproducibly(20_000)).toStrictEqual({ numRuns: 20_000, seed: PROPERTY_SEED });

    });

    it('has a seed that is an integer, whatever the environment said', () => {

        // A NaN seed silently turns fast-check back into a clock-seeded run,
        // which is exactly the property this suite is trying not to have.
        expect(Number.isSafeInteger(PROPERTY_SEED)).toBe(true);

    });

});
