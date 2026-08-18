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
 * SI prefixes, as the decimal power they stand for.
 *
 * The prefix is kept separate from the value rather than folded into it:
 * `5.00 mA` is the reading of the instrument, `0.005 A` is a computation on
 * it. Both denote the same quantity, but only the former reproduces what was
 * displayed and certified.
 *
 * A prefix is not a general scaling factor. Only the 25 exponents the SI
 * defines are valid, so 4 or -5 is an error rather than a ten-thousandth or a
 * hundred-thousandth.
 *
 * @see The specification, Section 3.3, and the SI brochure, 9th edition, with
 *      the prefixes added by CGPM Resolution 3 of 2022
 */

import { ValueError } from '../errors.js';


/**
 * The exponent of each SI prefix.
 *
 * @example
 * ```ts
 * SIPrefix.Kilo;   //  3
 * SIPrefix.Milli;  // -3
 * SIPrefix.None;   //  0
 * ```
 */
export const SIPrefix = Object.freeze({

    Quecto: -30,
    Ronto:  -27,
    Yocto:  -24,
    Zepto:  -21,
    Atto:   -18,
    Femto:  -15,
    Pico:   -12,
    Nano:    -9,
    Micro:   -6,
    Milli:   -3,
    Centi:   -2,
    Deci:    -1,

    /** No prefix at all, which is what an absent prefix means. */
    None:     0,

    Deca:     1,
    Hecto:    2,
    Kilo:     3,
    Mega:     6,
    Giga:     9,
    Tera:    12,
    Peta:    15,
    Exa:     18,
    Zetta:   21,
    Yotta:   24,
    Ronna:   27,
    Quetta:  30,

} as const);


/** The name of an SI prefix, for example `Kilo`. */
export type SIPrefixName = keyof typeof SIPrefix;

/** The exponent of one of the 25 SI prefixes. */
export type SIPrefixExponent = (typeof SIPrefix)[SIPrefixName];


interface PrefixEntry {
    readonly exponent: SIPrefixExponent;
    readonly name:     SIPrefixName;
    readonly symbol:   string;
}

/**
 * The prefixes in ascending order of exponent, with the symbol each is written
 * with.
 *
 * The micro sign is U+00B5, which is the character keyboards and instruments
 * produce. The Greek small letter mu U+03BC denotes the same prefix and is
 * accepted on input; the two are not canonically equivalent, so normalisation
 * alone does not reconcile them the way it does for the ohm.
 */
const ENTRIES: readonly PrefixEntry[] = Object.freeze([
    { exponent: -30, name: 'Quecto', symbol: 'q'  },
    { exponent: -27, name: 'Ronto',  symbol: 'r'  },
    { exponent: -24, name: 'Yocto',  symbol: 'y'  },
    { exponent: -21, name: 'Zepto',  symbol: 'z'  },
    { exponent: -18, name: 'Atto',   symbol: 'a'  },
    { exponent: -15, name: 'Femto',  symbol: 'f'  },
    { exponent: -12, name: 'Pico',   symbol: 'p'  },
    { exponent:  -9, name: 'Nano',   symbol: 'n'  },
    { exponent:  -6, name: 'Micro',  symbol: '\u00B5' },  // MICRO SIGN
    { exponent:  -3, name: 'Milli',  symbol: 'm'  },
    { exponent:  -2, name: 'Centi',  symbol: 'c'  },
    { exponent:  -1, name: 'Deci',   symbol: 'd'  },
    { exponent:   0, name: 'None',   symbol: ''   },
    { exponent:   1, name: 'Deca',   symbol: 'da' },
    { exponent:   2, name: 'Hecto',  symbol: 'h'  },
    { exponent:   3, name: 'Kilo',   symbol: 'k'  },
    { exponent:   6, name: 'Mega',   symbol: 'M'  },
    { exponent:   9, name: 'Giga',   symbol: 'G'  },
    { exponent:  12, name: 'Tera',   symbol: 'T'  },
    { exponent:  15, name: 'Peta',   symbol: 'P'  },
    { exponent:  18, name: 'Exa',    symbol: 'E'  },
    { exponent:  21, name: 'Zetta',  symbol: 'Z'  },
    { exponent:  24, name: 'Yotta',  symbol: 'Y'  },
    { exponent:  27, name: 'Ronna',  symbol: 'R'  },
    { exponent:  30, name: 'Quetta', symbol: 'Q'  },
]);


/** The 25 valid prefix exponents, ascending. */
export const SI_PREFIX_EXPONENTS: readonly number[] =
    Object.freeze(ENTRIES.map(entry => entry.exponent));

const BY_EXPONENT = new Map<number, PrefixEntry>(ENTRIES.map(entry => [entry.exponent, entry]));

const BY_SYMBOL = new Map<string, PrefixEntry>(
    ENTRIES.filter(entry => entry.symbol !== '').map(entry => [entry.symbol, entry]),
);

/** The Greek small letter mu, accepted wherever the micro sign is. */
BY_SYMBOL.set('\u03BC', BY_EXPONENT.get(-6)!);


/**
 * Whether an exponent is one of the 25 the SI defines.
 *
 * 4 and -5 are not: a prefix names a specific power of ten, and there is no
 * prefix for ten thousand.
 */
export function isSIPrefix(exponent: number): exponent is SIPrefixExponent {
    return BY_EXPONENT.has(exponent);
}


/**
 * Checks that an exponent is a valid SI prefix.
 *
 * @throws {ValueError} if it is not.
 */
export function assertSIPrefix(exponent: number): asserts exponent is SIPrefixExponent {

    if (isSIPrefix(exponent))
        return;

    throw new ValueError('ERR_PREFIX_INVALID',
                         Number.isInteger(exponent)
                             ? `${String(exponent)} is not an SI prefix. A prefix names one of 25 specific powers of ten, and is not a general scaling factor.`
                             : `The SI prefix ${String(exponent)} is not an integer.`,
                         { clause: '3.3' });

}


/**
 * The symbol of a prefix, which is the empty string for no prefix.
 *
 * @throws {ValueError} if the exponent is not an SI prefix.
 */
export function prefixSymbol(exponent: number): string {
    assertSIPrefix(exponent);
    return (BY_EXPONENT.get(exponent)!).symbol;
}


/**
 * The name of a prefix, for example `Kilo`.
 *
 * @throws {ValueError} if the exponent is not an SI prefix.
 */
export function prefixName(exponent: number): SIPrefixName {
    assertSIPrefix(exponent);
    return (BY_EXPONENT.get(exponent)!).name;
}


/**
 * The exponent a prefix symbol stands for, or `undefined` where the symbol is
 * not a prefix.
 *
 * Case matters: `m` is milli and `M` is mega. Both spellings of micro resolve.
 */
export function prefixBySymbol(symbol: string): number | undefined {
    return BY_SYMBOL.get(symbol)?.exponent;
}
