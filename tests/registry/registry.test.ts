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
 * The behaviour of the unit registry: lookup, rejection and private use.
 *
 * The rejection tests matter as much as the lookups. Specification Section 7
 * requires a decoder to reject an unknown unit identification rather than
 * substitute a placeholder, so "throws with this code" is the specified
 * behaviour and not merely defensive programming.
 */

import { describe, expect, it } from 'vitest';

import { UnitError }        from '../../src/errors.js';
import { UnitRegistry }     from '../../src/registry/index.js';
import { codeOf }           from '../support/errors.js';
import {
    STANDARD_UNITS,
    UNIT_ID_MAX,
    UNIT_ID_PRIVATE_USE_MIN,
    Units,
} from '../../src/registry/units.generated.js';

const registry = UnitRegistry.standard;

const OHM      = '\u03A9';    // GREEK CAPITAL LETTER OMEGA, the registered symbol
const OHM_SIGN = '\u2126';    // OHM SIGN, canonically equivalent to the above


describe('lookup by identification', () => {

    it('resolves a registered identification', () => {

        const volt = registry.byId(Units.Volt);

        expect(volt.id).toBe(5);
        expect(volt.symbol).toBe('V');
        expect(volt.name).toBe('volt');
        expect(volt.privateUse).toBe(false);

    });

    it('rejects the reserved identification 0', () => {

        expect(() => registry.byId(0)).toThrow(UnitError);

        try {
            registry.byId(0);
            expect.unreachable('0 must not resolve');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_UNIT_ID_RESERVED');
            expect((error as UnitError).clause).toBe('4');
        }

    });

    it.each([-1, 65536, 70000, 1.5, Number.NaN])('rejects the out-of-range identification %s', id => {

        try {
            registry.byId(id);
            expect.unreachable(`${String(id)} must not resolve`);
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_UNIT_ID_OUT_OF_RANGE');
        }

    });

    it('rejects an unassigned identification inside a reserved range', () => {

        // 40..59 are reserved for future registrations, so that a later
        // addition never has to break the grouping.
        try {
            registry.byId(45);
            expect.unreachable('45 must not resolve');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_UNIT_UNKNOWN');
            expect((error as UnitError).clause).toBe('3.2');
        }

    });

    it('points at the private-use API when an unregistered private identification is looked up', () => {

        try {
            registry.byId(40000);
            expect.unreachable('40000 must not resolve');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_UNIT_UNKNOWN');
            expect((error as UnitError).message).toContain('withPrivateUnits');
        }

    });

    it('returns undefined rather than throwing where the caller asks for that', () => {

        expect(registry.tryById(5)).toBeDefined();
        expect(registry.tryById(0)).toBeUndefined();
        expect(registry.tryById(45)).toBeUndefined();
        expect(registry.has(5)).toBe(true);
        expect(registry.has(45)).toBe(false);

    });

});


describe('lookup by symbol', () => {

    it('resolves the registered symbol', () => {
        expect(registry.bySymbol('Wh').id).toBe(Units.WattHour);
        expect(registry.bySymbol('var').id).toBe(Units.VoltAmpereReactive);
        expect(registry.bySymbol('bit/s').id).toBe(Units.BitPerSecond);
    });

    it('resolves an alias', () => {
        expect(registry.bySymbol('Metre').id).toBe(Units.Meter);
        expect(registry.bySymbol('Liter').id).toBe(Units.Litre);
        expect(registry.bySymbol('bps').id).toBe(Units.BitPerSecond);
        expect(registry.bySymbol('one').id).toBe(Units.One);
        expect(registry.bySymbol('/').id).toBe(Units.One);
    });

    it('normalises to NFC, which reconciles the two spellings of the ohm', () => {

        expect(registry.bySymbol(OHM).id).toBe(Units.Ohm);
        expect(registry.bySymbol(OHM_SIGN).id).toBe(Units.Ohm);
        expect(registry.bySymbol(OHM_SIGN).symbol).toBe(OHM);

    });

    it('is case sensitive', () => {

        expect(registry.bySymbol('T').id).toBe(Units.Tesla);
        expect(registry.bySymbol('t').id).toBe(Units.Tonne);
        expect(registry.tryBySymbol('v')).toBeUndefined();
        expect(registry.tryBySymbol('WH')).toBeUndefined();

    });

    it('rejects an unknown symbol', () => {

        try {
            registry.bySymbol('parsec');
            expect.unreachable('parsec must not resolve');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_UNIT_UNKNOWN');
            expect((error as UnitError).clause).toBe('3.2');
        }

    });

    it('does not resolve a prefixed spelling, which belongs to the text format', () => {

        // 'mA' is milli plus ampere, not a registered symbol. Splitting a
        // prefix off a token is the job of the text format, not the registry.
        expect(registry.tryBySymbol('mA')).toBeUndefined();
        expect(registry.tryBySymbol('kWh')).toBeUndefined();

        // ...whereas these are registered symbols that merely look prefixed.
        expect(registry.bySymbol('cd').name).toBe('candela');
        expect(registry.bySymbol('min').name).toBe('minute');
        expect(registry.bySymbol('kat').name).toBe('katal');

    });

});


describe('the named constants', () => {

    it('cover every registered unit exactly once', () => {

        const fromConstants = Object.values(Units).sort((a, b) => a - b);
        const fromUnits     = STANDARD_UNITS.map(unit => unit.id);

        expect(fromConstants).toStrictEqual(fromUnits);
        expect(new Set(fromConstants).size).toBe(fromConstants.length);

    });

    it('name the units of the worked example', () => {

        // 44252([4([-3, 1234567]), 2, 3, ...]) is 1234.567 kWh.
        expect(Units.WattHour).toBe(2);
        expect(registry.byId(Units.WattHour).symbol).toBe('Wh');

    });

    it('are frozen', () => {
        expect(Object.isFrozen(Units)).toBe(true);
        expect(Object.isFrozen(STANDARD_UNITS)).toBe(true);
    });

});


describe('affine units', () => {

    it('are exactly the degree Celsius', () => {

        const affine = STANDARD_UNITS.filter(unit => unit.affine);

        expect(affine).toHaveLength(1);
        expect(affine[0]?.id).toBe(Units.DegreeCelsius);

    });

    it('leave the kelvin a ratio scale', () => {
        expect(registry.byId(Units.Kelvin).affine).toBe(false);
    });

});


describe('private use', () => {

    const custom = registry.withPrivateUnits({
        id:     40000,
        symbol: 'flurbo',
        name:   'flurbo',
    });

    it('resolves a registered private unit', () => {

        const flurbo = custom.byId(40000);

        expect(flurbo.symbol).toBe('flurbo');
        expect(flurbo.privateUse).toBe(true);
        expect(custom.bySymbol('flurbo').id).toBe(40000);

    });

    it('keeps the standard registry unchanged', () => {

        // A registry is immutable, so that an application registering a
        // private unit cannot change how unrelated code decodes the wire.
        expect(registry.tryById(40000)).toBeUndefined();
        expect(registry.units).toHaveLength(STANDARD_UNITS.length);
        expect(custom.units).toHaveLength(STANDARD_UNITS.length + 1);

    });

    it('still resolves the standard units', () => {
        expect(custom.byId(Units.Volt).symbol).toBe('V');
    });

    it.each([1, 23, 32767, UNIT_ID_MAX + 1, 0])('rejects the identification %s as not private use', id => {

        try {
            registry.withPrivateUnits({ id, symbol: 'x', name: 'x' });
            expect.unreachable(`${String(id)} must not be registrable`);
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_UNIT_ID_NOT_PRIVATE_USE');
        }

    });

    it('accepts the boundaries of the private-use range', () => {

        expect(() => registry.withPrivateUnits({ id: UNIT_ID_PRIVATE_USE_MIN, symbol: 'a', name: 'a' })).not.toThrow();
        expect(() => registry.withPrivateUnits({ id: UNIT_ID_MAX,             symbol: 'b', name: 'b' })).not.toThrow();

    });

    it('rejects a symbol that collides with a registered one', () => {

        try {
            registry.withPrivateUnits({ id: 40001, symbol: 'V', name: 'not the volt' });
            expect.unreachable('V must not be re-registrable');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_REGISTRY_CONFLICT');
            expect((error as UnitError).message).toContain('volt');
        }

    });

    it('rejects a symbol that collides with a registered alias', () => {

        try {
            registry.withPrivateUnits({ id: 40002, symbol: 'Cel', name: 'not the degree Celsius' });
            expect.unreachable('Cel must not be re-registrable');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_REGISTRY_CONFLICT');
        }

    });

    it('rejects a collision within a single call', () => {

        try {
            registry.withPrivateUnits(
                { id: 40003, symbol: 'p', name: 'first' },
                { id: 40004, symbol: 'p', name: 'second' },
            );
            expect.unreachable('the second p must not be registrable');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_REGISTRY_CONFLICT');
        }

    });

    it('rejects an identification that is already taken', () => {

        try {
            custom.withPrivateUnits({ id: 40000, symbol: 'other', name: 'other' });
            expect.unreachable('40000 must not be registrable twice');
        }
        catch (error) {
            expect((error as UnitError).code).toBe('ERR_REGISTRY_CONFLICT');
        }

    });

});


describe('registering several private units at once', () => {

    it('refuses a symbol that another unit in the same call already took', () => {

        // The conflict is with a unit that is not in the registry yet, which
        // is why the check has to look at what this call is adding as well as
        // at what is already there.
        expect(codeOf(() => UnitRegistry.standard.withPrivateUnits(
            { id: 40000, symbol: 'flurbo', name: 'flurbo' },
            { id: 40001, symbol: 'flurbo', name: 'another flurbo' },
        ))).toBe('ERR_REGISTRY_CONFLICT');

    });

    it('refuses a symbol that another unit in the same call took as an alias', () => {

        expect(codeOf(() => UnitRegistry.standard.withPrivateUnits(
            { id: 40000, symbol: 'flurbo', name: 'flurbo', aliases: ['flb'] },
            { id: 40001, symbol: 'flb',    name: 'another flurbo' },
        ))).toBe('ERR_REGISTRY_CONFLICT');

    });

    it('refuses an identification that another unit in the same call already took', () => {

        expect(codeOf(() => UnitRegistry.standard.withPrivateUnits(
            { id: 40000, symbol: 'flurbo', name: 'flurbo' },
            { id: 40000, symbol: 'blicket', name: 'blicket' },
        ))).toBe('ERR_REGISTRY_CONFLICT');

    });

    it('adds them all where they do not collide', () => {

        const extended = UnitRegistry.standard.withPrivateUnits(
            { id: 40000, symbol: 'flurbo',  name: 'flurbo', aliases: ['flb'] },
            { id: 40001, symbol: 'blicket', name: 'blicket' },
        );

        expect(extended.byId(40000).symbol).toBe('flurbo');
        expect(extended.bySymbol('flb').id).toBe(40000);
        expect(extended.byId(40001).symbol).toBe('blicket');

        // And the registry it came from is untouched.
        expect(UnitRegistry.standard.tryById(40000)).toBeUndefined();

    });

});
