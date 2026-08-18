/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A calibration certificate, as it was issued.
 *
 *     npx tsx examples/03-an-uncertainty.ts
 *
 * A value without a statement of uncertainty is, strictly speaking, not a
 * measurement result at all. What this shows is that the statement is carried
 * the way the certificate made it, and not normalised behind your back.
 */

import {
    bytesToHex, decimal, encodeMetrologicalValue, formatDecimal,
    formatMetrologicalValue, integer, metrologicalValue,
    parseMetrologicalValue, standardUncertainty, uncertainty, unitById, Units,
} from '../src/index.js';


// (230.00 ±0.12) V, k = 2 — what the certificate says.
const voltage = metrologicalValue({
    value:       decimal(23000n, -2),
    unit:        unitById(Units.Volt),
    uncertainty: uncertainty({
        magnitude:      decimal(12n, -2),
        coverageFactor: integer(2n),
    }),
});

console.log('as written       ', formatMetrologicalValue(voltage));
console.log('as bytes         ', bytesToHex(encodeMetrologicalValue(voltage)));
console.log();

// The magnitude stays as reported, together with the coverage factor it
// belongs to. U = 0.12 V at k = 2 is not the same statement as u = 0.06 V,
// even though the second follows from the first.
console.log('magnitude U      ', formatDecimal(voltage.uncertainty!.magnitude));
console.log('coverage factor k', formatDecimal(voltage.uncertainty!.coverageFactor!));

// Deriving u = U / k makes you say how precisely you want it. Choosing a
// precision for a measurement result is not the library's decision to make:
// GUM Section 7.2.6 puts it with the producer.
console.log('u = U/k at 3 dp  ', formatDecimal(standardUncertainty(voltage.uncertainty!,
                                                                   { scale: 3, rounding: 'half-even' })));
console.log('u = U/k at 5 dp  ', formatDecimal(standardUncertainty(voltage.uncertainty!,
                                                                   { scale: 5, rounding: 'half-even' })));


// --- Everything a GUM statement can say -------------------------------------

const full = parseMetrologicalValue('(1234.567 ±12.3) kWh, k=2, p=0.95, dist=normal, nu=12');

console.log();
console.log('stated in full   ', formatMetrologicalValue(full));
console.log('  magnitude      ', formatDecimal(full.uncertainty!.magnitude));
console.log('  k              ', formatDecimal(full.uncertainty!.coverageFactor!));
console.log('  probability    ', formatDecimal(full.uncertainty!.coverageProbability!));
console.log('  distribution   ', full.uncertainty!.distribution);
console.log('  deg. of freedom', formatDecimal(full.uncertainty!.degreesOfFreedom!));
console.log('as bytes         ', bytesToHex(encodeMetrologicalValue(full)));


// --- Not stated is not zero -------------------------------------------------

const bare = parseMetrologicalValue('230 V');

console.log();
console.log('no uncertainty   ', bare.uncertainty === undefined ? 'undefined — not stated' : 'something');

// Which is a different claim from stating that it is zero, and the format
// keeps them apart. Specification Section 7.
const zero = parseMetrologicalValue('(230 ±0) V');

console.log('zero uncertainty ', formatDecimal(zero.uncertainty!.magnitude), '— stated, and it is zero');
console.log('different bytes  ',
            bytesToHex(encodeMetrologicalValue(bare)), 'vs', bytesToHex(encodeMetrologicalValue(zero)));
