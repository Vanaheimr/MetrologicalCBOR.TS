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
 * Reading a reading back out of text.
 *
 * The parser accepts more than the renderer writes  -  ASCII for every symbol,
 * either spelling of micro, a caret where a superscript would do  -  but it
 * accepts nothing ambiguous, and it never guesses. What it does not recognise
 * it rejects, because a reading understood as the wrong unit is worse than a
 * reading not understood at all.
 *
 * The one rule worth knowing before reading the code: **a token is tried as a
 * whole unit symbol before it is split into a prefix and a symbol.** That is
 * what makes `cd` the candela rather than a centi-day, `min` the minute rather
 * than a milli-anything, and `kat` the katal. Only when the whole token is not
 * a registered symbol is a prefix peeled off the front, longest first, so that
 * `das` is a decasecond rather than a deci-something.
 */

import { ValueError }              from '../errors.js';
import { invariant }               from '../invariant.js';
import { UnitRegistry }            from '../registry/index.js';
import type { UnitDefinition }     from '../registry/types.js';
import { parseDecimal }            from '../model/decimal.js';
import type { DecimalNumber }      from '../model/decimal.js';
import { SIPrefix, assertSIPrefix, prefixBySymbol } from '../model/prefix.js';
import { factor, namedUnit, unitExponent, unitProduct } from '../model/unit.js';
import type { NamedUnit, UnitExponent, UnitFactor, UnitRef } from '../model/unit.js';
import { uncertainty }             from '../model/uncertainty.js';
import type { UncertaintyDistribution } from '../model/uncertainty.js';
import { metrologicalValue }      from '../model/value.js';
import type { MetrologicalValue } from '../model/value.js';
import { DIMENSIONLESS_UNIT_ID }   from './grammar.js';
import { fromSuperscript, normalise, SUPERSCRIPT_CHARACTERS } from './symbols.js';

/** A number: an integer, a decimal fraction, or either in scientific form. */
const NUMBER = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;

/**
 * The factor of ten that carries a prefix the unit symbol could not.
 *
 * Both spellings of the exponent are captured by one group rather than by one
 * group each. An alternation of two groups leaves exactly one of them absent,
 * and every reader of the match then has to restate which \u2014 a fact the pattern
 * already knows and the type system cannot see.
 */
const SCALE = /^\s*[\u00D7x*]\s*10\s*(\^\s*[+-]?\d+|[\u207B\u207A\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+)/;

/** The plus-minus sign, and the two ways of typing it. */
const PLUS_MINUS = /\u00B1|\+\/-|\+-/;

/** A caret exponent, whole or rational. */
const CARET_EXPONENT = /\^\s*([+-]?\d+)(?:\s*\/\s*(\d+))?$/;

const SUPERSCRIPT_EXPONENT = new RegExp(`[${SUPERSCRIPT_CHARACTERS}]+$`);

/** What separates the factors of a product of powers. */
const FACTOR_SEPARATOR = /[\u00B7*\s]+/;

const DISTRIBUTIONS = new Set<UncertaintyDistribution>([
    'normal', 'rectangular', 'triangular', 'u-shaped', 'student-t',
]);


export interface ParseOptions {

    /**
     * The registry to resolve units against. Defaults to the standard one.
     */
    readonly registry?: UnitRegistry;

}


/**
 * Reads a reading from text.
 *
 * @throws {ValueError} if the text is not a reading, or states something the
 *         specification does not permit.
 * @throws {UnitError} if a unit symbol is not registered.
 *
 * @example
 * ```ts
 * parseMetrologicalValue('230 V');
 * parseMetrologicalValue('(230.00 +/-0.12) V, k=2');
 * parseMetrologicalValue('9.81 m*s^-2');      // ASCII is accepted throughout
 * ```
 */
export function parseMetrologicalValue(text: string, options?: ParseOptions): MetrologicalValue {

    const registry = options?.registry ?? UnitRegistry.standard;

    // Neither a number nor a unit expression may contain a comma, so the
    // extensions separate cleanly.
    const [reading = '', ...extensions] = normalise(text).trim().split(',');

    const { value, magnitude, rest } = readMagnitude(reading.trim());

    const { prefix: scalePrefix, rest: afterScale } = readScale(rest);

    const unitText = afterScale.trim();

    const { unit, prefix: symbolPrefix } = unitText === ''
                                               ? { unit: dimensionless(registry), prefix: SIPrefix.None }
                                               : readUnit(unitText, registry);

    if (scalePrefix !== SIPrefix.None && symbolPrefix !== SIPrefix.None)
        throw syntax(`${JSON.stringify(text)} carries a prefix twice, once as a factor of ten and once on the unit.`);

    const prefix = scalePrefix !== SIPrefix.None ? scalePrefix : symbolPrefix;

    assertSIPrefix(prefix);

    const stated = readExtensions(extensions.map(each => each.trim()));

    if (magnitude === undefined) {

        if (stated.any)
            throw syntax(`${JSON.stringify(text)} states a coverage factor or a distribution without an uncertainty.`);

        return metrologicalValue({ value, unit, prefix });

    }

    return metrologicalValue({
        value,
        unit,
        prefix,
        uncertainty: uncertainty({
            magnitude,
            coverageFactor:      stated.coverageFactor,
            coverageProbability: stated.coverageProbability,
            distribution:        stated.distribution,
            degreesOfFreedom:    stated.degreesOfFreedom,
        }),
    });

}


// ---------------------------------------------------------------------------
// The magnitude, with or without its uncertainty
// ---------------------------------------------------------------------------

function readMagnitude(text: string): { value: DecimalNumber; magnitude: DecimalNumber | undefined; rest: string } {

    if (!text.startsWith('(')) {

        const match = NUMBER.exec(text);

        if (match === null)
            throw syntax(`${JSON.stringify(text)} does not begin with a number.`);

        return {
            value:     parseDecimal(match[0]),
            magnitude: undefined,
            rest:      text.slice(match[0].length),
        };

    }

    const close = text.indexOf(')');

    if (close < 0)
        throw syntax(`${JSON.stringify(text)} opens a bracket that is never closed.`);

    const inner = text.slice(1, close);
    const split = PLUS_MINUS.exec(inner);

    if (split === null)
        throw syntax(`${JSON.stringify(text)} brackets something that is not a reading and its uncertainty.`);

    return {
        value:     parseDecimal(inner.slice(0, split.index).trim()),
        magnitude: parseDecimal(inner.slice(split.index + split[0].length).trim()),
        rest:      text.slice(close + 1),
    };

}


function readScale(text: string): { prefix: number; rest: string } {

    const match = SCALE.exec(text);

    if (match === null)
        return { prefix: SIPrefix.None, rest: text };

    const written = invariant(match[1], 'the exponent of a factor of ten');

    // The caret form carries its own marker; anything else the pattern let
    // through is made of the characters fromSuperscript reads, all of them.
    const digits = written.startsWith('^')
                       ? written.slice(1).trim()
                       : invariant(fromSuperscript(written), 'the digits of a superscript exponent');

    return { prefix: Number.parseInt(digits, 10), rest: text.slice(match[0].length) };

}


// ---------------------------------------------------------------------------
// The unit
// ---------------------------------------------------------------------------

function dimensionless(registry: UnitRegistry): NamedUnit {
    return namedUnit(registry.byId(DIMENSIONLESS_UNIT_ID));
}


function readUnit(text: string, registry: UnitRegistry): { unit: UnitRef; prefix: number } {

    const tokens = text.split(FACTOR_SEPARATOR).filter(each => each !== '');

    if (tokens.length === 0)
        throw syntax(`${JSON.stringify(text)} is not a unit.`);

    // Annotated, because the constant is a literal type and the prefix a
    // token further down is not.
    let prefix: number = SIPrefix.None;

    const factors: UnitFactor[] = tokens.map((token, index) => {

        // The whole token is tried as a symbol before anything is stripped off
        // it, exponent included. That is what makes `m2` the registered square
        // metre rather than the metre raised to the second power - both are
        // expressible, and the registry entry is the one this spelling names.
        const whole = registry.tryBySymbol(token);

        if (whole !== undefined)
            return factor(namedUnit(whole), unitExponent(1));

        const { symbol, exponent } = splitExponent(token);

        // Only the leading factor may carry a prefix. A prefix applies to the
        // quantity as a whole, so `m*ks^-2` would be asking for something this
        // format cannot say  -  and does not mean what it looks like it means.
        const resolved = resolveSymbol(symbol, registry, index === 0);

        if (index === 0)
            prefix = resolved.prefix;

        return factor(namedUnit(resolved.unit), exponent);

    });

    const only = factors.length === 1 ? factors[0] : undefined;

    if (only?.exponent.kind === 'integer' && only.exponent.value === 1)
        return { unit: only.unit, prefix };

    return { unit: unitProduct(factors), prefix };

}


function splitExponent(token: string): { symbol: string; exponent: UnitExponent } {

    const caret = CARET_EXPONENT.exec(token);

    if (caret !== null) {

        const numerator   = Number.parseInt(invariant(caret[1], 'the numerator of a caret exponent'), 10);
        const denominator = caret[2] === undefined ? 1 : Number.parseInt(caret[2], 10);

        return {
            symbol:   token.slice(0, caret.index),
            exponent: unitExponent(numerator, denominator),
        };

    }

    const superscript = SUPERSCRIPT_EXPONENT.exec(token);

    if (superscript !== null) {

        const digits = fromSuperscript(superscript[0]);

        // Checked rather than parsed leniently: `3-1` is what the two
        // superscripts of `m^3^-1` would run together into, and parseInt would
        // read that as 3 without complaint.
        if (digits === undefined || !/^[+-]?\d+$/.test(digits))
            throw syntax(`${JSON.stringify(token)} has a superscript that is not a number.`);

        return {
            symbol:   token.slice(0, superscript.index),
            exponent: unitExponent(Number.parseInt(digits, 10)),
        };

    }

    return { symbol: token, exponent: unitExponent(1) };

}


/**
 * A token as a unit and the prefix in front of it, or `undefined` where it is
 * neither.
 *
 * The whole token is tried first, so a registered symbol is never mistaken for
 * a prefixed one. Only then is a prefix peeled off, two characters before one,
 * so that `das` is a decasecond.
 *
 * Exported because the renderer consults it before folding a prefix into a
 * symbol: writing `cd` for a centi-day would be writing the candela, and the
 * only reliable way to know that is to ask the reader.
 */
export function tryResolveUnitToken(token: string, registry: UnitRegistry, allowPrefix: boolean):
    { unit: UnitDefinition; prefix: number } | undefined
{

    if (token === '')
        return undefined;

    const whole = registry.tryBySymbol(token);

    if (whole !== undefined)
        return { unit: whole, prefix: SIPrefix.None };

    if (!allowPrefix)
        return undefined;

    for (const length of [2, 1]) {

        if (token.length <= length)
            continue;

        const prefix = prefixBySymbol(token.slice(0, length));

        if (prefix === undefined)
            continue;

        const unit = registry.tryBySymbol(token.slice(length));

        if (unit !== undefined)
            return { unit, prefix };

    }

    return undefined;

}


function resolveSymbol(token: string, registry: UnitRegistry, allowPrefix: boolean):
    { unit: UnitDefinition; prefix: number }
{

    if (token === '')
        throw syntax('A unit is missing its symbol.');

    const resolved = tryResolveUnitToken(token, registry, allowPrefix);

    if (resolved !== undefined)
        return resolved;

    // Falling through to the registry gives the caller its error, which names
    // the symbol and points at the registry rather than at the grammar.
    return { unit: registry.bySymbol(token), prefix: SIPrefix.None };

}


// ---------------------------------------------------------------------------
// The extensions
// ---------------------------------------------------------------------------

interface StatedExtensions {
    readonly any:                  boolean;
    readonly coverageFactor:       DecimalNumber | undefined;
    readonly coverageProbability:  DecimalNumber | undefined;
    readonly distribution:         UncertaintyDistribution | undefined;
    readonly degreesOfFreedom:     DecimalNumber | undefined;
}


function readExtensions(extensions: readonly string[]): StatedExtensions {

    let coverageFactor:      DecimalNumber | undefined;
    let coverageProbability: DecimalNumber | undefined;
    let distribution:        UncertaintyDistribution | undefined;
    let degreesOfFreedom:    DecimalNumber | undefined;

    for (const extension of extensions) {

        const match = /^([A-Za-z\u03BD]+)\s*=\s*(.+)$/.exec(extension);

        if (match === null)
            throw syntax(`${JSON.stringify(extension)} is not a name and a value.`);

        const name  = invariant(match[1], 'the name of an extension');
        const given = invariant(match[2], 'the value of an extension').trim();

        switch (name) {

            case 'k':
                coverageFactor = parseDecimal(given);
                break;

            case 'p':
                coverageProbability = parseDecimal(given);
                break;

            case 'dist':
                if (!DISTRIBUTIONS.has(given as UncertaintyDistribution))
                    throw new ValueError('ERR_UNCERTAINTY_DISTRIBUTION',
                                         `${JSON.stringify(given)} is not a probability distribution.`,
                                         { clause: '3.4' });
                distribution = given as UncertaintyDistribution;
                break;

            case 'nu':
            case '\u03BD':
                degreesOfFreedom = parseDecimal(given);
                break;

            default:
                throw syntax(`${JSON.stringify(name)} is not something a reading states.`);

        }

    }

    return {
        any: coverageFactor      !== undefined || coverageProbability !== undefined ||
             distribution        !== undefined || degreesOfFreedom    !== undefined,
        coverageFactor,
        coverageProbability,
        distribution,
        degreesOfFreedom,
    };

}


function syntax(message: string): ValueError {
    return new ValueError('ERR_TEXT_SYNTAX', message, { clause: '3' });
}
