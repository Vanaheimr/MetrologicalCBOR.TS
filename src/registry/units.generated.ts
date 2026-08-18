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

/* eslint-disable */

// THIS FILE IS GENERATED. DO NOT EDIT.
//
//   source:    src/registry/units.json
//   generator: scripts/generate-registry.ts
//   command:   npm run generate:registry
//
// Every string literal below is escaped to plain ASCII on purpose, so that the
// unit symbols cannot be damaged by a file encoding mishap. The comments keep
// the readable spelling.

import type { UnitDefinition } from './types.js';


/**
 * The specification revision this registry was transcribed from.
 *
 * `npm run fetch:spec` retrieves that document into `spec/`, where the
 * conformance suite compares it with the registry entry by entry.
 */
export const REGISTRY_SPECIFICATION = Object.freeze({
    title:   "Metrological CBOR (Tag 44252)",
    version: "1.0",
    date:    "2026-08-18",
    section: "4",
    source:  "https://github.com/OpenChargingTechnology/Whitepapers/tree/master/MetrologicalCBOR",
} as const);


/** The unit identification 0, reserved and never valid on the wire. */
export const UNIT_ID_RESERVED = 0;

/** The lowest valid unit identification. */
export const UNIT_ID_MIN = 1;

/** The highest unit identification the specification manages. */
export const UNIT_ID_SPECIFICATION_MAX = 32767;

/** The lowest unit identification available for private use. */
export const UNIT_ID_PRIVATE_USE_MIN = 32768;

/** The highest valid unit identification. Anything above is an error. */
export const UNIT_ID_MAX = 65535;


/**
 * The identification of every unit the specification registers.
 *
 * Encoders should use the numeric identification rather than the symbol:
 * it costs one byte up to 23 and two beyond, where a symbol costs its length
 * plus one.
 */
export const Units = Object.freeze({

    /** one - `1` (identification 1, CBOR `01`) */
    One: 1,

    /** watt-hour - `Wh` (identification 2, CBOR `02`) */
    WattHour: 2,

    /** watt - `W` (identification 3, CBOR `03`) */
    Watt: 3,

    /** ampere - `A` (identification 4, CBOR `04`) */
    Ampere: 4,

    /** volt - `V` (identification 5, CBOR `05`) */
    Volt: 5,

    /** percent - `%` (identification 6, CBOR `06`) */
    Percent: 6,

    /** degree Celsius - `°C` (identification 7, CBOR `07`) */
    DegreeCelsius: 7,

    /** second - `s` (identification 8, CBOR `08`) */
    Second: 8,

    /** hertz - `Hz` (identification 9, CBOR `09`) */
    Hertz: 9,

    /** volt-ampere reactive - `var` (identification 10, CBOR `0A`) */
    VoltAmpereReactive: 10,

    /** volt-ampere - `VA` (identification 11, CBOR `0B`) */
    VoltAmpere: 11,

    /** ampere-hour - `Ah` (identification 12, CBOR `0C`) */
    AmpereHour: 12,

    /** volt-ampere-reactive hour - `varh` (identification 13, CBOR `0D`) */
    VoltAmpereReactiveHour: 13,

    /** ohm - `Ω` (identification 14, CBOR `0E`) */
    Ohm: 14,

    /** meter - `m` (identification 15, CBOR `0F`) */
    Meter: 15,

    /** gram - `g` (identification 16, CBOR `10`) */
    Gram: 16,

    /** kelvin - `K` (identification 17, CBOR `11`) */
    Kelvin: 17,

    /** hour - `h` (identification 18, CBOR `12`) */
    Hour: 18,

    /** minute - `min` (identification 19, CBOR `13`) */
    Minute: 19,

    /** joule - `J` (identification 20, CBOR `14`) */
    Joule: 20,

    /** pascal - `Pa` (identification 21, CBOR `15`) */
    Pascal: 21,

    /** bit per second - `bit/s` (identification 22, CBOR `16`) */
    BitPerSecond: 22,

    /** siemens - `S` (identification 23, CBOR `17`) */
    Siemens: 23,

    /** mole - `mol` (identification 24, CBOR `1818`) */
    Mole: 24,

    /** candela - `cd` (identification 25, CBOR `1819`) */
    Candela: 25,

    /** newton - `N` (identification 26, CBOR `181A`) */
    Newton: 26,

    /** coulomb - `C` (identification 27, CBOR `181B`) */
    Coulomb: 27,

    /** farad - `F` (identification 28, CBOR `181C`) */
    Farad: 28,

    /** weber - `Wb` (identification 29, CBOR `181D`) */
    Weber: 29,

    /** tesla - `T` (identification 30, CBOR `181E`) */
    Tesla: 30,

    /** henry - `H` (identification 31, CBOR `181F`) */
    Henry: 31,

    /** lumen - `lm` (identification 32, CBOR `1820`) */
    Lumen: 32,

    /** lux - `lx` (identification 33, CBOR `1821`) */
    Lux: 33,

    /** becquerel - `Bq` (identification 34, CBOR `1822`) */
    Becquerel: 34,

    /** gray - `Gy` (identification 35, CBOR `1823`) */
    Gray: 35,

    /** sievert - `Sv` (identification 36, CBOR `1824`) */
    Sievert: 36,

    /** katal - `kat` (identification 37, CBOR `1825`) */
    Katal: 37,

    /** radian - `rad` (identification 38, CBOR `1826`) */
    Radian: 38,

    /** steradian - `sr` (identification 39, CBOR `1827`) */
    Steradian: 39,

    /** day - `d` (identification 60, CBOR `183C`) */
    Day: 60,

    /** degree - `°` (identification 61, CBOR `183D`) */
    Degree: 61,

    /** litre - `l` (identification 62, CBOR `183E`) */
    Litre: 62,

    /** tonne - `t` (identification 63, CBOR `183F`) */
    Tonne: 63,

    /** permille - `‰` (identification 64, CBOR `1840`) */
    Permille: 64,

    /** parts per million - `ppm` (identification 65, CBOR `1841`) */
    PartsPerMillion: 65,

    /** bit - `bit` (identification 120, CBOR `1878`) */
    Bit: 120,

    /** byte - `B` (identification 121, CBOR `1879`) */
    Byte: 121,

    /** byte per second - `B/s` (identification 122, CBOR `187A`) */
    BytePerSecond: 122,

    /** square meter - `m²` (identification 140, CBOR `188C`) */
    SquareMeter: 140,

    /** cubic meter - `m³` (identification 141, CBOR `188D`) */
    CubicMeter: 141,

} as const);


/** The name of a unit constant, for example `Volt`. */
export type UnitConstantName = keyof typeof Units;

/** The identification of a unit the specification registers. */
export type StandardUnitId = (typeof Units)[UnitConstantName];


/**
 * Every unit of specification Section 4, in the order of its table.
 */
export const STANDARD_UNITS: readonly UnitDefinition[] = Object.freeze([

    //   1  1  one
    Object.freeze({
        id:         1,
        symbol:     "1",
        name:       "one",
        aliases:    Object.freeze(["one", "/"]),
        senml:      "/",
        affine:     false,
        privateUse: false,
        note:       "The neutral element of unit multiplication and the coherent SI unit of a quantity of dimension one. A reading without a unit is not the same thing as a reading whose unit is one.",
    }),

    //   2  Wh  watt-hour
    Object.freeze({
        id:         2,
        symbol:     "Wh",
        name:       "watt-hour",
        aliases:    Object.freeze([]),
        senml:      "Wh",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //   3  W  watt
    Object.freeze({
        id:         3,
        symbol:     "W",
        name:       "watt",
        aliases:    Object.freeze([]),
        senml:      "W",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //   4  A  ampere
    Object.freeze({
        id:         4,
        symbol:     "A",
        name:       "ampere",
        aliases:    Object.freeze([]),
        senml:      "A",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //   5  V  volt
    Object.freeze({
        id:         5,
        symbol:     "V",
        name:       "volt",
        aliases:    Object.freeze([]),
        senml:      "V",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //   6  %  percent
    Object.freeze({
        id:         6,
        symbol:     "%",
        name:       "percent",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       "The plain dimensionless ratio. SenML's /100 convention for percent has no counterpart here.",
    }),

    //   7  °C  degree Celsius
    Object.freeze({
        id:         7,
        symbol:     "\u00B0C",
        name:       "degree Celsius",
        aliases:    Object.freeze(["Cel"]),
        senml:      "Cel",
        affine:     true,
        privateUse: false,
        note:       undefined,
    }),

    //   8  s  second
    Object.freeze({
        id:         8,
        symbol:     "s",
        name:       "second",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //   9  Hz  hertz
    Object.freeze({
        id:         9,
        symbol:     "Hz",
        name:       "hertz",
        aliases:    Object.freeze([]),
        senml:      "Hz",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  10  var  volt-ampere reactive
    Object.freeze({
        id:         10,
        symbol:     "var",
        name:       "volt-ampere reactive",
        aliases:    Object.freeze([]),
        senml:      "var",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  11  VA  volt-ampere
    Object.freeze({
        id:         11,
        symbol:     "VA",
        name:       "volt-ampere",
        aliases:    Object.freeze([]),
        senml:      "VA",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  12  Ah  ampere-hour
    Object.freeze({
        id:         12,
        symbol:     "Ah",
        name:       "ampere-hour",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  13  varh  volt-ampere-reactive hour
    Object.freeze({
        id:         13,
        symbol:     "varh",
        name:       "volt-ampere-reactive hour",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  14  Ω  ohm
    Object.freeze({
        id:         14,
        symbol:     "\u03A9",
        name:       "ohm",
        aliases:    Object.freeze(["Ohm"]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       "The symbol is U+03A9 GREEK CAPITAL LETTER OMEGA. NFC normalisation maps U+2126 OHM SIGN onto it, so both spellings resolve.",
    }),

    //  15  m  meter
    Object.freeze({
        id:         15,
        symbol:     "m",
        name:       "meter",
        aliases:    Object.freeze(["Metre"]),
        senml:      "m",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  16  g  gram
    Object.freeze({
        id:         16,
        symbol:     "g",
        name:       "gram",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       "The SI base unit of mass is the kilogram, but SI prefixes attach to the gram. Five kilograms is (5, 16, 3): five, gram, kilo.",
    }),

    //  17  K  kelvin
    Object.freeze({
        id:         17,
        symbol:     "K",
        name:       "kelvin",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  18  h  hour
    Object.freeze({
        id:         18,
        symbol:     "h",
        name:       "hour",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  19  min  minute
    Object.freeze({
        id:         19,
        symbol:     "min",
        name:       "minute",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  20  J  joule
    Object.freeze({
        id:         20,
        symbol:     "J",
        name:       "joule",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  21  Pa  pascal
    Object.freeze({
        id:         21,
        symbol:     "Pa",
        name:       "pascal",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  22  bit/s  bit per second
    Object.freeze({
        id:         22,
        symbol:     "bit/s",
        name:       "bit per second",
        aliases:    Object.freeze(["bps"]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  23  S  siemens
    Object.freeze({
        id:         23,
        symbol:     "S",
        name:       "siemens",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  24  mol  mole
    Object.freeze({
        id:         24,
        symbol:     "mol",
        name:       "mole",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  25  cd  candela
    Object.freeze({
        id:         25,
        symbol:     "cd",
        name:       "candela",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  26  N  newton
    Object.freeze({
        id:         26,
        symbol:     "N",
        name:       "newton",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  27  C  coulomb
    Object.freeze({
        id:         27,
        symbol:     "C",
        name:       "coulomb",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  28  F  farad
    Object.freeze({
        id:         28,
        symbol:     "F",
        name:       "farad",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  29  Wb  weber
    Object.freeze({
        id:         29,
        symbol:     "Wb",
        name:       "weber",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  30  T  tesla
    Object.freeze({
        id:         30,
        symbol:     "T",
        name:       "tesla",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  31  H  henry
    Object.freeze({
        id:         31,
        symbol:     "H",
        name:       "henry",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  32  lm  lumen
    Object.freeze({
        id:         32,
        symbol:     "lm",
        name:       "lumen",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  33  lx  lux
    Object.freeze({
        id:         33,
        symbol:     "lx",
        name:       "lux",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  34  Bq  becquerel
    Object.freeze({
        id:         34,
        symbol:     "Bq",
        name:       "becquerel",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  35  Gy  gray
    Object.freeze({
        id:         35,
        symbol:     "Gy",
        name:       "gray",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  36  Sv  sievert
    Object.freeze({
        id:         36,
        symbol:     "Sv",
        name:       "sievert",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  37  kat  katal
    Object.freeze({
        id:         37,
        symbol:     "kat",
        name:       "katal",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  38  rad  radian
    Object.freeze({
        id:         38,
        symbol:     "rad",
        name:       "radian",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  39  sr  steradian
    Object.freeze({
        id:         39,
        symbol:     "sr",
        name:       "steradian",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  60  d  day
    Object.freeze({
        id:         60,
        symbol:     "d",
        name:       "day",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  61  °  degree
    Object.freeze({
        id:         61,
        symbol:     "\u00B0",
        name:       "degree",
        aliases:    Object.freeze(["deg"]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  62  l  litre
    Object.freeze({
        id:         62,
        symbol:     "l",
        name:       "litre",
        aliases:    Object.freeze(["L", "Liter"]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  63  t  tonne
    Object.freeze({
        id:         63,
        symbol:     "t",
        name:       "tonne",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  64  ‰  permille
    Object.freeze({
        id:         64,
        symbol:     "\u2030",
        name:       "permille",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    //  65  ppm  parts per million
    Object.freeze({
        id:         65,
        symbol:     "ppm",
        name:       "parts per million",
        aliases:    Object.freeze([]),
        senml:      "ppm",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    // 120  bit  bit
    Object.freeze({
        id:         120,
        symbol:     "bit",
        name:       "bit",
        aliases:    Object.freeze([]),
        senml:      "bit",
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    // 121  B  byte
    Object.freeze({
        id:         121,
        symbol:     "B",
        name:       "byte",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    // 122  B/s  byte per second
    Object.freeze({
        id:         122,
        symbol:     "B/s",
        name:       "byte per second",
        aliases:    Object.freeze([]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    // 140  m²  square meter
    Object.freeze({
        id:         140,
        symbol:     "m\u00B2",
        name:       "square meter",
        aliases:    Object.freeze(["m2"]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

    // 141  m³  cubic meter
    Object.freeze({
        id:         141,
        symbol:     "m\u00B3",
        name:       "cubic meter",
        aliases:    Object.freeze(["m3"]),
        senml:      undefined,
        affine:     false,
        privateUse: false,
        note:       undefined,
    }),

]);
