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
 * `JSON.parse` returns the wrong object key. Two lines, deterministic, and
 * nothing of this library in it:
 *
 *     JSON.parse('{"h":[],"\\\\":0}');                  // poison
 *     Object.keys(JSON.parse('{"h":1,"\\"":2}'))[1];    // '"' comes back as '\'
 *
 *     node scripts/v8-json-key-repro.mjs
 *
 * V8 caches the property keys of an object against the keys of the object it
 * parsed before. A key ending in an escaped backslash poisons that cache, and
 * the next object with the same preceding key gets the poisoned key back in
 * place of its own — whatever its own key was, as long as it also ends in an
 * escape.
 *
 * This is **already reported**, and it is a V8 bug rather than a Node one:
 *
 * - nodejs/node#63785 — open, labelled `v8 engine`, first reported 2026-06-07
 *   on Node 24.16.0
 * - <https://issues.chromium.org/issues/521080746> — the V8 issue it was
 *   forwarded to on 2026-06-08
 * - nodejs/node#64546 — an independent second sighting, closed as a duplicate
 *
 * We are the third sighting, and the measurements below were added to #63785:
 * that **only** a key ending in `\\` poisons, that every trailing escape is
 * vulnerable, that the escape must be the *last* thing in the key, and that a
 * value is never affected — only a key.
 *
 * **What it means here: nothing.** No file in `src/` calls `JSON.parse`. The
 * JSON *text* reader in `src/json/text.ts` is this project's own scanner,
 * written because a double cannot carry a decimal — and immune to this for
 * free. What the fault reaches is one property in
 * `tests/json/roundtrip.test.ts`, which sends a document through the platform's
 * `JSON.stringify` and `JSON.parse` on purpose, because a caller holding a JSON
 * tree will do exactly that.
 *
 * **How it was found, which is the part worth remembering.** Not like this. It
 * arrived as a property that failed twice under load, with a shrunk
 * counterexample that passed on replay — because the failing document was never
 * the cause, only the document unlucky enough to follow a poisoning one. Two
 * million further executions found nothing, and it was written down as
 * unexplained. See WORKPLAN.md, WP8, for what it took to get from there to
 * these two lines.
 */

const escapes = [
    ['\\\\',     '\\'],
    ['\\"',      '"' ],
    ['\\n',      '\n'],
    ['\\t',      '\t'],
    ['\\/',      '/' ],
    ['\\u0041',  'A' ],
];

let nth = 0;

/** Parses an object whose second key is `key`, and returns that key back. */
const read = (first, key) => Object.keys(JSON.parse(`{"${first}":1,"${key}":2}`))[1];

/** Parses an object with the same first key, to leave `key` in the cache. */
const poison = (first, key) => JSON.parse(`{"${first}":[],"${key}":0}`);

console.log(`node ${process.version}  v8 ${process.versions.v8}  ${process.platform}/${process.arch}`);

let wrong = 0;

console.log('\nwhich trailing escape poisons which');
console.log('canary ->' + escapes.map(([source]) => source.padStart(9)).join(''));

for (const [poisonSource, poisonKey] of escapes) {

    const row = escapes.map(([canarySource, canaryKey]) => {

        // A first key of its own per cell, so no cell can disturb another.
        const first = 'k' + String(nth++);
        poison(first, poisonSource);
        const got = read(first, canarySource);

        if (got !== canaryKey) wrong++;

        return (got === canaryKey ? 'ok' : got === poisonKey ? 'POISON' : 'other').padStart(9);

    });

    console.log(`poison ${poisonSource.padStart(7)}  ${row.join('')}`);

}

console.log('\nwhere the escape sits in the key');

for (const key of ['\\"', 'xxxxxxxxxx\\"', '\\"x', 'ab\\"cd']) {

    const first = 'p' + String(nth++);
    poison(first, key.replace('\\"', '\\\\'));

    const got  = read(first, key);
    const want = key.replace('\\"', '"');

    console.log(`  key source "${key}"${' '.repeat(14 - key.length)} ${got === want ? 'correct' : 'SUBSTITUTED'}`);

}

console.log('\nthe same escape in a value rather than a key');

for (const first of ['v1', 'v2']) {
    poison(first, '\\\\');
    const value = JSON.parse(`{"${first}":1,"k":"\\""}`).k;
    console.log(`  ${JSON.stringify(value).padEnd(18)} ${value === '"' ? 'correct' : 'SUBSTITUTED'}`);
}

console.log(wrong === 0
                ? '\nThis Node reads every key back correctly.'
                : `\nThis Node loses ${String(wrong)} of ${String(escapes.length ** 2)} keys. See nodejs/node#63785.`);

process.exitCode = wrong === 0 ? 0 : 1;
