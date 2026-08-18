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
 * Traversing and rewriting a decoded document.
 *
 * A metrological value is a leaf of somebody else's structure — the
 * specification is explicit that the kind of quantity, the instant of
 * measurement and the instrument belong to the map that carries it, not to the
 * tag. So the interesting operations on a document are "find every tag 44252
 * in here" and "replace each one with something else", which is what these two
 * functions are.
 */

import type { CborEntry, CborValue } from './types.js';


/** One step from a value to a value nested within it. */
export type CborPathSegment =

    /** The index of an element of an array. */
    | { readonly kind: 'index'; readonly index: number }

    /** The key of an entry of a map. */
    | { readonly kind: 'key';   readonly key: CborValue }

    /** The content of a tag. */
    | { readonly kind: 'tag';   readonly tag: bigint };


/** Where a value sits in the document it was found in. The root has an empty path. */
export type CborPath = readonly CborPathSegment[];


/**
 * Calls `visit` for every data item of a document, outermost first.
 *
 * Map keys are visited as well as map values: a key can be any data item, and a
 * document that tags its keys is unusual but well-formed.
 *
 * @example
 * ```ts
 * const readings: CborValue[] = [];
 * walk(document, value => {
 *     if (isTagged(value, METROLOGICAL_VALUE_TAG))
 *         readings.push(value);
 * });
 * ```
 */
export function walk(value: CborValue, visit: (value: CborValue, path: CborPath) => void): void {
    walkFrom(value, [], visit);
}


function walkFrom(value: CborValue, path: CborPath, visit: (value: CborValue, path: CborPath) => void): void {

    visit(value, path);

    switch (value.type) {

        case 'array':
            value.items.forEach((item, index) =>
                walkFrom(item, [...path, { kind: 'index', index }], visit));
            break;

        case 'map':
            for (const [key, entry] of value.entries) {
                walkFrom(key,   [...path, { kind: 'key', key }], visit);
                walkFrom(entry, [...path, { kind: 'key', key }], visit);
            }
            break;

        case 'tag':
            walkFrom(value.value, [...path, { kind: 'tag', tag: value.tag }], visit);
            break;

        case 'int':
        case 'bytes':
        case 'text':
        case 'bool':
        case 'null':
        case 'undefined':
        case 'simple':
        case 'float':
            break;

    }

}


/**
 * Rebuilds a document with every data item passed through `transform`,
 * innermost first.
 *
 * Children are transformed before their parent, so a transform that rewrites a
 * container sees the already-rewritten children. Returning the value unchanged
 * costs nothing: the original object is reused where nothing below it changed.
 */
export function transform(value: CborValue, rewrite: (value: CborValue) => CborValue): CborValue {

    switch (value.type) {

        case 'array': {

            const items: CborValue[] = [];
            let   changed = false;

            for (const item of value.items) {
                const next = transform(item, rewrite);
                if (next !== item)
                    changed = true;
                items.push(next);
            }

            return rewrite(changed ? { type: 'array', items } : value);

        }

        case 'map': {

            const entries: CborEntry[] = [];
            let   changed = false;

            for (const [key, entry] of value.entries) {
                const nextKey   = transform(key,   rewrite);
                const nextEntry = transform(entry, rewrite);
                if (nextKey !== key || nextEntry !== entry)
                    changed = true;
                entries.push([nextKey, nextEntry]);
            }

            return rewrite(changed ? { type: 'map', entries } : value);

        }

        case 'tag': {
            const inner = transform(value.value, rewrite);
            return rewrite(inner === value.value ? value : { type: 'tag', tag: value.tag, value: inner });
        }

        case 'int':
        case 'bytes':
        case 'text':
        case 'bool':
        case 'null':
        case 'undefined':
        case 'simple':
        case 'float':
            return rewrite(value);

    }

}
