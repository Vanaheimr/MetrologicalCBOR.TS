# The mCBOR text format

**Status:** follows the official text-format specification,
[metrological-text.md](https://github.com/OpenChargingTechnology/Whitepapers/blob/master/MetrologicalCBOR/metrological-text.md).

A metrological value written as one line of text: `230 V`, `1.10 kWh`,
`(230.00 ±0.12) V, k=2`.

This is a **second encoding** of a reading, not a rendering of one. Text
written by `formatMetrologicalValue` parses back to the same reading and
therefore to the same canonical CBOR bytes. That property is what lets a whole
document be carried through JSON with every measurement in it intact, and every
rule below exists to keep it.

The normative source is the specification's
[metrological-text.md](https://github.com/OpenChargingTechnology/Whitepapers/blob/master/MetrologicalCBOR/metrological-text.md);
this document describes the same format from this library's point of view,
including what its parser tolerates beyond the canonical spelling.

## 1. Grammar

```abnf
reading         = magnitude [ scale ] SP unit-expression *( "," [ SP ] extension )

magnitude       = number
                / "(" number [ SP ] plus-minus [ SP ] number ")"

plus-minus      = %x00B1        ; PLUS-MINUS SIGN
                / "+/-"
                / "+-"

number          = [ sign ] 1*DIGIT [ "." 1*DIGIT ] [ ( "e" / "E" ) [ sign ] 1*DIGIT ]
sign            = "+" / "-"

scale           = ( %x00D7 / "x" / "*" ) "10" ( "^" [ sign ] 1*DIGIT / 1*superscript )

unit-expression = factor *( separator factor )
separator       = %x00B7 / "*" / 1*SP          ; MIDDLE DOT, asterisk or space

factor          = unit-token [ exponent ]
unit-token      = 1*( %x21-7E / non-ascii )    ; resolved against the registry, see 4
exponent        = 1*superscript
                / "^" [ sign ] 1*DIGIT [ "/" 1*DIGIT ]

superscript     = %x2070 / %x00B9 / %x00B2 / %x00B3 / %x2074-2079 / %x207A / %x207B

extension       = "k"    [ SP ] "=" [ SP ] number
                / "p"    [ SP ] "=" [ SP ] number
                / "dist" [ SP ] "=" [ SP ] distribution
                / ( "nu" / %x03BD ) [ SP ] "=" [ SP ] number

distribution    = "normal" / "rectangular" / "triangular" / "u-shaped" / "student-t"
```

Input is normalised to Unicode Normalization Form C before anything else.

## 2. What the canonical output looks like

The renderer emits one spelling; the parser accepts several. These are the ten
readings of specification Section 5, written by this library:

| Reading | Canonical text | ASCII text |
|---|---|---|
| 5 A | `5 A` | `5 A` |
| 230 V | `230 V` | `230 V` |
| 5.0 mA | `5.0 mA` | `5.0 mA` |
| 1.10 kWh | `1.10 kWh` | `1.10 kWh` |
| (5.00 ± 0.02) mA | `(5.00 ±0.02) mA` | `(5.00 +/-0.02) mA` |
| (5 ± 0.5) A | `(5 ±0.5) A` | `(5 +/-0.5) A` |
| 9.81 m·s⁻² | `9.81 m·s^-2` | `9.81 m*s^-2` |
| (230.00 ± 0.12) V, k = 2 | `(230.00 ±0.12) V, k=2` | `(230.00 +/-0.12) V, k=2` |
| 4.5 nV·Hz^-1/2 | `4.5 nV·Hz^-1/2` | `4.5 nV*Hz^-1/2` |

## 3. The number

The decimal scale is part of the datum — `1.10 kWh` states a resolution that
`1.1 kWh` does not — so the text has to distinguish every number the wire
distinguishes. Three forms do it:

| On the wire | Written | Why |
|---|---|---|
| integer `5` | `5` | The plain form. |
| decimal fraction (exponent < 0) | `5.0`, `1.10`, `0.005` | Positional: the decimal point marks it as a fraction and the trailing zeros show. |

A decimal fraction's exponent is negative on the wire — an integral reading
is written as an integer (tag specification, Section 3.1) — so the positional
form covers every fraction there is. Scientific notation is accepted on
input, and an exponent that leaves no decimal places denotes the integer it
equals: `5e0` and `5.0e2` are the integers `5` and `500`.

## 4. The unit

### 4.1 A token is a whole symbol before it is a prefixed one

The rule that decides most of the hard cases:

> A unit token is looked up in the registry **as a whole** first. Only where
> that fails is a prefix peeled off the front, two characters before one.

It is what makes

- `cd` the **candela** and not a centi-day,
- `min` the **minute**, `mol` the **mole**, `kat` the **katal**, `Pa` the
  **pascal**, `rad` the **radian**, `ppm` **parts per million**,
- `m2` and `m²` the **square metre**, not the metre squared,
- `das` a **decasecond** — the two-character `da` is tried before `d`.

Where the whole token is not a registered symbol, the prefix split applies:
`mA` is milliampere, `kWh` kilowatt-hour, `nm` nanometre.

**The kilogram** falls out of this correctly. There is no `kg` in the registry,
because the SI attaches prefixes to the gram, so `kg` splits into kilo and gram
and five kilograms encodes as `(5, 16, 3)`.

**A documented consequence:** `dB` reads as a **deci-byte**. The bel is not in
the registry, so the token can only split the one way. This is not a defect of
the grammar but a gap in the vocabulary, and it will resolve itself if the bel
is ever registered.

Lookup is case-sensitive throughout: `T` is the tesla and `t` the tonne, `S`
the siemens and `s` the second, `M` mega and `m` milli.

### 4.2 Only the leading factor may carry a prefix

A prefix applies to the quantity as a whole (specification Section 3.3), so
`km·s⁻²` is the whole reading scaled by 10³ and **not** `m·(ks)⁻²`. The latter
is not expressible in this format, and `m·ks⁻²` is rejected rather than
quietly read as something else.

### 4.3 Exponents

Every power but the first is written with a caret: `m·s^-2`, `Hz^-1/2`. The
first power is not written at all. Superscript exponents (`m·s⁻²`) are
accepted on input — with one guard: superscripts that run together, as the
two exponents of `m^3^-1` would, are rejected rather than misread.

A rational exponent is written in lowest terms with a denominator greater
than one; `[2, 1]` and `[-2, 4]` are not valid wire spellings, and the text
side never produces them.

### 4.4 The dimensionless unit

A reading whose unit is `one` states it, like every reading states its unit:
`0.95 1`. A bare number is prose, not a reading — which is what keeps the
JSON conversion from tagging every numeric string it meets. The percent,
permille and parts-per-million are *not* dimensionless in this sense — they
have symbols and keep them: `95 %`.

## 5. The prefix

A prefix is folded into the unit symbol wherever that is what the SI means by
it, and written as an explicit factor of ten where it is not.

Folding requires all three of:

1. the symbol it attaches to stands at the **first power** — otherwise the
   prefix would be raised to that power too;
2. the symbol **carries no power of its own** — `km²` is a square kilometre,
   a million square metres rather than a thousand;
3. the folded token **reads back as the same prefix and unit** — the centi-day
   would fold into `cd`, which is the candela.

Where any of them fails, the reading is written `5×10^3 m²`, and the factor
of ten is part of the unit side rather than of the number: `5000 m²` is a
different reading, whose value is the plain integer and whose prefix is none.

Only the 25 SI prefix exponents are valid. `5x10^4 A` is rejected: there is no
prefix for ten thousand, and a prefix is not a general scaling factor.

## 6. The uncertainty

A reading with an uncertainty puts both in brackets: `(230.00 ±0.12) V`. The
magnitude is in the same unit and prefix as the reading, which is why the unit
stands outside the brackets.

Anything the GUM states beyond the magnitude follows as comma-separated
extensions, in the order the specification lists its map keys:

| Extension | Meaning | Example |
|---|---|---|
| `k=` | the coverage factor the magnitude belongs to | `k=2` |
| `p=` | the coverage probability | `p=0.95` |
| `dist=` | the probability distribution | `dist=normal` |
| `ν=` | the effective degrees of freedom | `ν=45` |

`nu=` is accepted for `ν=` on input and is what the ASCII output writes;
`dist=t` is accepted for `dist=student-t`.

The magnitude is kept **as reported**, with the coverage factor it belongs to.
It is never normalised to a standard uncertainty — `u = U / k` is something a
consumer asks for, with a scale and a rounding it states itself.

An extension without an uncertainty to attach it to is an error, as is an
extension this format does not define.

## 7. What the parser accepts beyond the canonical form

| Canonical | Also accepted |
|---|---|
| `±` | `+/-`, `+-` |
| `·` between factors | `*`, one or more spaces |
| `m·s^-2` | `m·s⁻²`, `m*s^-2`, `m s^-2` |
| `×10^3` | `×10³`, `x10^3`, `*10^3` |
| `Ω` (U+03A9) | U+2126 OHM SIGN — normalisation reconciles them |
| `µ` (U+00B5) | `μ` U+03BC — normalisation does *not*, so both are listed explicitly |
| `m²` | `m2` — a registered alias |
| `ν=45` | `nu=45` |
| `dist=student-t` | `dist=t` |
| `k=2` | `k = 2` |

Everything else is rejected. The parser never guesses at a symbol it does not
know, because a reading understood as the wrong unit is worse than a reading
not understood at all.

## 8. What the format does not carry

- **How the unit was spelled on the wire.** A unit written as a symbol rather
  than as an identification (which the specification permits but discourages)
  comes back as the identification. Text round-trips to the *canonical*
  encoding, not to a preserved one; use `encodeMetrologicalValue(v, { units:
  'preserve' })` where the original bytes matter.
- **Anything outside the tag.** The kind of quantity, the instant of
  measurement and the instrument belong to the structure carrying the reading,
  exactly as they do on the wire (specification Section 6a).

## 9. How this is tested

- Every reading of specification Section 5, written and read back against the
  specification's own bytes.
- Every registered unit against every SI prefix, every whole power in
  −9…9 and every rational power in a small set, in both the canonical and the
  ASCII spelling — deterministically, because the collisions this format can
  suffer from are structured rather than random.
- A hundred thousand generated readings per run, checking that text reads back
  to identical bytes, and that writing what was read reproduces the text.
- Arbitrary strings, checking that the parser either reads them or rejects
  them and never does anything else.

The first two rules of Section 4.3 and the third rule of Section 5 were each
added because a generated reading found them missing.
