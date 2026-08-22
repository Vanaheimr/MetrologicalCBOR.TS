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
 * The examples, run.
 *
 * Documentation that is not executed rots, and an example that has rotted is
 * worse than none: a reader trusts it, and it is the first thing they meet.
 * Each of these is run as a program and its output checked for the claims the
 * example and `examples/README.md` make about it — so an API change that
 * invalidates an example fails here rather than in somebody's editor.
 */

import { execFileSync }        from 'node:child_process';
import { existsSync }          from 'node:fs';
import { dirname, resolve }    from 'node:path';
import { fileURLToPath }       from 'node:url';

import { describe, expect, it } from 'vitest';


const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');


function run(example: string): string {
    return execFileSync(process.execPath,
                        [resolve(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
                         resolve(root, 'examples', example)],
                        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}


describe('01 — a reading', () => {

    const output = run('01-a-reading.ts');

    it('reads the nine bytes back as 5.0 mA, scale and all', () => {
        expect(output).toContain('5.0 mA');
        expect(output).toContain('scale kept        true');
        expect(output).toContain('bytes reproduced  true');
    });

    it('writes 1.10 kWh deterministically', () => {
        expect(output).toContain('D9ACDC83C48221186E0203');
        expect(output).toContain('deterministic     true');
    });

    it('shows what is refused, with the code', () => {
        expect(output).toContain('ERR_VALUE_FLOAT');
        expect(output).toContain('ERR_UNIT_UNKNOWN');
        expect(output).toContain('ERR_PREFIX_INVALID');
        expect(output).toContain('ERR_UNCERTAINTY_NEGATIVE');
    });

});


describe('02 — a document through JSON', () => {

    const output = run('02-a-document-through-json.ts');

    it('converts the worked example to the object the README shows', () => {
        expect(output).toContain('"meter": "1ISA0000000042"');
        expect(output).toContain('"time": "2026-08-15T08:14:00Z"');
        expect(output).toContain('(1234.567 ±12.3) kWh, k=2, p=0.95, dist=normal');
    });

    it('brings every member back, with the measurement exact', () => {
        expect(output).toContain('members survive   true');
        expect(output).toContain('energy exact      true');
    });

    it('refuses the integer JSON cannot hold, and offers the digits', () => {
        expect(output).toContain('ERR_JSON_PRECISION');
        expect(output).toContain('9223372036854775807');
    });

    it('shows all three ways of deciding which strings are readings', () => {
        expect(output).toContain('auto              A1646E6F7465D9ACDC820112');
        expect(output).toContain('none (default)    A1646E6F746563312068');
        expect(output).toContain('"note": "1 h", "energy": 44252([4([-2, 110]), 2, 3])');
    });

});


describe('03 — an uncertainty', () => {

    const output = run('03-an-uncertainty.ts');

    it('keeps the certificate\'s statement rather than normalising it', () => {
        expect(output).toContain('(230.00 ±0.12) V, k=2');
        expect(output).toContain('magnitude U       0.12');
        expect(output).toContain('coverage factor k 2');
    });

    it('derives u = U/k only at a scale the caller states', () => {
        expect(output).toContain('u = U/k at 3 dp   0.060');
        expect(output).toContain('u = U/k at 5 dp   0.06000');
    });

    it('keeps "not stated" apart from "zero"', () => {
        expect(output).toContain('undefined — not stated');
        expect(output).toContain('D9ACDC8218E605 vs D9ACDC8418E6050000');
    });

});


describe('04 — a foreign document', () => {

    const output = run('04-a-foreign-document.ts');

    it('re-encodes 713 bytes it did not write, exactly', () => {
        expect(output).toContain('713 bytes');
        expect(output).toContain('re-encoded exact  true');
    });

    it('finds both readings, inside the signed payloads', () => {
        expect(output).toContain('readings/0 ▸ #18/2 ▸ energy');
        expect(output).toContain('(1234.567 ±12.3) kWh');
        expect(output).toContain('(1259.869 ±12.6) kWh');
    });

});


describe('05 — a private unit', () => {

    const output = run('05-a-private-unit.ts');

    it('resolves aliases and the OHM SIGN', () => {
        expect(output).toContain('U+2126 normalises onto U+03A9');
    });

    it('reads a unit only the extended registry knows', () => {
        expect(output).toContain('without registry  ERR_UNIT_UNKNOWN');
        expect(output).toContain('with registry     5 flurbo');
        expect(output).toContain('standard is intact true');
    });

    it('refuses every way a registration can collide', () => {
        expect(output).toContain('ERR_UNIT_ID_NOT_PRIVATE_USE');
        expect(output.match(/ERR_REGISTRY_CONFLICT/g)?.length).toBe(3);
    });

});


describe('06 — verifying a signed record', () => {

    const available = existsSync(resolve(root, 'examples', 'node_modules', '@noble', 'curves'));
    const output    = run('06-verify-a-signed-record.ts');

    it.runIf(!available)('says what it needs, and exits cleanly, without it', () => {
        expect(output).toContain('needs @noble/curves');
    });

    it.runIf(available)('verifies all four signatures over the worked example', () => {
        expect(output).toContain('station   ES256   verifies');
        expect(output).toContain('meter[0]  ESB256  verifies');
        expect(output).toContain('meter[1]  ESB256  verifies');
        expect(output).toContain('operator  ES384   verifies');
        expect(output).not.toContain('FAILS');
    });

    it.runIf(available)('reproduces the station\'s signature byte for byte', () => {

        // The claim that matters: RFC 6979 makes the signature a function of
        // what it signs, so a Sig_structure that differed from the signer's by
        // one byte could not produce the same 64 bytes.
        expect(output).toContain('re-sign reproduces the recorded signature byte for byte');

    });

    it.runIf(available)('recomputes every key identifier from the key itself', () => {
        expect(output).toContain('meter     kid     matches C6738177A6E6D04B');
        expect(output).toContain('station   kid     matches 4F4E4267CBA43440');
        expect(output).toContain('operator  kid     matches 6B1F337BA0EC88BB');
    });

    it('reads the measurements out of the bytes the signatures cover', () => {
        expect(output).toMatch(/1234\.567|needs @noble\/curves/);
    });

});
