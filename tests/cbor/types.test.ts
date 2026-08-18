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
 * The constructors and guards a consumer walks a document with.
 *
 * Nothing inside this library uses them — it has the types — which is exactly
 * why they need testing: they are public API whose only user is somebody else,
 * and an untested export at an API freeze is a promise nobody has read.
 */

import { describe, expect, it }  from 'vitest';

import { decodeHex }             from '../../src/cbor/index.js';
import { METROLOGICAL_VALUE_TAG } from '../../src/tag.js';
import {
    isArray, isBytes, isFloat, isInt, isMap, isTag, isTagged, isText,
} from '../../src/cbor/types.js';
import type { CborValue }        from '../../src/cbor/types.js';


const SAMPLES: Record<string, CborValue> = {
    int:   { type: 'int',   value: 5n },
    bytes: { type: 'bytes', value: Uint8Array.from([1, 2]) },
    text:  { type: 'text',  value: 'V' },
    array: { type: 'array', items: [] },
    map:   { type: 'map',   entries: [] },
    tag:   { type: 'tag',   tag: 4n, value: { type: 'int', value: 5n } },
    float: { type: 'float', value: 1.5, width: 8 },
    bool:  { type: 'bool',  value: true },
};


describe('the guards', () => {

    it.each<[string, (value: CborValue) => boolean]>([
        ['int',   isInt],
        ['bytes', isBytes],
        ['text',  isText],
        ['array', isArray],
        ['map',   isMap],
        ['tag',   isTag],
        ['float', isFloat],
    ])('recognises a %s and nothing else', (kind, guard) => {

        for (const [name, sample] of Object.entries(SAMPLES))
            expect(guard(sample)).toBe(name === kind);

    });

});


describe('isTagged', () => {

    it('takes the tag number either way it is written', () => {

        // A tag number is a bigint on the wire and a number in every constant
        // a caller has, so both have to work or the guard is unusable.
        const reading = decodeHex('D9ACDC820504');

        expect(isTagged(reading, METROLOGICAL_VALUE_TAG)).toBe(true);
        expect(isTagged(reading, BigInt(METROLOGICAL_VALUE_TAG))).toBe(true);

    });

    it('says no to another tag, and to what is not a tag at all', () => {

        const reading = decodeHex('D9ACDC820504');

        expect(isTagged(reading, 4)).toBe(false);
        expect(isTagged(SAMPLES['int']!, METROLOGICAL_VALUE_TAG)).toBe(false);
        expect(isTagged(SAMPLES['tag']!, 4)).toBe(true);

    });

});
