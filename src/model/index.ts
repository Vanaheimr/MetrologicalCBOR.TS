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
 * The domain model: what a metrological value is, independently of how it is
 * encoded.
 *
 * Nothing in here touches a binary floating-point number, and a linter rule
 * keeps it that way.
 */

export {
    MAX_DECIMAL_EXPONENT,
    MAX_MANTISSA_DIGITS,
    absoluteValue,
    compareDecimal,
    decimal,
    divideDecimal,
    equalsExact,
    exponentOf,
    formatDecimal,
    integer,
    isNegative,
    isZero,
    mantissaOf,
    negate,
    parseDecimal,
    scaleOf,
    type DecimalFraction,
    type DecimalNumber,
    type DivideOptions,
    type IntegerNumber,
    type RoundingMode,
} from './decimal.js';

export {
    SIPrefix,
    SI_PREFIX_EXPONENTS,
    assertSIPrefix,
    isSIPrefix,
    prefixBySymbol,
    prefixName,
    prefixSymbol,
    type SIPrefixExponent,
    type SIPrefixName,
} from './prefix.js';

export {
    EXPONENT_ONE,
    factor,
    formatExponent,
    isAffine,
    isNamedUnit,
    isUnitProduct,
    namedUnit,
    sameExponent,
    sameUnitQuantity,
    sameUnitRepresentation,
    unitById,
    unitBySymbol,
    unitExponent,
    unitProduct,
    type IntegerExponent,
    type NamedUnit,
    type RationalExponent,
    type UnitExponent,
    type UnitFactor,
    type UnitProduct,
    type UnitRef,
    type UnitSpelling,
} from './unit.js';

export {
    DISTRIBUTION_IDS,
    distributionById,
    effectiveCoverageFactor,
    sameUncertaintyRepresentation,
    standardUncertainty,
    uncertainty,
    type Uncertainty,
    type UncertaintyDistribution,
    type UncertaintyForm,
    type UncertaintyOptions,
} from './uncertainty.js';

export {
    MetrologicalValue,
    compareQuantity,
    metrologicalValue,
    sameNumericValue,
    sameQuantity,
    type MetrologicalValueChanges,
    type MetrologicalValueOptions,
} from './value.js';
