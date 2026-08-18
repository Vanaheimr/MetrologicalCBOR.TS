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
 * Extracts the golden vectors of the worked example into
 * `tests/vectors/signed-example.ts`.
 *
 *   npm run fetch:spec && npm run extract:example
 *
 * The specification is fetched rather than committed, but these vectors are
 * committed: they are the reference a failing test is measured against, and a
 * test whose expectations are downloaded at run time proves nothing. Extracting
 * them mechanically rather than retyping them is the point — 713 bytes of
 * signed CBOR is not something to transcribe by hand.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }               from 'node:path';
import { fileURLToPath }               from 'node:url';

const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'spec', 'tag-44252-signed-example.md');
const TARGET = join(ROOT, 'tests', 'vectors', 'signed-example.ts');


function hexBlocks(document: string): Map<number, string> {

    const found = new Map<number, string>();

    // The language tag matters: the document also contains ```csharp blocks,
    // and a pattern that ignores them pairs the fences up wrongly.
    for (const match of document.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {

        const compact = (match[1] ?? '').replace(/\s+/g, '');

        if (/^[0-9A-F]+$/.test(compact) && compact.length >= 32)
            found.set(compact.length / 2, compact);

    }

    return found;

}


function wrap(hex: string): string {
    return (hex.match(/.{1,72}/g) ?? [])
               .map(line => `    '${line}' +`)
               .join('\n')
               .replace(/ \+$/, '');
}


function require_(blocks: Map<number, string>, bytes: number, what: string): string {

    const block = blocks.get(bytes);

    if (block === undefined) {
        console.error(`\n  ${SOURCE} has no ${String(bytes)}-byte block (${what}).`);
        console.error('  Has the worked example changed? Do not adjust the expected sizes without reading it.\n');
        process.exit(1);
    }

    return block;

}


const blocks = hexBlocks(readFileSync(SOURCE, 'utf8'));

console.log('Hexadecimal blocks in the worked example:');
for (const size of [...blocks.keys()].sort((a, b) => a - b))
    console.log(`  ${String(size).padStart(4)} bytes`);

const record   = require_(blocks, 713, 'the complete signed record');
const unsigned = require_(blocks, 134, 'one meter reading before signing');
const signed   = require_(blocks, 221, 'the same reading as a COSE_Sign1');

const output = `/*
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

// THIS FILE IS GENERATED. DO NOT EDIT.
//
//   source:    spec/tag-44252-signed-example.md
//   generator: scripts/extract-example.ts
//   command:   npm run fetch:spec && npm run extract:example

/**
 * The worked example of the specification: a charging transaction carried as
 * CBOR, with two meter readings signed by the meter, bundled by the charging
 * station and endorsed by the operator.
 *
 * These are golden vectors. If one of them fails, the code is wrong.
 *
 * Nothing here verifies a signature — the cryptography is out of scope for this
 * library. What these bytes exercise is that a real, signed, nested document
 * decodes, walks and re-encodes without losing a byte, and that the
 * metrological values inside it survive with their decimal scale intact.
 */

/** The complete record: the station's signed bundle with the operator's countersignature. */
export const SIGNED_RECORD_HEX =
${wrap(record)};

/** One meter reading as the meter measured it, before signing. */
export const METER_READING_HEX =
${wrap(unsigned)};

/** The same reading as a COSE_Sign1 message. */
export const SIGNED_READING_HEX =
${wrap(signed)};
`;

writeFileSync(TARGET, output, 'utf8');

console.log('\nWrote tests/vectors/signed-example.ts.');
