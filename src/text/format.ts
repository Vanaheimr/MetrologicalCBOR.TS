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
 * Writing a reading as text: `230 V`, `1.10 kWh`, `(230.00 +/- 0.12) V, k=2`.
 *
 * The output is not a pretty-printing of the reading, it is a second encoding
 * of it. `parseMetrologicalValue(formatMetrologicalValue(v))` returns the same
 * reading, byte for byte in its canonical CBOR form, and that is what makes the
 * JSON mapping of this library lossless rather than merely readable.
 *
 * Two consequences fall out of that requirement, and both are visible in the
 * output:
 *
 * - A decimal fraction whose exponent is not negative is written in scientific
 *   form (`5e2`), because `500` would read back as a plain integer and state a
 *   different resolution.
 * - A prefix is folded into the unit symbol only where that is what the SI
 *   means by it. On a symbol that already carries a power, or on a product
 *   whose leading factor does, it is written as a factor of ten instead:
 *   `km^2` would be a *square* kilometre.
 */

import { UnitRegistry }            from '../registry/index.js';
import { exponentOf, formatDecimal, mantissaOf } from '../model/decimal.js';
import type { DecimalNumber }      from '../model/decimal.js';
import { SIPrefix, prefixSymbol }  from '../model/prefix.js';
import { tryResolveUnitToken }     from './parse.js';
import { statesMoreThanMagnitude } from '../model/uncertainty.js';
import type { Uncertainty }        from '../model/uncertainty.js';
import type { NamedUnit, UnitExponent, UnitRef } from '../model/unit.js';
import type { MetrologicalValue }  from '../model/value.js';
import { DIMENSIONLESS_UNIT_ID }   from './grammar.js';
import {
    MIDDLE_DOT, MULTIPLICATION_SIGN, PLUS_MINUS,
    symbolCarriesPower, toSuperscript,
} from './symbols.js';


export interface FormatOptions {

    /**
     * Whether to keep the output to ASCII.
     *
     * `*` for the middle dot, `^2` for a superscript, `+/-` for the plus-minus
     * sign and `x10^3` for the factor of ten. The reading is the same and
     * parses back the same way; only the characters differ.
     */
    readonly ascii?: boolean;

    /**
     * The registry the output is checked against before a prefix is folded
     * into a symbol. Defaults to the standard one.
     */
    readonly registry?: UnitRegistry;

}


/**
 * Writes a reading as text.
 *
 * @example
 * ```ts
 * formatMetrologicalValue(reading);   // '(230.00 +/-0.12) V, k=2'
 * ```
 */
export function formatMetrologicalValue(value: MetrologicalValue, options?: FormatOptions): string {

    const ascii    = options?.ascii ?? false;
    const registry = options?.registry ?? UnitRegistry.standard;

    const dimensionless = value.unit.kind === 'named' && value.unit.unit.id === DIMENSIONLESS_UNIT_ID;
    const folded        = !dimensionless && canFoldPrefix(value.unit, value.prefix, registry);
    const prefix        = folded ? value.prefix : SIPrefix.None;

    let out = value.uncertainty === undefined
                  ? formatNumber(value.value)
                  : `(${formatNumber(value.value)} ${ascii ? '+/-' : PLUS_MINUS}${formatNumber(value.uncertainty.magnitude)})`;

    // A prefix that could not be folded into a symbol becomes an explicit
    // factor, which is also the only way to give a dimensionless reading one.
    if (!folded && value.prefix !== SIPrefix.None)
        out += ascii
                   ? `x10^${String(value.prefix)}`
                   : `${MULTIPLICATION_SIGN}10${toSuperscript(value.prefix)}`;

    // The unit "one" is the neutral element, and a bare number is how a
    // dimensionless quantity is written. Anything else gets its symbol.
    if (!dimensionless)
        out += ` ${formatUnit(value.unit, prefix, ascii, registry)}`;

    if (value.uncertainty !== undefined)
        out += formatExtensions(value.uncertainty, ascii);

    return out;

}


/**
 * Writes a reading's number, keeping its exact representation.
 *
 * A plain integer stays plain, a fraction with a negative exponent is written
 * positionally so that its trailing zeros show, and anything else takes the
 * scientific form  -  `5e2` states a resolution of a hundred, which `500` does
 * not.
 */
export function formatNumber(value: DecimalNumber): string {

    if (value.kind === 'int' || value.exponent < 0)
        return formatDecimal(value);

    return `${mantissaOf(value).toString()}e${String(exponentOf(value))}`;

}


/**
 * Whether the prefix may be folded into the unit symbol.
 *
 * Two things have to hold. The symbol it would attach to must stand at the
 * first power and carry no power of its own, because only then does prefixing
 * it scale the quantity by the prefix rather than by a power of it. And the
 * token that results must read back as the same prefix and the same unit —
 * folding centi onto the day would produce `cd`, which is the candela.
 */
export function canFoldPrefix(unit:     UnitRef,
                              prefix:   number,
                              registry: UnitRegistry = UnitRegistry.standard): boolean
{

    if (prefix === SIPrefix.None)
        return true;

    const leading = unit.kind === 'named' ? undefined : unit.factors[0];

    // The prefix goes onto the leading factor, so that factor has to stand at
    // the first power for prefixing it to scale the quantity by the prefix.
    const target = unit.kind === 'named'
                       ? unit.unit
                       : leading?.exponent.kind === 'integer' && leading.exponent.value === 1
                             ? leading.unit.unit
                             : undefined;

    if (target === undefined || symbolCarriesPower(target.symbol))
        return false;

    const resolved = tryResolveUnitToken(prefixSymbol(prefix) + target.symbol, registry, true);

    return resolved?.unit.id === target.id && resolved.prefix === prefix;

}


function formatUnit(unit: UnitRef, prefix: number, ascii: boolean, registry: UnitRegistry): string {

    if (unit.kind === 'named')
        return prefixSymbol(prefix) + unit.unit.symbol;

    return unit.factors
               .map((each, index) =>
                   formatFactor(each.unit, each.exponent,
                                index === 0 ? prefix : SIPrefix.None,
                                ascii, registry))
               .join(ascii ? '*' : MIDDLE_DOT);

}


/**
 * One factor of a product: its symbol, its prefix where it has one, and its
 * power.
 *
 * The power is written in superscript where that is unambiguous and with a
 * caret where it is not. Two things make it ambiguous, and both are checked
 * rather than assumed:
 *
 * - the symbol already ends in a superscript, so a second one would run into
 *   it — the cubic metre to the power -1 would read as `m` followed by the
 *   superscripts `3` and `-1`, which is no exponent at all;
 * - symbol and superscript together spell a registered symbol, so `m` to the
 *   third power would read back as the cubic metre.
 *
 * The caret can appear in no unit symbol, so it is always a way out.
 */
function formatFactor(unit:     NamedUnit,
                      exponent: UnitExponent,
                      prefix:   number,
                      ascii:    boolean,
                      registry: UnitRegistry): string {

    const head = prefixSymbol(prefix) + unit.unit.symbol;

    if (exponent.kind === 'rational')
        return `${head}^${String(exponent.numerator)}/${String(exponent.denominator)}`;

    // The first power is what a factor without a stated one carries.
    if (exponent.value === 1)
        return head;

    const caret = `${head}^${String(exponent.value)}`;

    if (ascii || symbolCarriesPower(unit.unit.symbol))
        return caret;

    const superscripted = head + toSuperscript(exponent.value);

    return registry.tryBySymbol(superscripted) === undefined ? superscripted : caret;

}


/**
 * What the uncertainty says beyond its magnitude, in the order the
 * specification lists its keys.
 */
function formatExtensions(value: Uncertainty, ascii: boolean): string {

    if (!statesMoreThanMagnitude(value))
        return '';

    let out = '';

    if (value.coverageFactor !== undefined)
        out += `, k=${formatNumber(value.coverageFactor)}`;

    if (value.coverageProbability !== undefined)
        out += `, p=${formatNumber(value.coverageProbability)}`;

    if (value.distribution !== undefined)
        out += `, dist=${value.distribution}`;

    if (value.degreesOfFreedom !== undefined)
        out += `, nu=${formatNumber(value.degreesOfFreedom)}`;

    // `ascii` does not change the extensions: they are ASCII already. The
    // parameter is taken so that a future extension needing a symbol has one
    // obvious place to honour it.
    void ascii;

    return out;

}
