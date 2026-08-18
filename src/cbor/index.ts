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
 * A minimal, deterministic CBOR implementation (RFC 8949).
 *
 * Enough of the format to carry tag 44252 and to walk the documents that
 * contain it, and no more. It is written rather than depended upon because
 * this library is used where the supply chain is audited, where the exact
 * bytes are the signed artefact, and where a decimal fraction with a bignum
 * mantissa must survive without ever touching a float.
 */

export {
    decode,
    decodeFirst,
    decodeHex,
    type DecodeOptions,
    type DecodeResult,
} from './reader.js';

export {
    encode,
    encodeToHex,
    fromHalfBits,
    shortestFloatWidth,
    toHalfBits,
    type EncodeOptions,
} from './writer.js';

export {
    DEFAULT_LIMITS,
    resolveLimits,
    type DecodeLimits,
} from './limits.js';

export {
    bytesToHex,
    compareBytes,
    hexToBytes,
} from './hex.js';

export { diagnostic } from './diagnostic.js';

export {
    transform,
    walk,
    type CborPath,
    type CborPathSegment,
} from './walk.js';

export {
    array,
    bool,
    bytes,
    float,
    int,
    isArray,
    isBytes,
    isFloat,
    isInt,
    isMap,
    isTag,
    isTagged,
    isText,
    map,
    nullValue,
    simple,
    tag,
    text,
    undefinedValue,
    type CborArray,
    type CborBool,
    type CborBytes,
    type CborEntry,
    type CborFloat,
    type CborInt,
    type CborMap,
    type CborNull,
    type CborSimple,
    type CborTag,
    type CborText,
    type CborUndefined,
    type CborValue,
} from './types.js';
