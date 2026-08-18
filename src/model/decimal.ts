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
 * Exact decimal numbers.
 *
 * A reading of `1.10 kWh` carries more information than `1.1 kWh`: the trailing
 * zero states the resolution of the measurement. So the decimal scale is part
 * of the datum, not a formatting choice, and `5.0` and `5` are different
 * readings of the same quantity.
 *
 * That rules out binary floating point twice over — a double can represent
 * neither `0.1` exactly nor a decimal scale at all — so every number here is a
 * `bigint` mantissa with an integer exponent, and every conversion to and from
 * text is string arithmetic. No value in this module ever passes through a
 * `number` that holds a magnitude.
 *
 * @see The specification, Section 3.1
 */

import { ValueError } from '../errors.js';


/** A reading written as a plain CBOR integer: major type 0 or 1. */
export interface IntegerNumber {
    readonly kind:  'int';
    readonly value: bigint;
}

/**
 * A reading written as a decimal fraction: CBOR tag 4, `mantissa * 10^exponent`.
 *
 * The exponent is kept as it was written. `{mantissa: 50, exponent: -1}` is
 * `5.0` and states a resolution of a tenth; `{mantissa: 5, exponent: 0}` is
 * `5` written the long way. Both are distinct from {@link IntegerNumber} `5`
 * on the wire, and this library keeps them distinct in memory too.
 */
export interface DecimalFraction {
    readonly kind:     'decimal';
    readonly mantissa: bigint;
    readonly exponent: number;
}

/** A reading: an integer or a decimal fraction, and never a float. */
export type DecimalNumber = IntegerNumber | DecimalFraction;


/**
 * The widest decimal exponent this implementation will reconstruct.
 *
 * Specification Section 7 requires a bound: a decimal fraction may claim an
 * exponent that would need more memory than exists, and discovering that by
 * running out is not a decoding strategy. 10 000 is far beyond any instrument
 * and far below any harm.
 */
export const MAX_DECIMAL_EXPONENT = 10_000;

/** The most decimal digits a mantissa may have, for the same reason. */
export const MAX_MANTISSA_DIGITS = 1_000;


// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * A reading written as a plain integer.
 *
 * Encoders should prefer this for integral readings (Section 3.1).
 */
export function integer(value: bigint | number): IntegerNumber {

    const exact = typeof value === 'bigint' ? value : BigInt(value);

    checkMantissa(exact);

    return { kind: 'int', value: exact };

}


/**
 * A reading written as a decimal fraction, `mantissa * 10^exponent`.
 *
 * @throws {ValueError} if the exponent or the mantissa is beyond the bounds
 *         this implementation reconstructs.
 */
export function decimal(mantissa: bigint | number, exponent: number): DecimalFraction {

    const exact = typeof mantissa === 'bigint' ? mantissa : BigInt(mantissa);

    checkMantissa(exact);

    if (!Number.isInteger(exponent))
        throw new ValueError('ERR_VALUE_EXPONENT_RANGE',
                             `The decimal exponent ${String(exponent)} is not an integer.`,
                             { clause: '3.1' });

    if (absolute(exponent) > MAX_DECIMAL_EXPONENT)
        throw new ValueError('ERR_VALUE_EXPONENT_RANGE',
                             `The decimal exponent ${String(exponent)} is beyond the supported range of +/-${String(MAX_DECIMAL_EXPONENT)}.`,
                             { clause: '7' });

    return { kind: 'decimal', mantissa: exact, exponent };

}


function checkMantissa(mantissa: bigint): void {

    const digits = (mantissa < 0n ? -mantissa : mantissa).toString().length;

    if (digits > MAX_MANTISSA_DIGITS)
        throw new ValueError('ERR_VALUE_MANTISSA_RANGE',
                             `A mantissa of ${String(digits)} digits is beyond the supported ${String(MAX_MANTISSA_DIGITS)}.`,
                             { clause: '7' });

}


function absolute(value: number): number {
    return value < 0 ? -value : value;
}


// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

/** The mantissa, which for an integer is the integer itself. */
export function mantissaOf(value: DecimalNumber): bigint {
    return value.kind === 'int' ? value.value : value.mantissa;
}

/** The exponent, which for an integer is zero. */
export function exponentOf(value: DecimalNumber): number {
    return value.kind === 'int' ? 0 : value.exponent;
}

/**
 * The number of decimal places the reading states, which is what its
 * resolution is.
 *
 * `5.0` has a scale of 1, `5` a scale of 0, and `5e2` a scale of -2: the last
 * states a resolution of a hundred.
 */
export function scaleOf(value: DecimalNumber): number {
    const exponent = exponentOf(value);
    // Guarded, because negating a zero exponent would yield -0, which compares
    // equal to 0 under === but not under Object.is, and so leaks into tests
    // and into anything keying on the scale.
    return exponent === 0 ? 0 : -exponent;
}

/** Whether the reading is zero, whatever its scale. */
export function isZero(value: DecimalNumber): boolean {
    return mantissaOf(value) === 0n;
}

/** Whether the reading is below zero. */
export function isNegative(value: DecimalNumber): boolean {
    return mantissaOf(value) < 0n;
}

/** The reading with its sign flipped, keeping its scale. */
export function negate(value: DecimalNumber): DecimalNumber {
    return value.kind === 'int'
               ? { kind: 'int', value: -value.value }
               : { kind: 'decimal', mantissa: -value.mantissa, exponent: value.exponent };
}

/** The magnitude of the reading, keeping its scale. */
export function absoluteValue(value: DecimalNumber): DecimalNumber {
    return isNegative(value) ? negate(value) : value;
}


// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * The reading as an exact decimal string.
 *
 * The scale survives: `{mantissa: 110, exponent: -2}` formats as `1.10`, not
 * as `1.1`. A positive exponent is written out in full — `{mantissa: 5,
 * exponent: 2}` is `500` — which is exact but does not by itself say that the
 * resolution was a hundred; the text format of the library carries that
 * distinction separately.
 */
export function formatDecimal(value: DecimalNumber): string {

    const exponent = exponentOf(value);
    const mantissa = mantissaOf(value);
    const sign     = mantissa < 0n ? '-' : '';
    const digits   = (mantissa < 0n ? -mantissa : mantissa).toString();

    if (exponent === 0)
        return sign + digits;

    if (exponent > 0)
        return sign + digits + '0'.repeat(exponent);

    const places  = -exponent;
    const padded  = digits.padStart(places + 1, '0');
    const cut     = padded.length - places;

    return `${sign}${padded.slice(0, cut)}.${padded.slice(cut)}`;

}


/**
 * Reads an exact decimal string.
 *
 * Trailing zeros are kept, because they are the statement of resolution:
 * `'5.0'` becomes a decimal fraction of scale 1 and `'5'` a plain integer.
 * Scientific notation is accepted for readings whose scale is extreme —
 * `'4.5e-9'` is a mantissa of 45 at an exponent of -10 — and produces a
 * decimal fraction even where the digits alone would have been integral.
 *
 * @throws {ValueError} if the text is not a decimal number.
 */
export function parseDecimal(text: string): DecimalNumber {

    const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());

    if (match === null)
        throw new ValueError('ERR_VALUE_SYNTAX',
                             `${JSON.stringify(text)} is not a decimal number.`,
                             { clause: '3.1' });

    const [, sign, whole = '', fraction, exponentText] = match;

    const digits   = whole + (fraction ?? '');
    const mantissa = BigInt(digits) * (sign === '-' ? -1n : 1n);

    const stated   = exponentText === undefined ? 0 : Number.parseInt(exponentText, 10);
    const exponent = stated - (fraction?.length ?? 0);

    // Only a written decimal point or exponent makes it a decimal fraction; a
    // run of digits on its own is the plain integer the specification prefers.
    return fraction === undefined && exponentText === undefined
               ? integer(mantissa)
               : decimal(mantissa, exponent);

}


// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Whether two readings are written identically: same form, same mantissa, same
 * exponent.
 *
 * `5` and `5.0` are *not* identical under this comparison, and neither are
 * `5` and `5e0`, because they state different resolutions. Use
 * {@link compareDecimal} to compare the quantities they denote.
 */
export function equalsExact(left: DecimalNumber, right: DecimalNumber): boolean {

    return left.kind === right.kind &&
           mantissaOf(left) === mantissaOf(right) &&
           exponentOf(left) === exponentOf(right);

}


/**
 * Compares the quantities two readings denote, exactly.
 *
 * `-1`, `0` or `1`, in the usual sense. `5` and `5.0` compare equal here: they
 * are the same quantity stated at different resolutions.
 *
 * The comparison aligns mantissa and exponent rather than converting to a
 * common scale, which is what specification Section 6 recommends — converting
 * can overflow, and this cannot.
 */
export function compareDecimal(left: DecimalNumber, right: DecimalNumber): -1 | 0 | 1 {

    const leftMantissa  = mantissaOf(left);
    const rightMantissa = mantissaOf(right);

    // Different signs settle it without any arithmetic at all.
    const leftSign  = leftMantissa  === 0n ? 0 : (leftMantissa  < 0n ? -1 : 1);
    const rightSign = rightMantissa === 0n ? 0 : (rightMantissa < 0n ? -1 : 1);

    if (leftSign !== rightSign)
        return leftSign < rightSign ? -1 : 1;

    if (leftSign === 0)
        return 0;

    const leftExponent  = exponentOf(left);
    const rightExponent = exponentOf(right);

    if (leftExponent === rightExponent)
        return leftMantissa === rightMantissa ? 0 : (leftMantissa < rightMantissa ? -1 : 1);

    // Scale the one with the larger exponent up, so both share the smaller.
    // The exponents are bounded, so the shift is bounded with them.
    const shift  = BigInt(absolute(leftExponent - rightExponent));
    const scaled = 10n ** shift;

    const a = leftExponent > rightExponent ? leftMantissa * scaled : leftMantissa;
    const b = rightExponent > leftExponent ? rightMantissa * scaled : rightMantissa;

    return a === b ? 0 : (a < b ? -1 : 1);

}


// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * How to resolve a digit that a division cannot represent at the requested
 * scale.
 *
 * There is no default: a caller dividing an uncertainty by its coverage factor
 * is making a metrological decision, and the library will not make it quietly.
 */
export type RoundingMode =

    /** Toward the nearest, and to the even digit on a tie. The GUM's usual choice. */
    | 'half-even'

    /** Toward the nearest, and away from zero on a tie. */
    | 'half-up'

    /** Toward zero. */
    | 'truncate';


export interface DivideOptions {

    /** The number of decimal places the result is to state. */
    readonly scale: number;

    /** How to resolve what does not fit at that scale. */
    readonly rounding: RoundingMode;

}


/**
 * Divides one reading by another, at a scale the caller states.
 *
 * The scale is required rather than inferred because most quotients have no
 * exact decimal form, and silently choosing a precision for a measurement
 * result would be the library asserting something the measurement does not
 * say. Deriving a standard uncertainty from an expanded one is exactly this
 * situation: `u = U / k`.
 *
 * @throws {ValueError} on division by zero, or on a scale outside the
 *         supported exponent range.
 */
export function divideDecimal(dividend:  DecimalNumber,
                              divisor:   DecimalNumber,
                              options:   DivideOptions): DecimalFraction
{

    const divisorMantissa = mantissaOf(divisor);

    if (divisorMantissa === 0n)
        throw new ValueError('ERR_VALUE_INEXACT', 'Division by zero.', { clause: '3.4' });

    if (!Number.isInteger(options.scale) || absolute(options.scale) > MAX_DECIMAL_EXPONENT)
        throw new ValueError('ERR_VALUE_EXPONENT_RANGE',
                             `A scale of ${String(options.scale)} is beyond the supported range.`,
                             { clause: '7' });

    const shift = exponentOf(dividend) - exponentOf(divisor) + options.scale;

    const numerator   = shift >= 0 ? mantissaOf(dividend) * 10n ** BigInt(shift) : mantissaOf(dividend);
    const denominator = shift >= 0 ? divisorMantissa : divisorMantissa * 10n ** BigInt(-shift);

    return decimal(divideRounded(numerator, denominator, options.rounding), -options.scale);

}


function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {

    const negative = (numerator < 0n) !== (denominator < 0n);
    const n        = numerator   < 0n ? -numerator   : numerator;
    const d        = denominator < 0n ? -denominator : denominator;

    const quotient  = n / d;
    const remainder = n % d;

    let magnitude = quotient;

    if (remainder !== 0n && mode !== 'truncate') {

        const twice = remainder * 2n;

        if (twice > d)
            magnitude = quotient + 1n;
        else if (twice === d)
            magnitude = mode === 'half-up' || quotient % 2n !== 0n ? quotient + 1n : quotient;

    }

    return negative ? -magnitude : magnitude;

}
