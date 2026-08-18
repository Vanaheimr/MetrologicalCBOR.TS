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
 * Telling a counterexample apart from a flake.
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
 * Asserts that `compute()` returns `expected`, and where it does not, repeats
 * the computation to establish whether the disagreement is stable.
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

    const first = compute();

    if (first === expected)
        return;

    // Deliberately after the mismatch rather than always: doubling the work of
    // every property to catch something seen twice in two million runs would
    // be paying the cost on the wrong side.
    const second = compute();

    throw new Error(
        second === expected
            ? 'UNSTABLE EXECUTION, not a counterexample. The same input failed once and ' +
              'succeeded on repetition, so the value the property reports is not the cause ' +
              'and shrinking it is wasted effort. Look at the environment — memory, ' +
              'concurrency, the run rather than the input.\n' +
              `  input:    ${subject()}\n` +
              `  first:    ${first}\n` +
              `  repeated: ${second}\n` +
              `  expected: ${expected}\n` +
              '  See WORKPLAN.md, WP8, for what has already been ruled out.'
            : 'The input is a counterexample: it fails the same way twice.\n' +
              `  input:    ${subject()}\n` +
              `  produced: ${first}\n` +
              `  expected: ${expected}`,
    );

}
