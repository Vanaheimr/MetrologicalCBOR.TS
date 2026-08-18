/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/OpenChargingCloud/MetrologicalCBOR.TS>
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
    | 'ERR_REGISTRY_CONFLICT';


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
