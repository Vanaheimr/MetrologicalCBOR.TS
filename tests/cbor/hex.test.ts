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
 * Hexadecimal, and the byte order that deterministic encoding sorts map keys in.
 */

import { describe, expect, it } from 'vitest';

import { bytesToHex, compareBytes, hexToBytes } from '../../src/cbor/hex.js';


describe('bytesToHex', () => {

    it('writes uppercase, two digits per byte, as the specification does', () => {
        expect(bytesToHex(new Uint8Array([0xD9, 0xAC, 0xDC, 0x05]))).toBe('D9ACDC05');
        expect(bytesToHex(new Uint8Array([0x00, 0x0F]))).toBe('000F');
        expect(bytesToHex(new Uint8Array(0))).toBe('');
    });

});


describe('hexToBytes', () => {

    it('reads what bytesToHex writes', () => {
        expect(bytesToHex(hexToBytes('D9ACDC05'))).toBe('D9ACDC05');
    });

    it('accepts lowercase', () => {
        expect(bytesToHex(hexToBytes('d9acdc05'))).toBe('D9ACDC05');
    });

    it('ignores whitespace, so a listing can be pasted as it is printed', () => {

        // The specification prints its byte-level listings across several
        // lines, and its examples with spaces between the fields.
        expect(bytesToHex(hexToBytes('D9ACDC 83 C482201832 04 22'))).toBe('D9ACDC83C48220183204 22'.replace(/\s/g, ''));
        expect(bytesToHex(hexToBytes('D9ACDC\n8205\n04'))).toBe('D9ACDC820504');

    });

    it('rejects an odd number of digits', () => {
        expect(() => hexToBytes('ABC')).toThrow(SyntaxError);
    });

    it('rejects a character that is not a hexadecimal digit', () => {
        expect(() => hexToBytes('ZZ')).toThrow(SyntaxError);
        expect(() => hexToBytes('D9ACDCXX')).toThrow(SyntaxError);
    });

    it('accepts the empty string', () => {
        expect(hexToBytes('')).toHaveLength(0);
        expect(hexToBytes('   ')).toHaveLength(0);
    });

});


describe('compareBytes', () => {

    it('orders by the first byte that differs', () => {
        expect(compareBytes(new Uint8Array([1]), new Uint8Array([2]))).toBe(-1);
        expect(compareBytes(new Uint8Array([2]), new Uint8Array([1]))).toBe(1);
        expect(compareBytes(new Uint8Array([1, 9]), new Uint8Array([2, 0]))).toBe(-1);
    });

    it('treats bytes as unsigned, so 0xFF sorts after 0x01', () => {
        expect(compareBytes(new Uint8Array([0x01]), new Uint8Array([0xFF]))).toBe(-1);
    });

    it('sorts a prefix before the sequence it is a prefix of', () => {
        expect(compareBytes(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(-1);
        expect(compareBytes(new Uint8Array([1, 0]), new Uint8Array([1]))).toBe(1);
        expect(compareBytes(new Uint8Array(0), new Uint8Array([0]))).toBe(-1);
    });

    it('reports equal sequences as equal', () => {
        expect(compareBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(0);
        expect(compareBytes(new Uint8Array(0), new Uint8Array(0))).toBe(0);
    });

});
