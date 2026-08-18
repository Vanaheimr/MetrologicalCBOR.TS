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
 * Tidies what the bundler leaves behind.
 *
 * tsup writes the `sourceMappingURL` comment twice — once itself and once
 * through esbuild — so every bundle ends with the same line repeated. Nothing
 * breaks: a browser and every tool that reads source maps take the last one,
 * and the two are identical. It is still wrong in an artifact that goes to a
 * registry and stays there, and a reader who notices it learns something false
 * about how carefully the thing was assembled.
 *
 * `tests/bundle.test.ts` asserts the result, so this cannot quietly stop
 * working.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve }            from 'node:path';
import { fileURLToPath }               from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** `//# sourceMappingURL=…` at the very end, however many times it appears. */
const TRAILING_MAP_COMMENTS = /(?:\s*\/\/# sourceMappingURL=[^\n]*)+\s*$/;

for (const file of ['index.js', 'index.cjs']) {

    const path   = resolve(dist, file);
    const source = readFileSync(path, 'utf8');
    const match  = TRAILING_MAP_COMMENTS.exec(source);

    if (match === null) {
        console.log(`${file}: no source map comment`);
        continue;
    }

    const comments = match[0].trim().split(/\s*\n\s*/);
    const kept     = comments.at(-1) ?? '';
    const tidied   = `${source.slice(0, match.index)}\n${kept}\n`;

    if (tidied === source) {
        console.log(`${file}: one source map comment`);
        continue;
    }

    writeFileSync(path, tidied, 'utf8');
    console.log(`${file}: ${String(comments.length)} source map comments, kept one`);

}
