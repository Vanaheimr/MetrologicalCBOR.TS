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
 * What the two halves of the text format share.
 *
 * The grammar itself is written out in `docs/text-format.md`; this holds the
 * few constants the renderer and the parser must agree on, so that they cannot
 * drift apart in the way a format and its parser usually do.
 */

/**
 * The identification of the dimensionless unit "one".
 *
 * A dimensionless reading is written as a bare number, so this is the unit the
 * parser reaches for where no symbol follows the number, and the one the
 * renderer leaves unwritten. A reading without a unit is not the same thing as
 * a reading whose unit is one — in this format they are spelled the same way,
 * and the format only ever carries the latter.
 */
export const DIMENSIONLESS_UNIT_ID = 1;

/** The names the extensions of an uncertainty are written with. */
export const EXTENSION_NAMES = Object.freeze({
    coverageFactor:      'k',
    coverageProbability: 'p',
    distribution:        'dist',
    degreesOfFreedom:    'nu',
} as const);
