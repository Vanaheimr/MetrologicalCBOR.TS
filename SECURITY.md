# Security Policy

## Reporting a vulnerability

Please report security issues privately to
**achim.friedland@graphdefined.com**, or through GitHub's
[private vulnerability reporting](https://github.com/Vanaheimr/MetrologicalCBOR.TS/security/advisories/new).

Do not open a public issue for a vulnerability.

We aim to acknowledge a report within three working days and to ship a fix or
a mitigation plan within 30 days.

## Supported versions

Until 1.0.0, only the latest version on npm receives fixes.

## How releases are made

Part of the threat model rather than a process note: for a package installed
from a registry, the release path is attack surface.

- **No credential that can publish this package exists in this repository.**
  There is no npm token among its secrets, and the workflow that runs on a tag
  ([`.github/workflows/tag.yml`](.github/workflows/tag.yml)) has
  `contents: read` and no secrets at all — it verifies a tagged commit and
  cannot publish one.
- **Publishing is a hand operation** from a maintainer's machine, with
  multi-factor authentication. An automation token is a bearer secret that
  bypasses two-factor authentication by design; the cost of refusing one is npm
  provenance, and that trade is argued in [docs/releasing.md](docs/releasing.md).
- **Release tags are signed**, so which commit a published version was built
  from is a checkable claim rather than an assertion.
- The package has **no runtime dependencies**: installing it adds one publisher
  to your supply chain rather than a tree of them.

Unsolicited offers to help maintain the project, to donate code, or to take
publishing off the maintainer's hands are a documented step in this class of
attack, and are treated accordingly.

## What counts as a vulnerability here

This library parses untrusted input — measurement data that arrives over a
network and is often signed and legally relevant. The following are security
issues, not merely bugs:

- **Decoder crashes, hangs or unbounded resource use.** Decimal fractions
  permit very large exponents and bignum mantissas; the decoder must bound
  what it spends on them (specification Section 7).
- **Silent misinterpretation of a value.** A reading decoded with the wrong
  unit, the wrong scale or a silently rounded mantissa is worse than a
  decoding failure. The decoder rejects what it cannot represent exactly and
  never substitutes a placeholder for an unknown unit.
- **Loss of the decimal scale.** `1.10 kWh` and `1.1 kWh` state different
  measurement resolutions. Anything that conflates them corrupts data.
- **Non-deterministic encoding.** The encoding of a value must be a pure
  function of that value, otherwise signatures over measurement data break.

## What is out of scope

- The cryptographic layer. This library does not sign or verify anything; the
  COSE example under `examples/` is illustrative and uses development
  dependencies that are never shipped in the package.
- The correctness of the specification itself. Please report specification
  problems as ordinary issues — errata are public by nature.
