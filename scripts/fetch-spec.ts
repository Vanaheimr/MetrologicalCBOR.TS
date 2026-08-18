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
 * Fetches the specification into `spec/`.
 *
 *   npm run fetch:spec
 *
 * The specification is maintained in its own repository and is not committed
 * here, so `spec/` is git-ignored and a fresh checkout does not have it.
 * `tests/registry/specification.test.ts` compares the unit registry against the
 * document entry by entry where it is present, and skips where it is not — so
 * running this first is what turns that suite from skipped into enforced.
 *
 * The specification is the authority. This script never writes to the registry;
 * where the two disagree, the test fails and a human decides which one is wrong.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import { fileURLToPath }            from 'node:url';

const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'spec');

const BASE = 'https://raw.githubusercontent.com/OpenChargingTechnology/Whitepapers/master/MetrologicalCBOR';

const DOCUMENTS = [
    'README.md',
    'IANA-registration.md',
    'tag-44252-signed-example.md',
] as const;

async function main(): Promise<number> {

    mkdirSync(TARGET, { recursive: true });

    console.log(`Fetching the specification from\n  ${BASE}\n`);

    for (const document of DOCUMENTS) {

        const url = `${BASE}/${document}`;

        let response: Response;
        try {
            response = await fetch(url);
        }
        catch (error) {
            console.error(`  ${document}: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        }

        if (!response.ok) {
            console.error(`  ${document}: HTTP ${String(response.status)} ${response.statusText}`);
            return 1;
        }

        const text = await response.text();

        if (!text.startsWith('#')) {
            console.error(`  ${document}: does not look like the expected Markdown document`);
            return 1;
        }

        // Written with the line endings of the source, so that the working copy
        // is byte-identical to the document the registry is compared against.
        writeFileSync(join(TARGET, document), text, 'utf8');

        console.log(`  ${document.padEnd(30)} ${String(text.length).padStart(6)} characters`);

    }

    console.log('\nWrote spec/. Run: npm run test');
    return 0;

}

process.exit(await main());
