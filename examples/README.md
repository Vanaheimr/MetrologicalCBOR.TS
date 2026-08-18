# Examples

Six programs, each one runnable and each one printing something you can check
against the specification.

```bash
npx tsx examples/01-a-reading.ts
```

They import from `../src` rather than from the published package, so they run
against the working tree — which is also what makes them tests:
`tests/examples.test.ts` runs every one of them and fails if the output stops
saying what it says here.

| | |
|---|---|
| [01-a-reading.ts](01-a-reading.ts) | A reading on the wire and back, in nine bytes. What the decimal scale is for, why the same reading always produces the same bytes, and what is refused |
| [02-a-document-through-json.ts](02-a-document-through-json.ts) | The worked example's meter payload as a plain JSON object, and back. The integer JSON cannot hold, and the three ways to decide which strings are readings |
| [03-an-uncertainty.ts](03-an-uncertainty.ts) | A calibration certificate as it was issued. Why `U = 0.12 V, k = 2` is not stored as `u = 0.06 V`, and why "not stated" is not "zero" |
| [04-a-foreign-document.ts](04-a-foreign-document.ts) | Finding every reading in a 713-byte signed record this library did not write, including the ones inside signed payloads, without disturbing a byte |
| [05-a-private-unit.ts](05-a-private-unit.ts) | A unit the registry has never heard of, in the private-use range — and why registries are immutable |
| [06-verify-a-signed-record.ts](06-verify-a-signed-record.ts) | The four signatures over the worked example, verified. Needs one dependency; see below |

## The signature example

This library does no cryptography and never will. Signing belongs to COSE, and
a data format that also carried a crypto stack would be unusable as the leaf of
somebody else's schema. What the library does is produce the bytes a signature
is over, *exactly*, and example 06 is what checks that claim:

```
station   ES256   verifies
          re-sign reproduces the recorded signature byte for byte

meter[0]  ESB256  verifies   (1234.567 ±12.3) kWh, k=2, p=0.95, dist=normal
meter[1]  ESB256  verifies   (1259.869 ±12.6) kWh, k=2, p=0.95, dist=normal

operator  ES384   verifies

meter     kid     matches C6738177A6E6D04B
station   kid     matches 4F4E4267CBA43440
operator  kid     matches 6B1F337BA0EC88BB
```

The second line is the stronger claim. The specification signs deterministically
(RFC 6979), so a signature is a function of what it signs — re-signing the
`Sig_structure` this library builds reproduces the recorded signature byte for
byte, which a construction that differed by one byte could not do.

The key identifiers are recomputed too: an [RFC 9679](https://www.rfc-editor.org/rfc/rfc9679)
thumbprint is the hash of a COSE key's own canonical CBOR encoding, so the
deterministic encoder is what checks that the key you were handed is the key the
record names.

It needs `@noble/curves`, which lives in [package.json](package.json) here
rather than in the library's own, so that a root `npm ci` — which is what CI
runs — never installs a cryptography library to test a data format:

```bash
cd examples && npm install && cd ..
npx tsx examples/06-verify-a-signed-record.ts
```

Without it the example says so and exits cleanly, and its test skips rather
than fails.

**A verifier's detail worth knowing.** ECDSA has two valid signatures for every
message, `(r, s)` and `(r, n − s)`. Several libraries reject the second by
default — an anti-malleability policy that Bitcoin made conventional and that
COSE does not impose. The meter here signs without normalising, so a verifier
insisting on the low form rejects a perfectly valid signature. The example
passes `lowS: false` and says why.

## The keys

From Section 7 of the specification. They were generated for that document,
they secure nothing, and they must never appear anywhere else.
