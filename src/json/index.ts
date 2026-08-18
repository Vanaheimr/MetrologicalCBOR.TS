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
 * **What round-trips.** A document made of readings, text, integers within
 * ±(2^53 − 1), booleans, nulls, arrays and text-keyed maps comes back
 * byte-identical. Everything else is either an error or a stated one-way
 * conversion — byte strings, floats, dates and big integers all lose the
 * distinction that made them what they were, because JSON has no room for it.
 * The options say which, and none of them rounds a number quietly.
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
    fromBase64Url,
    toBase64Url,
    toJsonPointer,
    type JsonPath,
    type JsonValue,
} from './types.js';
