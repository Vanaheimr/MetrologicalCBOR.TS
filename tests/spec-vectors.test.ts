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
 * The specification's own test vectors, executed against this library.
 *
 * The specification carries a machine-readable conformance annex
 * (`test-vectors/` next to it): golden encodings, must-reject inputs,
 * canonical text renderings and the exact JSON conversion. This suite runs
 * every **normative** entry; entries the specification deliberately leaves
 * open are classed `survey` there and are not judged here — the
 * cross-implementation conformance suite observes those.
 *
 * The annex is fetched with the specification (`npm run fetch:spec`) and, like
 * the other specification-bound suites, this one skips where it is absent.
 * The vectors are loaded outside the `describe`, returning nothing where the
 * annex is missing, because `it.each` needs its cases at collection time —
 * see `tests/codec/section5-vectors.test.ts` for the release that taught us.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import { fileURLToPath }            from 'node:url';
import { describe, expect, it }     from 'vitest';

import { bytesToHex, hexToBytes }   from '../src/cbor/hex.js';
import { decodeMetrologicalValue, encodeMetrologicalValue } from '../src/codec/index.js';
import { jsonTextToMcbor, mcborToJsonText } from '../src/json/text.js';
import { formatMetrologicalValue, parseMetrologicalValue } from '../src/text/index.js';
import { codeOf }                   from './support/errors.js';

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANNEX = join(ROOT, 'spec', 'test-vectors');

const PRESENT = existsSync(join(ANNEX, 'values.json'));


interface ParseText {
    readonly text:    string;
    readonly hex?:    string;
    readonly expect:  'accept' | 'reject' | 'survey';
}

interface ValuesCase {
    readonly id:                  string;
    readonly hex:                 string;
    readonly canonicalHex?:       string;
    readonly canonicalHexClass?:  'normative' | 'survey';
    readonly text?:               string;
    readonly textClass?:          'normative' | 'survey';
    readonly parseTexts?:         readonly ParseText[];
}

interface InvalidCase {
    readonly id:      string;
    readonly reason:  string;
    readonly hex?:    string;
    readonly text?:   string;
    readonly expect?: 'reject' | 'survey';
}

interface DocumentCase {
    readonly id:                 string;
    readonly cborHex:            string;
    readonly json?:              string;
    readonly jsonClass?:         'normative' | 'survey';
    readonly expectToJsonError?: boolean;
    readonly roundtrip?:         boolean | 'survey';
    readonly roundtripHex?:      string;
}

interface JsonToCborCase {
    readonly id:       string;
    readonly json:     string;
    readonly cborHex?: string;
    readonly class?:   'normative' | 'survey';
}

function suite<T>(name: string): readonly T[] {

    if (!PRESENT)
        return [];

    const document = JSON.parse(readFileSync(join(ANNEX, `${name}.json`), 'utf8')) as { cases: T[] };

    return document.cases;

}

const VALUES       = suite<ValuesCase>('values');
const INVALID      = suite<InvalidCase>('values-invalid');
const DOCUMENTS    = suite<DocumentCase>('documents');
const JSON_TO_CBOR = suite<JsonToCborCase>('json-to-cbor');


describe.skipIf(!PRESENT)('the test vectors of the specification', () => {

    describe('values', () => {

        it.each(VALUES.map(each => [each.id, each] as const))('%s', (_, testCase) => {

            const canonical = testCase.canonicalHex ?? testCase.hex;

            // The decoder accepts the vector...
            const decoded = decodeMetrologicalValue(hexToBytes(testCase.hex));

            // ...re-encodes it canonically...
            if (testCase.canonicalHexClass !== 'survey')
                expect(bytesToHex(encodeMetrologicalValue(decoded))).toBe(canonical);

            // ...and its text form is a second encoding of it.
            if (testCase.text !== undefined && testCase.textClass !== 'survey') {
                expect(formatMetrologicalValue(decoded)).toBe(testCase.text);
                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(testCase.text)))).toBe(canonical);
            }

            for (const entry of testCase.parseTexts ?? []) {

                if (entry.expect === 'survey')
                    continue;

                if (entry.expect === 'reject') {
                    expect(codeOf(() => parseMetrologicalValue(entry.text)), entry.text).not.toBe('no throw');
                    continue;
                }

                expect(bytesToHex(encodeMetrologicalValue(parseMetrologicalValue(entry.text))), entry.text)
                    .toBe(entry.hex ?? canonical);

            }

        });

    });


    describe('values-invalid', () => {

        it.each(INVALID.filter(each => each.expect !== 'survey')
                       .map(each => [each.id, each] as const))('rejects %s', (_, testCase) => {

            if (testCase.hex !== undefined)
                expect(codeOf(() => decodeMetrologicalValue(hexToBytes(testCase.hex ?? ''))), testCase.reason)
                    .not.toBe('no throw');

            if (testCase.text !== undefined)
                expect(codeOf(() => parseMetrologicalValue(testCase.text ?? '')), testCase.reason)
                    .not.toBe('no throw');

        });

    });


    describe('documents', () => {

        it.each(DOCUMENTS.map(each => [each.id, each] as const))('%s', (_, testCase) => {

            if (testCase.expectToJsonError === true) {
                expect(codeOf(() => mcborToJsonText(hexToBytes(testCase.cborHex)))).not.toBe('no throw');
                return;
            }

            const json = mcborToJsonText(hexToBytes(testCase.cborHex));

            if (testCase.json !== undefined && testCase.jsonClass !== 'survey')
                expect(json).toBe(testCase.json);

            if (testCase.roundtripHex !== undefined)
                expect(bytesToHex(jsonTextToMcbor(json))).toBe(testCase.roundtripHex);

            else if (testCase.roundtrip === true)
                expect(bytesToHex(jsonTextToMcbor(json))).toBe(testCase.cborHex);

        });

    });


    describe('json-to-cbor', () => {

        it.each(JSON_TO_CBOR.filter(each => each.cborHex !== undefined && each.class !== 'survey')
                            .map(each => [each.id, each] as const))('%s', (_, testCase) => {

            expect(bytesToHex(jsonTextToMcbor(testCase.json))).toBe(testCase.cborHex ?? '');

        });

    });

});
