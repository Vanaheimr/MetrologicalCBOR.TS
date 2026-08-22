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
 * The built bundle, in a browser.
 *
 * "Runs in a browser" is usually a claim rather than a test, and a library
 * acquires a Node dependency the way it acquires a float: one convenient call
 * at a time, in a file nobody re-reads. Rather than start a headless browser to
 * find that out, this runs the bundle in a V8 context that has *no* Node
 * globals at all — no `process`, no `require`, no `Buffer`, no `__dirname` —
 * and only the globals a browser actually provides.
 *
 * That is a stricter environment than a browser, not a looser one: anything
 * that passes here would pass there, and the usual failure mode (a `Buffer`
 * that happened to be in scope) cannot hide.
 *
 * The bundle has to be built first, so these tests skip where `dist/` is
 * absent rather than fail, in the same way the specification comparison does.
 * `npm run verify` builds it — but not every job runs `verify`, and the
 * nightly coverage job does not, so the skip has to hold on its own rather
 * than because a build happened to run first.
 */

import { execSync }                 from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { existsSync, readFileSync }    from 'node:fs';
import { dirname, resolve }            from 'node:path';
import { fileURLToPath }               from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';


const root   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(root, 'dist', 'index.cjs');
const built  = existsSync(bundle);


/**
 * The library, loaded into a context holding only what a browser guarantees.
 *
 * The CommonJS build is used because loading it needs one `module` object and
 * no loader; the ESM build is the same code from the same source, and the pack
 * smoke test exercises that one.
 */
function inABrowser(): Record<string, unknown> {

    const sandbox: Record<string, unknown> = {
        // What a browser has, and this library may use.
        TextEncoder,
        TextDecoder,
        Uint8Array,
        DataView,
        ArrayBuffer,
        BigInt,
        Math,
        JSON,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Error,
        TypeError,
        RangeError,
        Map,
        Set,
        Symbol,
        Reflect,
        Proxy,
        RegExp,
        Function,
        Promise,
        Intl,
        // Filled in below: a sandbox has to be able to refer to itself.
        globalThis: undefined,

        // What it is being loaded as.
        module:  { exports: {} },
        exports: {},
    };

    sandbox['globalThis'] = sandbox;

    const context = createContext(sandbox);

    runInContext(readFileSync(bundle, 'utf8'), context, { filename: 'index.cjs' });

    // The bundle assigns to `exports`; a CommonJS module may instead replace
    // `module.exports` wholesale, so both are consulted rather than assumed.
    return {
        ...(sandbox['exports'] as Record<string, unknown>),
        ...((sandbox['module'] as { exports: Record<string, unknown> }).exports),
    };

}


describe.runIf(built)('the bundle, with no Node global in sight', () => {

    // `runIf` decides which tests run, not whether this factory executes:
    // Vitest calls it while collecting, skipped or not. Loading the bundle
    // here would therefore read `dist/` even where the guard says there is
    // nothing to read, which turns a suite that meant to skip into one that
    // fails to collect. `beforeAll` is the part a skipped suite does not run.
    let library: Record<string, unknown>;

    beforeAll(() => { library = inABrowser(); });

    it('loads at all', () => {

        // If the bundle reaches for `process`, `require` or `Buffer` at load
        // time, this is where it throws — and the message names what it wanted.
        expect(typeof library['decodeMetrologicalValue']).toBe('function');
        expect(library['METROLOGICAL_VALUE_TAG']).toBe(44252);

    });

    it('decodes and re-encodes a reading', () => {

        const decode = library['decodeMetrologicalValue'] as (bytes: Uint8Array) => unknown;
        const encode = library['encodeMetrologicalValue'] as (value: unknown) => Uint8Array;
        const toHex  = library['bytesToHex'] as (bytes: Uint8Array) => string;
        const toBytes = library['hexToBytes'] as (hex: string) => Uint8Array;

        const reading = decode(toBytes('D9ACDC83C4822018320422'));

        expect(toHex(encode(reading))).toBe('D9ACDC83C4822018320422');

    });

    it('renders and parses the text form, Unicode and all', () => {

        const format = library['formatMetrologicalValue'] as (value: unknown) => string;
        const parse  = library['parseMetrologicalValue'] as (text: string) => unknown;

        expect(format(parse('9.81 m·s⁻²'))).toBe('9.81 m·s^-2');
        expect(format(parse('(230.00 ±0.12) V, k=2'))).toBe('(230.00 ±0.12) V, k=2');

    });

    it('converts a document to JSON and back', () => {

        const toJson   = library['mcborToJson'] as (bytes: Uint8Array) => unknown;
        const fromJson = library['jsonToMcbor'] as (json: unknown, options?: unknown) => Uint8Array;
        const toHex    = library['bytesToHex'] as (bytes: Uint8Array) => string;

        const document = { meter: '1ISA0000000042', energy: '1.10 kWh' };

        // `readings: 'auto'` because the round trip is what is being tested,
        // and the conversion is something a caller asks for - the default
        // guesses nothing, in the bundle exactly as under Node.
        const asSpecified = { readings: 'auto' };

        // Compared as JSON rather than by identity of shape: the object came
        // back from the sandbox and carries *its* Object.prototype, which
        // `toStrictEqual` would call a difference and a consumer never would.
        expect(JSON.stringify(toJson(fromJson(document, asSpecified)))).toBe(JSON.stringify(document));
        expect(toHex(fromJson(document, asSpecified))).toContain('D9ACDC');
        expect(toHex(fromJson(document))).not.toContain('D9ACDC');

    });

    it('throws the same typed errors it throws under Node', () => {

        const decode = library['decodeMetrologicalValue'] as (bytes: Uint8Array) => unknown;
        const toBytes = library['hexToBytes'] as (hex: string) => Uint8Array;

        // The error class comes from inside the sandbox, so `instanceof`
        // against the outer one would be false for reasons that have nothing
        // to do with the library. The code is what is stable across releases,
        // and it is what a browser consumer would check.
        try {
            decode(toBytes('D9ACDC82FB3FF199999999999A04'));
            expect.unreachable('a float reading must be refused');
        }
        catch (error) {
            expect((error as { code?: string }).code).toBe('ERR_VALUE_FLOAT');
            expect((error as { clause?: string }).clause).toBe('3.1');
        }

    });

    it('holds a mantissa no double could, which is the whole point', () => {

        const parse  = library['parseMetrologicalValue'] as (text: string) => { formatValue(): string };

        // 20 significant digits. A double has 15 or 16, so a browser build that
        // had quietly acquired a float somewhere would round this.
        expect(parse('12345678901234567890 Wh').formatValue()).toBe('12345678901234567890');
        expect(parse('0.00000000000000000001 Wh').formatValue()).toBe('0.00000000000000000001');

    });

});


describe.runIf(built)('what the bundle does not reach for', () => {

    // In `beforeAll` for the reason above.
    let source: string;

    beforeAll(() => { source = readFileSync(bundle, 'utf8'); });

    it.each([
        // Not `\brequire\s*\(`: `#` is a non-word character, so a word boundary
        // holds inside `this.#require(2)` — a private method of the reader —
        // and the check would report a dependency the bundle does not have.
        ['require(',      /(?<![.#\w$])require\s*\(/],
        ['process.',      /(?<![.#\w$])process\s*\./],
        ['Buffer',        /(?<![.#\w$])Buffer\b/],
        ['__dirname',     /\b__dirname\b/],
        ['node: imports', /["']node:/],
    ])('contains no %s', (_what, pattern) => {

        // A source-level check beside the run-time one, because a Node API
        // reached for on a branch this test does not take would pass the
        // sandbox and still break a browser.
        expect(pattern.test(source)).toBe(false);

    });

    it('carries exactly one source map comment', () => {

        // tsup writes it twice, once itself and once through esbuild.
        // `scripts/finish-build.ts` removes the duplicate; this is what stops
        // that from quietly ceasing to work.
        expect(source.match(/\/\/# sourceMappingURL=/g)?.length).toBe(1);
        expect(readFileSync(resolve(root, 'dist', 'index.js'), 'utf8')
                   .match(/\/\/# sourceMappingURL=/g)?.length).toBe(1);

    });

});


describe.runIf(built)('what would be published', () => {

    interface PackedFile { readonly path: string }
    interface PackReport { readonly files: readonly PackedFile[]; readonly unpackedSize: number }

    let report: PackReport;
    let paths:  string[];

    // In `beforeAll` for the reason above, which matters twice here: a suite
    // that means to skip should not be spawning `npm pack` either.
    //
    // One command string through the shell rather than a program and an
    // argument list: npm is a `.cmd` shim on Windows, which Node will not spawn
    // directly, and passing separate arguments alongside `shell: true` is the
    // combination that earns a deprecation warning. Nothing here is interpolated.
    beforeAll(() => {

        report = (JSON.parse(
            execSync('npm pack --dry-run --json',
                     { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
        ) as PackReport[])[0]!;

        paths = report.files.map(file => file.path.replace(/\\/g, '/'));

    });

    it('is the build, the types, the licence and the documents that are documents', () => {

        expect(paths).toContain('dist/index.js');
        expect(paths).toContain('dist/index.cjs');
        expect(paths).toContain('dist/index.d.ts');
        expect(paths).toContain('LICENSE');
        expect(paths).toContain('NOTICE');
        expect(paths).toContain('docs/conformance.md');
        expect(paths).toContain('docs/text-format.md');

    });

    it('is not the generated API reference', () => {

        // `docs/api` is two megabytes of generated HTML that belongs on a
        // website. Shipping `docs` wholesale put 272 files in the tarball and
        // tripled it; `docs/*.md` is what the manifest says instead.
        expect(paths.filter(path => path.endsWith('.html'))).toStrictEqual([]);
        expect(paths.filter(path => path.startsWith('docs/api'))).toStrictEqual([]);

    });

    it('is not the tests, the examples or the working files', () => {

        for (const unwanted of ['tests/', 'examples/', 'scripts/', 'spec/', '.github/', 'src/'])
            expect(paths.filter(path => path.startsWith(unwanted))).toStrictEqual([]);

    });

    it('stays within a size a consumer would not notice', () => {

        // Source maps are the bulk of it and they stay: a library that reads
        // legally relevant measurement data should be debuggable where it is
        // installed. The budget is a tripwire for something unintended getting
        // in, not a target.
        expect(report.unpackedSize).toBeLessThan(2_000_000);
        expect(paths.length).toBeLessThan(120);

    });

});
