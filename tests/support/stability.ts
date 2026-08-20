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
 * Telling a counterexample apart from a flake, and being able to look again.
 *
 * A property-based test that fails hands you a value and says "this is what
 * broke it". That is only true if the property is a function of its input, and
 * when it is not, the tool does something actively misleading: it *shrinks*
 * towards whichever candidates happened to fail, and reports a minimal value
 * that does not reproduce. Hours then go into the wrong question.
 *
 * This was learned the expensive way, and is recorded under WP8 in
 * `WORKPLAN.md`: a JSON round-trip property failed twice under a loaded machine
 * and its reported counterexample passed on replay, after roughly two million
 * further executions found nothing. What was missing was not more search but
 * the one question nobody had asked — *does it fail the second time?*
 *
 * So this asks it. The assertion fails either way, because a failure is a
 * failure; what changes is that the message says which kind it is, and prints
 * enough to replay the input directly rather than through the generator.
 */


/**
 * The seed every property in this suite runs from.
 *
 * `fc.assert` defaults to a seed derived from the clock, which means a failure
 * is a failure of *that* run and of no other: the inputs are gone the moment
 * the process exits. That is precisely what made the WP8 investigation
 * expensive, so the default here is a constant and a failure can always be
 * looked at again.
 *
 * The exploring is not given up, only moved to where nobody is waiting for it:
 * the nightly job sets `MCBOR_PROPERTY_SEED` to its own run identifier, so
 * every night walks a different twenty thousand documents and any night that
 * goes red names the seed that did it.
 */
export const PROPERTY_SEED: number = (() => {
    const stated = Number.parseInt(process.env['MCBOR_PROPERTY_SEED'] ?? '', 10);
    return Number.isSafeInteger(stated) ? stated : 20_260_819;
})();


/**
 * fast-check options for a property that has to stay reproducible.
 *
 * @param numRuns How many cases to run.
 */
export function reproducibly(numRuns: number): { numRuns: number; seed: number } {
    return { numRuns, seed: PROPERTY_SEED };
}


/** What one execution of the computation did. */
type Outcome =
    | { readonly ok: true;  readonly value: string }
    | { readonly ok: false; readonly error: string };


function attempt(compute: () => string): Outcome {

    try {
        return { ok: true, value: compute() };
    }
    catch (cause) {

        const code = (cause as { code?: unknown }).code;

        return {
            ok:    false,
            error: cause instanceof Error
                       ? (typeof code === 'string' ? `${code}: ${cause.message}` : cause.message)
                       : String(cause),
        };

    }

}


const shown = (outcome: Outcome): string =>
    outcome.ok ? outcome.value : `threw ${outcome.error}`;


const alike = (left: Outcome, right: Outcome): boolean =>
    left.ok
        ? right.ok  && left.value === right.value
        : !right.ok && left.error === right.error;


/**
 * Asserts that `compute()` returns `expected`, and where it does not, repeats
 * the computation to establish whether the disagreement is stable.
 *
 * A thrown error counts as a disagreement and is subjected to the same
 * question, which is the whole point: "it threw" is exactly the shape of
 * failure where one is most tempted to believe the reported input, and a
 * computation that throws once and succeeds on repetition is telling you about
 * the run rather than about the value.
 *
 * @param compute  The computation under test. Must be repeatable.
 * @param expected What it should produce.
 * @param subject  How to describe the input, evaluated only on failure — a
 *                 hexadecimal encoding, so the case can be replayed by hand.
 *
 * @throws {Error} where `compute()` does not return `expected`, with a message
 *         distinguishing a genuine counterexample from an unstable execution.
 */
export function assertStable(compute:  () => string,
                             expected: string,
                             subject:  () => string): void
{

    const first = attempt(compute);

    if (first.ok && first.value === expected)
        return;

    // Deliberately after the mismatch rather than always: doubling the work of
    // every property to catch something seen twice in two million runs would
    // be paying the cost on the wrong side.
    const second = attempt(compute);

    const stable = alike(first, second);

    throw new Error(
        stable
            ? 'The input is a counterexample: it fails the same way twice.\n' +
              `  input:    ${subject()}\n` +
              `  produced: ${shown(first)}\n` +
              `  expected: ${expected}\n` +
              `  seed:     ${PROPERTY_SEED}`
            : 'UNSTABLE EXECUTION, not a counterexample. The same input behaved differently ' +
              'on repetition, so the value the property reports is not the cause and shrinking ' +
              'it is wasted effort. Look at the environment — memory, concurrency, the run ' +
              'rather than the input.\n' +
              `  input:    ${subject()}\n` +
              `  first:    ${shown(first)}\n` +
              `  repeated: ${shown(second)}\n` +
              `  expected: ${expected}\n` +
              `  seed:     ${PROPERTY_SEED}\n` +
              '  See WORKPLAN.md, WP8, for what has already been ruled out.',
    );

}
