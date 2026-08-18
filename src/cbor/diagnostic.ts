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
 * Diagnostic notation (RFC 8949, Section 8).
 *
 * The notation the specification writes its examples in, so that
 * `44252([4([-1, 50]), 4, -3])` in a test failure means the same thing as
 * `44252([4([-1, 50]), 4, -3])` in the document. It is a debugging and
 * documentation aid, not a wire format: nothing parses it back.
 */

import { bytesToHex }     from './hex.js';
import type { CborValue } from './types.js';


/**
 * The diagnostic notation of a value.
 *
 * @example
 * ```ts
 * diagnostic(decodeHex('D9ACDC83C482201832 04 22'));
 * // '44252([4([-1, 50]), 4, -3])'
 * ```
 */
export function diagnostic(value: CborValue): string {

    switch (value.type) {

        case 'int':
            return value.value.toString();

        case 'bytes':
            return `h'${bytesToHex(value.value).toLowerCase()}'`;

        case 'text':
            return JSON.stringify(value.value);

        case 'array':
            return `[${value.items.map(diagnostic).join(', ')}]`;

        case 'map':
            return `{${value.entries.map(([key, entry]) => `${diagnostic(key)}: ${diagnostic(entry)}`).join(', ')}}`;

        case 'tag':
            return `${value.tag.toString()}(${diagnostic(value.value)})`;

        case 'bool':
            return value.value ? 'true' : 'false';

        case 'null':
            return 'null';

        case 'undefined':
            return 'undefined';

        case 'simple':
            return `simple(${value.value.toString()})`;

        case 'float':
            return diagnosticFloat(value.value);

    }

}


function diagnosticFloat(value: number): string {

    if (Number.isNaN(value))
        return 'NaN';

    if (value === Infinity)
        return 'Infinity';

    if (value === -Infinity)
        return '-Infinity';

    // A float must remain distinguishable from an integer, so a whole number
    // keeps a decimal point: 1.0 is a float, 1 is not.
    if (Number.isInteger(value) && Object.is(value, -0) === false && !value.toString().includes('e'))
        return `${value.toString()}.0`;

    if (Object.is(value, -0))
        return '-0.0';

    return value.toString();

}
