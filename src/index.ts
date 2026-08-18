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
 * Metrological CBOR (mCBOR) — the reference implementation of CBOR tag 44252.
 *
 * A metrological value is a quantity value together with its unit of measure,
 * its SI prefix and its measurement uncertainty, encoded so that the exact
 * decimal representation the instrument displayed survives the wire.
 *
 * @packageDocumentation
 */

export { METROLOGICAL_VALUE_TAG } from './tag.js';

export {
    CborError,
    McborError,
    UnitError,
    ValueError,
    type McborErrorCode,
    type McborErrorOptions,
} from './errors.js';

export * from './model/index.js';

export * from './codec/index.js';

export * as cbor from './cbor/index.js';

export {
    decode,
    decodeFirst,
    decodeHex,
    encode,
    encodeToHex,
    bytesToHex,
    hexToBytes,
    diagnostic,
    transform,
    walk,
    DEFAULT_LIMITS,
    type CborPath,
    type CborValue,
    type DecodeLimits,
    type DecodeOptions,
    type DecodeResult,
    type EncodeOptions,
} from './cbor/index.js';

export { UnitRegistry } from './registry/index.js';

export type {
    PrivateUnitDefinition,
    UnitDefinition,
} from './registry/types.js';

export {
    REGISTRY_SPECIFICATION,
    STANDARD_UNITS,
    UNIT_ID_MAX,
    UNIT_ID_MIN,
    UNIT_ID_PRIVATE_USE_MIN,
    UNIT_ID_RESERVED,
    UNIT_ID_SPECIFICATION_MAX,
    Units,
    type StandardUnitId,
    type UnitConstantName,
} from './registry/units.generated.js';
