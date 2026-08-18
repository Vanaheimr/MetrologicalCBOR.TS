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
 * One entry of the unit registry of specification Section 4.
 *
 * The registry is the wire vocabulary, not a list of types an implementation
 * has to provide. A decoder needs the identification and the symbol; nothing
 * about a unit having no dedicated type restricts what may be sent.
 */
export interface UnitDefinition {

    /**
     * The numeric identification, stable and never renumbered.
     *
     * 1..32767 are managed by the specification, 32768..65535 are available for
     * private use. 0 is reserved and never valid on the wire.
     */
    readonly id: number;

    /**
     * The symbol as the specification table spells it, in Unicode
     * Normalization Form C.
     *
     * Encoders should emit this spelling; decoders also accept the
     * {@link UnitDefinition.aliases}.
     */
    readonly symbol: string;

    /** The name of the unit, for display and diagnostics. */
    readonly name: string;

    /**
     * Alternative symbols a decoder must accept, in NFC.
     *
     * These are the aliases the specification lists, for example `Ohm` for `Ω`
     * and `Cel` for `°C`.
     */
    readonly aliases: readonly string[];

    /**
     * The symbol of the corresponding entry in the IANA "SenML Units" registry
     * (RFC 8428), where the specification names one, otherwise `undefined`.
     *
     * This covers only the overlapping subset the specification documents, not
     * everything SenML defines.
     */
    readonly senml: string | undefined;

    /**
     * Whether the unit is an interval scale rather than a ratio scale.
     *
     * The degree Celsius is the only such unit in the registry. Converting it
     * to the kelvin needs an offset, not a factor, so a prefix on it scales a
     * temperature *difference*, never a thermodynamic temperature. Consumers
     * must not convert a prefixed affine reading by scaling alone
     * (specification Section 3.3).
     */
    readonly affine: boolean;

    /**
     * Whether this entry was registered by the application rather than by the
     * specification, that is whether its identification is 32768 or above.
     *
     * Private-use identifications are not interoperable outside the agreement
     * of the communicating parties.
     */
    readonly privateUse: boolean;

    /** A remark from the specification about this unit, where it makes one. */
    readonly note: string | undefined;

}


/**
 * A private-use unit, as passed to {@link UnitRegistry.withPrivateUnits}.
 *
 * Only the identification, symbol and name are required; everything else
 * defaults.
 */
export interface PrivateUnitDefinition {

    /** The identification, which must lie in 32768..65535. */
    readonly id: number;

    /** The symbol. Must not collide with a registered symbol or alias. */
    readonly symbol: string;

    /** The name of the unit. */
    readonly name: string;

    /** Alternative symbols a decoder should accept. Defaults to none. */
    readonly aliases?: readonly string[];

    /** Whether the unit is an interval scale. Defaults to `false`. */
    readonly affine?: boolean;

    /** A remark about this unit. */
    readonly note?: string;

}
