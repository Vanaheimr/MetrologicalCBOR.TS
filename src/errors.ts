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
 * Machine-readable error codes.
 *
 * Every code corresponds to a normative requirement of the specification, and
 * the {@link McborError.clause} of a thrown error names the section it
 * enforces. `docs/conformance.md` maps clause to code to test.
 *
 * The set grows with each work package; the codes listed here are those the
 * unit registry can raise.
 */
export type McborErrorCode =

    /** A unit identification that is not registered. Specification Section 3.2. */
    | 'ERR_UNIT_UNKNOWN'

    /** The unit identification 0, which is reserved and never valid on the wire. Specification Section 4. */
    | 'ERR_UNIT_ID_RESERVED'

    /** A unit identification outside 1..65535, or not an integer. Specification Sections 3.2 and 4. */
    | 'ERR_UNIT_ID_OUT_OF_RANGE'

    /** A private-use registration outside 32768..65535. Specification Section 4. */
    | 'ERR_UNIT_ID_NOT_PRIVATE_USE'

    /** A private-use registration whose identification or symbol is already taken. */
    | 'ERR_REGISTRY_CONFLICT'

    /** The input ended in the middle of a data item. RFC 8949, Section 5.1. */
    | 'ERR_CBOR_UNEXPECTED_END'

    /** The input is not well-formed CBOR. RFC 8949, Section 5.1. */
    | 'ERR_CBOR_MALFORMED'

    /** A complete data item was decoded, but bytes followed it. */
    | 'ERR_CBOR_TRAILING_DATA'

    /** A text string is not valid UTF-8. RFC 8949, Section 3.1. */
    | 'ERR_CBOR_INVALID_UTF8'

    /** An argument was not encoded in the shortest form. RFC 8949, Section 4.2.1. */
    | 'ERR_CBOR_NON_PREFERRED'

    /** An indefinite-length item, which deterministic encoding forbids. RFC 8949, Section 4.2.1. */
    | 'ERR_CBOR_INDEFINITE_LENGTH'

    /** A map contains the same key twice. RFC 8949, Section 5.6. */
    | 'ERR_CBOR_DUPLICATE_KEY'

    /** The keys of a map are not in bytewise lexicographic order. RFC 8949, Section 4.2.1. */
    | 'ERR_CBOR_UNSORTED_KEYS'

    /** Decoding would exceed a configured resource limit. Specification Section 7. */
    | 'ERR_CBOR_LIMIT_EXCEEDED'

    /** A value cannot be encoded, for example a map with a duplicate key. */
    | 'ERR_CBOR_UNENCODABLE'

    /**
     * A reading is a binary floating-point number.
     *
     * Specification Section 3.1: an IEEE 754 double can represent neither
     * `0.1` exactly nor a decimal scale at all, so it cannot carry a reading.
     */
    | 'ERR_VALUE_FLOAT'

    /** A reading is a bigfloat (tag 5), which Section 3.1 excludes. */
    | 'ERR_VALUE_BIGFLOAT'

    /** A reading is neither an integer nor a decimal fraction. Section 3.1. */
    | 'ERR_VALUE_TYPE'

    /** A decimal exponent beyond what this implementation will reconstruct. Section 7. */
    | 'ERR_VALUE_EXPONENT_RANGE'

    /** A mantissa beyond what this implementation will reconstruct. Section 7. */
    | 'ERR_VALUE_MANTISSA_RANGE'

    /** A decimal string that is not a decimal number. */
    | 'ERR_VALUE_SYNTAX'

    /** Text that is not a reading in the format this library writes. */
    | 'ERR_TEXT_SYNTAX'

    /** A division was asked for without stating the scale to round it to. */
    | 'ERR_VALUE_INEXACT'

    /** An SI prefix that is not one of the 25 canonical exponents. Section 3.3. */
    | 'ERR_PREFIX_INVALID'

    /** A unit exponent whose numerator is zero. Section 3.2. */
    | 'ERR_UNIT_EXPONENT_ZERO'

    /** A unit exponent whose denominator is not positive. Section 3.2. */
    | 'ERR_UNIT_EXPONENT_DENOMINATOR'

    /** A product of powers with no factors. Section 3.2. */
    | 'ERR_UNIT_PRODUCT_EMPTY'

    /** A single named unit written as a one-element product. Section 3.2. */
    | 'ERR_UNIT_SINGLE_AS_PRODUCT'

    /** The tag content is not an array of two, three or four items. Section 3. */
    | 'ERR_ARITY'

    /** A negative measurement uncertainty. Section 3.4. */
    | 'ERR_UNCERTAINTY_NEGATIVE'

    /** An uncertainty map without its magnitude. Section 3.4. */
    | 'ERR_UNCERTAINTY_NO_MAGNITUDE'

    /** A coverage factor that is not positive. Section 3.4. */
    | 'ERR_UNCERTAINTY_COVERAGE_FACTOR'

    /** A coverage probability outside ]0, 1]. Section 3.4. */
    | 'ERR_UNCERTAINTY_PROBABILITY'

    /** An unknown probability distribution, or the "not stated" 0 written out. Section 3.4. */
    | 'ERR_UNCERTAINTY_DISTRIBUTION'

    /** Effective degrees of freedom that are not positive. Section 3.4. */
    | 'ERR_UNCERTAINTY_DEGREES_OF_FREEDOM'

    /** An uncertainty map holds a key the specification does not define. Section 3.4. */
    | 'ERR_UNCERTAINTY_UNKNOWN_KEY'

    /**
     * An uncertainty map that states nothing a bare number could not.
     *
     * Section 3.4 calls the bare number the compact form, and Section 6
     * requires the encoding to be a function of the value alone — which two
     * spellings of one uncertainty would not be.
     */
    | 'ERR_UNCERTAINTY_REDUNDANT_MAP'

    /** The data item is not tagged as a metrological value. Section 3. */
    | 'ERR_TAG_MISMATCH'

    /**
     * A prefix of 0 written where it could have been omitted.
     *
     * Section 3.3 requires the prefix to be written when an uncertainty
     * follows it, and Section 6 requires the encoding to be a function of the
     * value alone — which two spellings of the same reading would not be.
     */
    | 'ERR_PREFIX_REDUNDANT';


export interface McborErrorOptions extends ErrorOptions {

    /**
     * The section of the specification this error enforces, for example `'3.1'`.
     */
    readonly clause?: string;

}


/**
 * The base class of every error this library raises.
 *
 * Decoding failures are not exceptional in this domain, they are the correct
 * outcome: the specification requires a decoder to reject an unknown unit
 * rather than substitute a placeholder, because a value silently attributed to
 * the wrong unit is worse than a decoding failure (Section 7).
 */
export class McborError extends Error {

    override readonly name: string = 'McborError';

    /** The machine-readable code. Stable across releases. */
    readonly code: McborErrorCode;

    /** The section of the specification this error enforces, if it maps to one. */
    readonly clause: string | undefined;

    constructor(code:     McborErrorCode,
                message:  string,
                options?: McborErrorOptions)
    {
        super(message, options);
        this.code   = code;
        this.clause = options?.clause;
    }

}


/**
 * A unit of measure could not be resolved, or is not valid.
 */
export class UnitError extends McborError {

    override readonly name: string = 'UnitError';

}


/**
 * A reading, a prefix or an uncertainty is not one the specification permits.
 *
 * Separate from {@link CborError} because the bytes may be perfectly
 * well-formed CBOR and still not be a metrological value: a binary float is
 * valid CBOR and an invalid reading.
 */
export class ValueError extends McborError {

    override readonly name: string = 'ValueError';

}


/**
 * The CBOR encoding itself is at fault: the bytes are not well-formed, they
 * violate the deterministic encoding requirements, or they would cost more to
 * decode than the configured limits allow.
 */
export class CborError extends McborError {

    override readonly name: string = 'CborError';

    /** The byte offset the fault was detected at, where one applies. */
    readonly offset: number | undefined;

    constructor(code:     McborErrorCode,
                message:  string,
                options?: McborErrorOptions & { readonly offset?: number })
    {
        super(code, options?.offset === undefined
                        ? message
                        : `${message} (at byte ${String(options.offset)})`,
              options);
        this.offset = options?.offset;
    }

}
