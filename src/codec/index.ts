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
 * The codec for CBOR tag 44252: the layer that joins the CBOR core to the
 * domain model.
 *
 * The functions are free rather than methods on {@link MetrologicalValue},
 * which keeps the model free of any knowledge of how it is encoded — the same
 * separation that lets the model be used where the wire format is not.
 */

export {
    decodeMetrologicalValue,
    metrologicalValueFromCbor,
    type DecodeValueOptions,
} from './decode.js';

export {
    encodeMetrologicalValue,
    metrologicalValueToCbor,
    type EncodeValueOptions,
} from './encode.js';
