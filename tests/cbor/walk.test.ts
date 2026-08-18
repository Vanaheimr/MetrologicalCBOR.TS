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
 * Traversing and rewriting a document.
 *
 * A metrological value is a leaf of somebody else's structure, so finding every
 * one of them in a document, and replacing them, are the two operations the
 * layers above this one need.
 */

import { describe, expect, it } from 'vitest';

import { METROLOGICAL_VALUE_TAG } from '../../src/tag.js';
import { diagnostic }             from '../../src/cbor/diagnostic.js';
import { transform, walk }        from '../../src/cbor/walk.js';
import type { CborPath, CborValue } from '../../src/cbor/index.js';
import {
    array, bool, bytes, float, int, map, nullValue, simple, tag, text, undefinedValue,
} from '../../src/cbor/types.js';


const document = map([
    [text('meter'),  text('1ISA0000000042')],
    [text('energy'), tag(METROLOGICAL_VALUE_TAG, array([int(1234567), int(2), int(3)]))],
    [text('limits'), array([
        tag(METROLOGICAL_VALUE_TAG, array([int(230), int(5)])),
        tag(METROLOGICAL_VALUE_TAG, array([int(32),  int(4)])),
    ])],
]);


describe('walk', () => {

    it('visits the root first', () => {

        const seen: CborValue[] = [];
        walk(document, value => seen.push(value));

        expect(seen[0]).toBe(document);

    });

    it('visits map keys as well as map values', () => {

        const texts: string[] = [];
        walk(document, value => {
            if (value.type === 'text')
                texts.push(value.value);
        });

        expect(texts).toStrictEqual([
            'meter', '1ISA0000000042',
            'energy',
            'limits',
        ]);

    });

    it('descends into a tag', () => {

        const found: string[] = [];
        walk(document, value => {
            if (value.type === 'tag')
                found.push(diagnostic(value.value));
        });

        expect(found).toStrictEqual([
            '[1234567, 2, 3]',
            '[230, 5]',
            '[32, 4]',
        ]);

    });

    it('reports where each value sits', () => {

        const paths = new Map<string, CborPath>();

        walk(document, (value, path) => {
            if (value.type === 'tag')
                paths.set(diagnostic(value.value), path);
        });

        const energy = paths.get('[1234567, 2, 3]');
        expect(energy).toHaveLength(1);
        expect(energy?.[0]).toStrictEqual({ kind: 'key', key: text('energy') });

        const secondLimit = paths.get('[32, 4]');
        expect(secondLimit).toHaveLength(2);
        expect(secondLimit?.[0]).toStrictEqual({ kind: 'key',   key: text('limits') });
        expect(secondLimit?.[1]).toStrictEqual({ kind: 'index', index: 1 });

    });

    it('records a step through a tag', () => {

        const paths: CborPath[] = [];
        walk(tag(4, array([int(-1), int(50)])), (value, path) => {
            if (value.type === 'array')
                paths.push(path);
        });

        expect(paths[0]).toStrictEqual([{ kind: 'tag', tag: 4n }]);

    });

    it('visits a leaf exactly once', () => {

        let count = 0;
        walk(int(1), () => { count++; });

        expect(count).toBe(1);

    });

    it('finds every metrological value in a document', () => {

        const found: CborValue[] = [];
        walk(document, value => {
            if (value.type === 'tag' && value.tag === BigInt(METROLOGICAL_VALUE_TAG))
                found.push(value);
        });

        expect(found).toHaveLength(3);

    });

});


describe('transform', () => {

    it('rewrites children before their parent', () => {

        const order: string[] = [];

        transform(array([int(1), array([int(2)])]), value => {
            order.push(diagnostic(value));
            return value;
        });

        expect(order).toStrictEqual(['1', '2', '[2]', '[1, [2]]']);

    });

    it('returns the original value where nothing below it changed', () => {

        // Rebuilding an unchanged subtree would defeat the point: a document
        // is walked far more often than it is rewritten.
        const result = transform(document, value => value);

        expect(result).toBe(document);

    });

    it('rebuilds only the branch that changed', () => {

        const result = transform(document, value =>
            value.type === 'int' && value.value === 1234567n ? int(9999999n) : value);

        expect(result).not.toBe(document);
        if (result.type !== 'map')
            throw new Error('unreachable');

        // The untouched entry is the same object, not a copy of one.
        expect(result.entries[0]?.[1]).toBe(document.entries[0]?.[1]);
        expect(result.entries[1]?.[1]).not.toBe(document.entries[1]?.[1]);

    });

    it('replaces every metrological value with something else', () => {

        // What a JSON conversion does: each tag 44252 becomes one string.
        const result = transform(document, value =>
            value.type === 'tag' && value.tag === BigInt(METROLOGICAL_VALUE_TAG)
                ? text('a reading')
                : value);

        expect(diagnostic(result)).toBe(
            '{"meter": "1ISA0000000042", "energy": "a reading", ' +
            '"limits": ["a reading", "a reading"]}',
        );

    });

    it('rewrites map keys too', () => {

        const result = transform(map([[text('a'), int(1)]]), value =>
            value.type === 'text' ? text(value.value.toUpperCase()) : value);

        expect(diagnostic(result)).toBe('{"A": 1}');

    });

    it('rewrites the content of a tag', () => {

        const result = transform(tag(4, int(1)), value =>
            value.type === 'int' ? int(2) : value);

        expect(diagnostic(result)).toBe('4(2)');

    });

    it.each([
        ['an integer',   int(1)],
        ['a byte string', bytes(new Uint8Array([1]))],
        ['text',         text('a')],
        ['a boolean',    bool(true)],
        ['null',         nullValue],
        ['undefined',    undefinedValue],
        ['a simple value', simple(200)],
        ['a float',      float(1.5)],
    ])('passes %s through untouched', (_what, value) => {
        expect(transform(value, item => item)).toBe(value);
    });

});
