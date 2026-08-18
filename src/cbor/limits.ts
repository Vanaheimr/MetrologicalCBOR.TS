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
 * Bounds on what decoding one input may cost.
 *
 * Specification Section 7 requires them: decimal fractions permit very large
 * exponents and bignum mantissas, and a decoder must bound the resources spent
 * on reconstructing a value rather than discover the bound by running out of
 * memory. Measurement data arrives over a network from parties that are not
 * always friendly.
 *
 * The defaults are generous for real metrological documents — the worked
 * example of the specification is 713 bytes — and tight enough that a hostile
 * input fails fast. Raise them deliberately, per call, where an application
 * genuinely needs more.
 */
export interface DecodeLimits {

    /** How deeply items may nest. A CBOR bomb is mostly depth. */
    readonly maxDepth: number;

    /** How many data items one input may contain in total. */
    readonly maxItems: number;

    /** The longest byte or text string, in bytes. */
    readonly maxStringBytes: number;

    /** The most elements one array may hold. */
    readonly maxArrayItems: number;

    /** The most pairs one map may hold. */
    readonly maxMapPairs: number;

    /**
     * The longest bignum mantissa, in bytes.
     *
     * 128 bytes is a 1024-bit integer. No instrument reports a reading that
     * needs one; the limit exists so that a claimed length cannot turn into
     * unbounded work.
     */
    readonly maxBignumBytes: number;

}


/**
 * The limits applied when a caller states none.
 */
export const DEFAULT_LIMITS: DecodeLimits = Object.freeze({
    maxDepth:        64,
    maxItems:        1_000_000,
    maxStringBytes:  16 * 1024 * 1024,
    maxArrayItems:   1_000_000,
    maxMapPairs:     1_000_000,
    maxBignumBytes:  128,
});


/**
 * Fills the gaps in a partial set of limits from {@link DEFAULT_LIMITS}.
 */
export function resolveLimits(limits?: Partial<DecodeLimits>): DecodeLimits {
    return limits === undefined
               ? DEFAULT_LIMITS
               : Object.freeze({ ...DEFAULT_LIMITS, ...limits });
}
