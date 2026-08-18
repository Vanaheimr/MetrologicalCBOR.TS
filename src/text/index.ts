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
 * The text format: `230 V`, `1.10 kWh`, `(230.00 +/- 0.12) V, k=2`.
 *
 * A second encoding of a reading rather than a rendering of one. Text written
 * here parses back to the same reading and therefore to the same CBOR bytes,
 * which is what lets a whole document be carried through JSON with every
 * measurement in it intact.
 *
 * The grammar is written out in `docs/text-format.md`.
 */

export {
    canFoldPrefix,
    formatMetrologicalValue,
    formatNumber,
    type FormatOptions,
} from './format.js';

export {
    parseMetrologicalValue,
    type ParseOptions,
} from './parse.js';

export {
    DIMENSIONLESS_UNIT_ID,
    EXTENSION_NAMES,
} from './grammar.js';

export {
    MIDDLE_DOT,
    MULTIPLICATION_SIGN,
    PLUS_MINUS,
    fromSuperscript,
    normalise,
    symbolCarriesPower,
    toSuperscript,
} from './symbols.js';
