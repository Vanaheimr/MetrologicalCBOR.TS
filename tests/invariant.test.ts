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
 * The one place where "this cannot happen" is written down.
 *
 * Its whole purpose is to be a branch that is never taken in production and is
 * taken here, so that the reasoning behind every mandatory capture group in the
 * text parser is checked once rather than assumed at each site.
 */

import { describe, expect, it }  from 'vitest';

import { McborError }            from '../src/errors.js';
import { InvariantError, invariant } from '../src/invariant.js';


describe('an invariant that holds', () => {

    it('returns the value, narrowed', () => {

        const match = /(\d+)-(\d+)/.exec('4-2');

        expect(match).not.toBeNull();

        // Both groups are mandatory, so both are there. The point of the call
        // is that the type is now `string` rather than `string | undefined`.
        const left: string = invariant(match?.[1], 'the left number');

        expect(left).toBe('4');

    });

    it('passes a value through whatever its type', () => {
        expect(invariant(0,     'a number')).toBe(0);
        expect(invariant('',    'a string')).toBe('');
        expect(invariant(false, 'a boolean')).toBe(false);
        expect(invariant(null,  'a null')).toBeNull();
    });

});


describe('an invariant that does not hold', () => {

    it('throws, naming what was missing', () => {

        // An optional group that did not participate: exactly the shape the
        // helper exists to distinguish from a mandatory one.
        const match = /(\d+)(?:-(\d+))?/.exec('4');

        expect(() => invariant(match?.[2], 'the right number'))
            .toThrow(/the right number/);

    });

    it('is an InvariantError, and deliberately not an McborError', () => {

        // The distinction carries the whole meaning: an McborError says the
        // input was wrong, and this says the library is. The fuzz suites assert
        // that every input yields the former, so this escaping is a bug report.
        let thrown: unknown;

        try {
            invariant(undefined, 'something guaranteed');
        }
        catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(InvariantError);
        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toBeInstanceOf(McborError);
        expect((thrown as Error).name).toBe('InvariantError');

    });

    it('says where to take the fault', () => {
        expect(() => invariant(undefined, 'a group')).toThrow(/defect in Metrological CBOR/);
    });

});
