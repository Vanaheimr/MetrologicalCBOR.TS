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
 * A fault in this library rather than in its input.
 *
 * Deliberately not an {@link McborError}: every error code in that hierarchy
 * names a requirement the *input* failed to meet, and a caller distinguishing
 * "the measurement data is bad" from "the library is broken" needs those two to
 * be different things. The fuzz suites assert exactly that distinction — every
 * input yields an `McborError`, so an `InvariantError` escaping is a bug
 * report, not a rejected document.
 */
export class InvariantError extends Error {

    override readonly name: string = 'InvariantError';

}


/**
 * A value the surrounding code guarantees, where the type system cannot see the
 * guarantee.
 *
 * The case this exists for is a mandatory capture group. Under
 * `noUncheckedIndexedAccess` every group of a match is typed `string |
 * undefined`, which is right for an optional group and wrong for one the
 * pattern's own quantifier or alternation makes certain. Written as a `?? ''`
 * at each site, that would be a silent wrong answer where the reasoning was
 * mistaken, and — because the case cannot arise — one permanently untestable
 * branch per site.
 *
 * Stated here instead, the reasoning is checked once at run time and covered
 * once by a test, and a mistake in it announces itself.
 *
 * @throws {InvariantError} if the guarantee does not hold, which means the
 *         pattern and the code that reads it have drifted apart.
 */
export function invariant<T>(value: T | undefined, what: string): T {

    if (value === undefined)
        throw new InvariantError(`${what} was expected to be present, and is not. This is a defect in Metrological CBOR; please report it.`);

    return value;

}
