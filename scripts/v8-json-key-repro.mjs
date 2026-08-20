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
 * `JSON.parse` returns a wrong object key, on Node 26.3.0.
 *
 *     node scripts/v8-json-key-repro.mjs
 *
 * Seconds to a couple of minutes, depending on the seed; it exits 1 and prints
 * the document it happened on. Roughly a third of seeds show it within three
 * million documents, so a clean run says "not this seed, not yet", never "not
 * this Node".
 *
 * This is what stood behind WP8's *"a property test failed twice with a
 * counterexample that was not one"*. It is deliberately plain JavaScript with
 * no imports: not TypeScript, not this library, not a test runner, not a
 * dependency. If it named the library, the first question a reader asked would
 * be whether the library is at fault — and answering that question is what the
 * original investigation spent two days on.
 *
 * **What goes wrong.** A key that had to be escaped comes back one character
 * short, keeping the backslash and losing what it escaped:
 *
 *     text written   {"x":null,"\"":{}}     the second key is a double quote
 *     keys read      ["x", "\\"]            the second key is a backslash
 *
 * Every occurrence seen so far fits one description: the key holds the *raw*
 * characters, cut to the length it would have had *unescaped* — so the two
 * characters `\"` yield `\`, and the three characters `*\"` yield `*\`. Only
 * the double quote shows it in these documents, because the only other escape
 * they contain is `\\`, where the raw first character happens to be the right
 * answer anyway.
 *
 * **What it takes.** Not a particular document: the same text parses correctly
 * ten million times in a fresh process. It needs a long-lived process that has
 * parsed a great many *freshly built* texts — a pool prepared in advance and
 * parsed in a loop does not do it, and neither does one text over and over.
 *
 * Given a seed it is **nearly** reproducible: the same seed usually fails at
 * the same document, and sometimes at another one. What decides is not the
 * document but the history — and everything that changes the history moves the
 * failure without removing it:
 *
 * | | seed 1 | seed 999 |
 * |---|---|---|
 * | as it comes | document 1 107 076 | document 303 372 |
 * | `--jitless` | document 2 142 688 | document 1 338 984 |
 * | `--max-semi-space-size=64` | document 2 142 688 | none in 3 000 000 |
 *
 * The second row is the one that matters: **the compilers are not the cause.**
 * With no just-in-time compilation at all, the fault is still there — later,
 * because everything is slower and the process reaches the same state further
 * along. That was the first suspicion and it is wrong, and it is wrong in the
 * way that costs the most: a short run under `--jitless` passes, and reads
 * exactly like a fix.
 *
 * Giving the young generation room enough that it collects far less often
 * moves the failure the same way — later on seed 1, out of reach on seed 999.
 * So the collector is somewhere in it, and a run that ends before the fault
 * arrives proves nothing at all.
 *
 * **What it means here.** For the library, nothing: no file in `src/` calls
 * `JSON.parse`. The JSON *text* reader in `src/json/text.ts` is this project's
 * own scanner, written because a double cannot carry a decimal — and immune to
 * this for free. What the fault reaches is one property in
 * `tests/json/roundtrip.test.ts`, which sends a document through the platform's
 * `JSON.stringify` and `JSON.parse` on purpose, because a caller holding a JSON
 * tree will do exactly that.
 *
 * `MCBOR_REPRO_SEED` and `MCBOR_REPRO_RUNS` change where it looks and for how
 * long. It exits 1 on a hit, so it can be used as a check.
 */

const SEED = Number.parseInt(process.env['MCBOR_REPRO_SEED'] ?? '', 10) || 1;
const RUNS = Number.parseInt(process.env['MCBOR_REPRO_RUNS'] ?? '', 10) || 5_000_000;

// mulberry32: small, seeded, and no dependency.
let state = SEED >>> 0;
const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (bound) => Math.floor(next() * bound);

// Printable ASCII, which is what the property's own generator produces — and
// what puts a double quote or a backslash in a key every so often.
const ALPHABET = [];
for (let code = 0x20; code <= 0x7E; code++)
    ALPHABET.push(String.fromCharCode(code));

const word = (longest) => {
    let out = '';
    const length = 1 + pick(longest);
    for (let index = 0; index < length; index++)
        out += ALPHABET[pick(ALPHABET.length)];
    return out;
};

const value = (depth) => {
    const kind = pick(depth > 2 ? 4 : 7);
    return kind === 0 ? false
         : kind === 1 ? null
         : kind === 2 ? pick(1e9)
         : kind === 3 ? word(12)
         : kind === 4 ? []
         : kind === 5 ? object(depth + 1)
         :              [value(depth + 1)];
};

const object = (depth) => {
    const out   = {};
    const count = pick(6);
    for (let index = 0; index < count; index++)
        out[word(8)] = value(depth);
    return out;
};

console.log(`seed ${SEED}, up to ${RUNS} documents, node ${process.version}`);

for (let run = 0; run < RUNS; run++) {

    const written = object(0);
    const text    = JSON.stringify(written);
    const read    = JSON.parse(text);

    const before = Object.keys(written);
    const after  = Object.keys(read);

    let same = before.length === after.length;
    for (let index = 0; same && index < before.length; index++)
        same = before[index] === after[index];

    if (!same) {
        console.log('');
        console.log(`JSON.parse returned different keys, at document ${run}:`);
        console.log(`  text written : ${text}`);
        console.log(`  keys written : ${JSON.stringify(before)}`);
        console.log(`  keys read    : ${JSON.stringify(after)}`);
        console.log('');
        console.log('That text is correct JSON. Reading it in a fresh process gives the right');
        console.log('keys back, which is why the document is not the cause, and why shrinking');
        console.log('towards it is wasted effort.');
        process.exit(1);
    }

}

console.log(`no divergence in ${RUNS} documents`);
