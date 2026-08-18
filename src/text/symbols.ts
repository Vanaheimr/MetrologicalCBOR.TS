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
 * The characters the text format is written with.
 *
 * Every one of them is spelled as an escape rather than as a literal. A unit
 * symbol that is silently altered by a file encoding is a wrong measurement,
 * not a typo, and the two spellings of micro differ by one bit of a
 * compatibility mapping that no normalisation reconciles.
 */

/** MIDDLE DOT: what separates the factors of a product of powers. */
export const MIDDLE_DOT = '\u00B7';

/** MULTIPLICATION SIGN: introduces a prefix that could not be folded into a symbol. */
export const MULTIPLICATION_SIGN = '\u00D7';

/** PLUS-MINUS SIGN: introduces the measurement uncertainty. */
export const PLUS_MINUS = '\u00B1';

/** GREEK SMALL LETTER NU: how the degrees of freedom are conventionally named. */
export const GREEK_SMALL_NU = '\u03BD';

/** SUPERSCRIPT MINUS. */
export const SUPERSCRIPT_MINUS = '\u207B';

/** The superscript digits, indexed by the digit they stand for. */
export const SUPERSCRIPT_DIGITS = [
    '\u2070', '\u00B9', '\u00B2', '\u00B3', '\u2074',
    '\u2075', '\u2076', '\u2077', '\u2078', '\u2079',
] as const;

const SUPERSCRIPT_VALUES = new Map<string, string>([
    ...SUPERSCRIPT_DIGITS.map((character, digit) => [character, String(digit)] as const),
    [SUPERSCRIPT_MINUS, '-'],
    ['\u207A', '+'],
]);

/** Every character that may appear in a superscript exponent. */
export const SUPERSCRIPT_CHARACTERS = [...SUPERSCRIPT_VALUES.keys()].join('');


/**
 * An integer written in superscript digits, as `m*s^-2` is.
 */
export function toSuperscript(value: number): string {

    const digits = (value < 0 ? -value : value).toString();

    let out = value < 0 ? SUPERSCRIPT_MINUS : '';

    for (const digit of digits)
        out += SUPERSCRIPT_DIGITS[Number.parseInt(digit, 10)] ?? digit;

    return out;

}


/**
 * The ordinary digits of a superscript, or `undefined` where the text is not
 * one.
 */
export function fromSuperscript(text: string): string | undefined {

    if (text.length === 0)
        return undefined;

    let out = '';

    for (const character of text) {

        const digit = SUPERSCRIPT_VALUES.get(character);

        if (digit === undefined)
            return undefined;

        out += digit;

    }

    return out;

}


/**
 * Whether a unit symbol already carries a power of its own, as the square metre does.
 *
 * It matters for where a prefix may go. A prefix binds to the symbol and the
 * combination is then raised to any power, so `km^2` is a square kilometre:
 * a million square metres, not a thousand. A prefix on such a symbol therefore
 * has to be written as a factor of ten instead of being folded in.
 *
 * Detected from the symbol rather than listed, so that a unit added to the
 * registry later is handled without anyone remembering to.
 */
export function symbolCarriesPower(symbol: string): boolean {

    const last = symbol.slice(-1);

    return last !== '' && SUPERSCRIPT_VALUES.has(last);

}


/**
 * Unicode Normalization Form C, applied to everything read as text.
 *
 * This is what reconciles U+2126 OHM SIGN with the registered U+03A9: the two
 * are canonically equivalent, so normalisation alone settles them. It does
 * *not* reconcile the micro sign U+00B5 with the Greek small letter mu U+03BC,
 * which differ by a compatibility mapping; the prefix table accepts both
 * explicitly instead.
 */
export function normalise(text: string): string {
    return text.normalize('NFC');
}
