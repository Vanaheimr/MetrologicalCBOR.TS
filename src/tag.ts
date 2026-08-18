/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/OpenChargingCloud/MetrologicalCBOR.TS>
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
 * The CBOR tag number of a metrological value: a quantity value with its unit
 * of measure, SI prefix and GUM measurement uncertainty.
 *
 * 44252 (`0xACDC`) lies in the First Come First Served range of the IANA
 * registry "Concise Binary Object Representation (CBOR) Tags"
 * ({@link https://www.rfc-editor.org/rfc/rfc8949 | RFC 8949}, Section 9.2).
 *
 * This constant is the only place in the code base where the number appears.
 * Should IANA report 44252 as taken before the registration is recorded,
 * changing this line, the specification and the golden vectors is the whole
 * of the change.
 *
 * @see {@link https://github.com/OpenChargingCloud/MetrologicalCBOR.TS/blob/master/spec/README.md | The specification}, Section 8
 */
export const METROLOGICAL_VALUE_TAG = 44252;
