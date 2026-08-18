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

import { UnitError }                             from '../errors.js';
import type { PrivateUnitDefinition, UnitDefinition } from './types.js';
import {
    STANDARD_UNITS,
    UNIT_ID_MAX,
    UNIT_ID_MIN,
    UNIT_ID_PRIVATE_USE_MIN,
    UNIT_ID_RESERVED,
} from './units.generated.js';


/**
 * Resolves unit identifications and symbols against the registry of
 * specification Section 4.
 *
 * A registry is immutable. {@link UnitRegistry.withPrivateUnits} returns a new
 * registry rather than modifying this one, so that an application registering
 * a private-use unit cannot change how unrelated code decodes the wire.
 *
 * @example
 * ```ts
 * UnitRegistry.standard.byId(5).symbol;      // 'V'
 * UnitRegistry.standard.bySymbol('Ohm').id;  // 14, via the alias
 * UnitRegistry.standard.tryById(999);        // undefined, rather than a throw
 * ```
 */
export class UnitRegistry {

    /** The units of the specification, plus any private-use units of this registry. */
    readonly units: readonly UnitDefinition[];

    readonly #byId:     ReadonlyMap<number, UnitDefinition>;
    readonly #bySymbol: ReadonlyMap<string, UnitDefinition>;

    private constructor(units: readonly UnitDefinition[]) {

        const byId     = new Map<number, UnitDefinition>();
        const bySymbol = new Map<string, UnitDefinition>();

        for (const unit of units) {
            byId.set(unit.id, unit);
            bySymbol.set(unit.symbol.normalize('NFC'), unit);
            for (const alias of unit.aliases)
                bySymbol.set(alias.normalize('NFC'), unit);
        }

        this.units     = Object.freeze([...units]);
        this.#byId     = byId;
        this.#bySymbol = bySymbol;

    }


    /**
     * The registry of the specification, without private-use units.
     */
    static readonly standard: UnitRegistry = new UnitRegistry(STANDARD_UNITS);


    /**
     * Looks up a unit by its numeric identification.
     *
     * @throws {UnitError} if the identification is 0, outside 1..65535, or not
     *         registered. The specification requires a decoder to reject an
     *         unknown identification rather than substitute a placeholder,
     *         because a value silently attributed to the wrong unit is worse
     *         than a decoding failure (Section 7).
     */
    byId(id: number): UnitDefinition {

        const unit = this.tryById(id);

        if (unit !== undefined)
            return unit;

        if (id === UNIT_ID_RESERVED)
            throw new UnitError(
                'ERR_UNIT_ID_RESERVED',
                'The unit identification 0 is reserved and never valid on the wire.',
                { clause: '4' },
            );

        if (!Number.isInteger(id) || id < UNIT_ID_MIN || id > UNIT_ID_MAX)
            throw new UnitError(
                'ERR_UNIT_ID_OUT_OF_RANGE',
                `The unit identification ${String(id)} is outside the valid range ${String(UNIT_ID_MIN)}..${String(UNIT_ID_MAX)}.`,
                { clause: '3.2' },
            );

        throw new UnitError(
            'ERR_UNIT_UNKNOWN',
            id >= UNIT_ID_PRIVATE_USE_MIN
                ? `The unit identification ${String(id)} is in the private-use range but is not registered. Register it with UnitRegistry.withPrivateUnits().`
                : `The unit identification ${String(id)} is not registered.`,
            { clause: '3.2' },
        );

    }


    /**
     * Looks up a unit by its numeric identification, or returns `undefined`.
     *
     * Use this where a missing unit is an expected outcome; use
     * {@link UnitRegistry.byId} where it is a decoding failure.
     */
    tryById(id: number): UnitDefinition | undefined {
        return this.#byId.get(id);
    }


    /**
     * Looks up a unit by its symbol or one of its aliases.
     *
     * The lookup is case-sensitive — `T` is the tesla and `t` the tonne — but
     * applies Unicode Normalization Form C first, which resolves U+2126 OHM
     * SIGN onto the registered U+03A9.
     *
     * @throws {UnitError} if the symbol is not registered.
     */
    bySymbol(symbol: string): UnitDefinition {

        const unit = this.tryBySymbol(symbol);

        if (unit === undefined)
            throw new UnitError(
                'ERR_UNIT_UNKNOWN',
                `The unit symbol ${JSON.stringify(symbol)} is not registered.`,
                { clause: '3.2' },
            );

        return unit;

    }


    /**
     * Looks up a unit by its symbol or one of its aliases, or returns
     * `undefined`.
     */
    tryBySymbol(symbol: string): UnitDefinition | undefined {
        return this.#bySymbol.get(symbol.normalize('NFC'));
    }


    /**
     * Whether an identification is registered in this registry.
     */
    has(id: number): boolean {
        return this.#byId.has(id);
    }


    /**
     * Returns a new registry that also resolves the given private-use units.
     *
     * Private-use identifications lie in 32768..65535 and are not
     * interoperable outside the agreement of the communicating parties
     * (specification Section 4).
     *
     * @throws {UnitError} if an identification lies outside the private-use
     *         range, or if an identification, symbol or alias is already taken.
     */
    withPrivateUnits(...definitions: readonly PrivateUnitDefinition[]): UnitRegistry {

        const added: UnitDefinition[] = [];

        for (const definition of definitions) {

            const { id, symbol, name } = definition;

            if (!Number.isInteger(id) || id < UNIT_ID_PRIVATE_USE_MIN || id > UNIT_ID_MAX)
                throw new UnitError(
                    'ERR_UNIT_ID_NOT_PRIVATE_USE',
                    `The unit identification ${String(id)} is outside the private-use range ${String(UNIT_ID_PRIVATE_USE_MIN)}..${String(UNIT_ID_MAX)}.`,
                    { clause: '4' },
                );

            if (this.#byId.has(id) || added.some(unit => unit.id === id))
                throw new UnitError(
                    'ERR_REGISTRY_CONFLICT',
                    `The unit identification ${String(id)} is already registered.`,
                    { clause: '4' },
                );

            const aliases   = (definition.aliases ?? []).map(alias => alias.normalize('NFC'));
            const spellings = [symbol.normalize('NFC'), ...aliases];

            for (const spelling of spellings) {

                const existing = this.#bySymbol.get(spelling)
                              ?? added.find(unit => unit.symbol === spelling || unit.aliases.includes(spelling));

                if (existing !== undefined)
                    throw new UnitError(
                        'ERR_REGISTRY_CONFLICT',
                        `The unit symbol ${JSON.stringify(spelling)} is already used by identification ${String(existing.id)} (${existing.name}).`,
                        { clause: '4' },
                    );

            }

            added.push(Object.freeze({
                id,
                symbol:     symbol.normalize('NFC'),
                name,
                aliases:    Object.freeze(aliases),
                senml:      undefined,
                affine:     definition.affine ?? false,
                privateUse: true,
                note:       definition.note,
            }));

        }

        return new UnitRegistry([...this.units, ...added]);

    }

}
