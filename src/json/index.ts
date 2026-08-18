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
 * Whole documents between CBOR and JSON.
 *
 * Every metrological value becomes one string, and everything else takes the
 * JSON form it ordinarily would. The reading is what JSON cannot express, so
 * it gets the text format; a timestamp or an identification is a string in
 * JSON anyway.
 *
 * Two pairs of entry points, one contract. `mcborToJsonText` and
 * `jsonTextToMcbor` work on JSON **text** and are exact: numbers keep the
 * digits they were written with, in both directions, which is what
 * metrological-text.md Section 3 requires. `mcborToJson` and `jsonToMcbor`
 * work on the native JSON tree, whose numbers are doubles — convenient
 * wherever the document is already a tree, and lossy in exactly the ways the
 * options spell out. None of them rounds a number quietly.
 *
 * **What round-trips through the text pair.** Readings, text, integers of
 * any size, exact decimals, booleans, nulls, arrays and text-keyed maps come
 * back byte-identical. Byte strings, floats and dates are stated one-way
 * conversions — JSON has no room for the distinction that made them what
 * they were.
 */

export {
    mcborToJson,
    type ToJsonOptions,
} from './to-json.js';

export {
    jsonToCbor,
    jsonToMcbor,
    type FromJsonOptions,
    type ReadingDetection,
} from './from-json.js';

export {
    jsonTextToCbor,
    jsonTextToMcbor,
    mcborToJsonText,
} from './text.js';

export {
    fromBase64Url,
    toBase64Url,
    toJsonPointer,
    type JsonPath,
    type JsonValue,
} from './types.js';
