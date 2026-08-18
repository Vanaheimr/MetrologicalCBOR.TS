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
 * The conformance matrix against the code it describes.
 *
 * A document that claims where every requirement went is worth exactly as much
 * as its accuracy, and prose does not fail a build when the code moves under
 * it. `docs/conformance.md` is the argument that this library implements the
 * specification; this is what stops that argument from quietly going stale, the
 * same way `registry/specification.test.ts` stops the registry from drifting
 * away from the document it was transcribed from.
 *
 * Three things are checked, in ascending order of usefulness: that every path
 * the document points at exists, that every error code it names is real, and
 * that every error code that is real is named. The last one is the one that
 * bites: adding a code without saying which clause it enforces fails here.
 */

import { readFileSync }          from 'node:fs';
import { existsSync }            from 'node:fs';
import { dirname, resolve }      from 'node:path';
import { fileURLToPath }         from 'node:url';

import { describe, expect, it }  from 'vitest';


const here     = dirname(fileURLToPath(import.meta.url));
const root     = resolve(here, '..');
const docsDir  = resolve(root, 'docs');
const document = readFileSync(resolve(docsDir, 'conformance.md'), 'utf8');


/** Every relative link target, with any `#L…` anchor kept separately. */
function links(): { target: string; line: number | undefined; raw: string }[] {

    const out: { target: string; line: number | undefined; raw: string }[] = [];

    for (const match of document.matchAll(/\]\((\.\.?\/[^)#\s]+)(?:#L(\d+))?\)/g)) {

        const target = match[1];
        const anchor = match[2];

        if (target === undefined)
            continue;

        out.push({
            target,
            line: anchor === undefined ? undefined : Number.parseInt(anchor, 10),
            raw:  match[0],
        });

    }

    return out;

}


/** The error codes the document names. */
function documentedCodes(): Set<string> {
    return new Set([...document.matchAll(/`(ERR_[A-Z_]+)`/g)].map(match => match[1]!));
}


/** The error codes `src/errors.ts` declares. */
function declaredCodes(): Set<string> {

    const source = readFileSync(resolve(root, 'src', 'errors.ts'), 'utf8');
    const union  = /export type McborErrorCode =([\s\S]*?);\n/.exec(source);

    expect(union).not.toBeNull();

    return new Set([...union![1]!.matchAll(/'(ERR_[A-Z_]+)'/g)].map(match => match[1]!));

}


describe('every path the matrix points at', () => {

    it('exists', () => {

        const missing = links()
            .filter(link => !existsSync(resolve(docsDir, link.target)))
            .map(link => link.raw);

        expect(missing).toStrictEqual([]);

    });

    it('has the line the anchor names', () => {

        // A line reference that has slid past the end of its file is the first
        // visible sign that the matrix and the code have parted company.
        const past = links()
            .filter(link => link.line !== undefined)
            .filter(link => {
                const path = resolve(docsDir, link.target);
                if (!existsSync(path))
                    return false;
                return readFileSync(path, 'utf8').split('\n').length < link.line!;
            })
            .map(link => link.raw);

        expect(past).toStrictEqual([]);

    });

    it('points at least at the sources, the tests and the specification links it promises', () => {

        // A shape check, so that an accidentally emptied document fails loudly
        // rather than passing every other assertion here vacuously.
        const targets = links().map(link => link.target);

        expect(targets.filter(each => each.startsWith('../src/')).length).toBeGreaterThan(20);
        expect(targets).toContain('../src/errors.ts');
        expect(targets).toContain('../src/invariant.ts');
        expect(targets).toContain('../WORKPLAN.md');

    });

});


describe('every error code', () => {

    it('that the matrix names is one the library has', () => {

        const declared = declaredCodes();
        const invented = [...documentedCodes()].filter(code => !declared.has(code));

        expect(invented).toStrictEqual([]);

    });

    it('that the library has is named by the matrix', () => {

        // The assertion that does the work. A new normative check comes with a
        // new code, and a new code has to say which clause it enforces or
        // where else it comes from — which is the whole point of the document.
        const documented = documentedCodes();
        const unexplained = [...declaredCodes()].filter(code => !documented.has(code));

        expect(unexplained).toStrictEqual([]);

    });

    it('appears in an appendix table as well as in prose', () => {

        // Appendix A is the entry point for a reader holding a code, so it has
        // to be complete on its own rather than only in aggregate with the
        // clause tables above it.
        const appendix = document.slice(document.indexOf('## Appendix A'));

        expect(appendix.length).toBeGreaterThan(1000);

        const listed = new Set([...appendix.matchAll(/^\| `(ERR_[A-Z_]+)`/gm)].map(match => match[1]!));
        const absent = [...declaredCodes()].filter(code => !listed.has(code));

        expect(absent).toStrictEqual([]);

    });

});


describe('the coverage the matrix reports', () => {

    it('names the branches it admits are uncovered, with a reason each', () => {

        // The document claims 100 % on codec/ and text/ and three unreachable
        // branches elsewhere. Whether the claim is *true* is measured by the
        // coverage run; what is checked here is that it is still made in the
        // specific, falsifiable form — a file and a line for each exception —
        // rather than softened into a sentence nobody can check.
        const section = document.slice(document.indexOf('## 11. Coverage'));

        expect(section).toMatch(/src\/codec\//);
        expect(section).toMatch(/src\/text\//);

        const named = [...section.matchAll(/\[(\w+\.ts):(\d+)\]/g)];

        expect(named.length).toBeGreaterThanOrEqual(3);

        for (const [, file, line] of named) {

            const path = resolve(root, 'src', 'cbor', file!);
            const alt  = resolve(root, 'src', 'model', file!);
            const real = existsSync(path) ? path : alt;

            expect(existsSync(real), `${file!} named in the coverage section`).toBe(true);
            expect(readFileSync(real, 'utf8').split('\n').length).toBeGreaterThanOrEqual(Number.parseInt(line!, 10));

        }

    });

});
