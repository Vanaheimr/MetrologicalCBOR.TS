# Releasing

Publishing is a maintainer's action, by hand, with multi-factor authentication,
from a trusted machine. **No credential that can publish this package exists in
this repository, and none should.**

## Why it is not automated

npm has been the target of a long run of supply-chain attacks, and the two
things they take are the same two things an automated release needs: a
publishing credential that can be stolen, and a maintainer who can be talked
into granting one. The second arrives as friendly mail offering to donate code
or help maintain the project.

An npm **automation token** — the kind a workflow needs — is a bearer secret
that bypasses two-factor authentication *by design*. That is what makes it work
unattended, and it is exactly what makes it worth stealing. Anything that can
read the repository's secrets can publish: a compromised workflow, a malicious
build-time dependency, a pull request that changes a workflow file. Two factors
protecting the account mean nothing if a token beside it can publish without
them.

So the trade is made deliberately and in the other direction: this project gives
up unattended releases and npm **provenance** with them, and keeps the property
that publishing requires a human holding a second factor.

Provenance is a real loss and worth naming. It is npm's signed attestation of
which commit, in which repository, produced the bytes — for a library that reads
legally relevant measurement data, a statement worth having. It requires an OIDC
token from a CI run, which is why it cannot be had from a laptop. The one way to
keep both is npm's **trusted publishing**, which authorises a specific
repository and workflow to publish without any stored secret; if that becomes
available for this scope, it is the setting to revisit, and this document is
where the reasoning above should be argued with.

Meanwhile the tag verification below carries part of the same weight: it says
publicly which commit was tagged and that it was green when it was.

## What the tag workflow does, and what it does not

[`.github/workflows/tag.yml`](../.github/workflows/tag.yml) runs on a `v*` tag.
It has `contents: read` and no secrets at all, so it *cannot* publish. It

1. refuses the tag if it does not match `package.json`'s version;
2. runs `npm run verify`;
3. runs it again on a bare clone, without fetching the specification — the
   configuration a publish actually runs in, and the one that broke three
   attempts at 0.9.1;
4. rehearses the tarball with `npm pack --dry-run`.

It answers the question a maintainer has at that exact moment — *is the thing I
just tagged good?* — and then stops, because the next step is yours.

## Cutting one

Every line below runs on your machine.

```bash
npm run verify
npm install --prefix examples && npm run typecheck:examples
```

The second is not optional and not part of `verify`: the examples are a package
of their own, because one of them needs a cryptography library that the library
under test does not have and must not acquire. The root type check therefore
cannot see them, and the first release attempt failed on exactly that — they
type-checked on the machine that had installed their dependency and nowhere
else.

Then set the version and write the changelog entry. The version in
`package.json` and the heading in `CHANGELOG.md` must agree, because the tag
workflow compares the tag against the first and a reader compares it against the
second. Check what is under `## [Unreleased]` before choosing the number: if it
holds behaviour changes, a patch is the wrong shape, and 0.9.1 became 0.10.0 for
exactly that reason.

Rehearse the tarball before tagging anything:

```bash
npm publish --dry-run
```

Read the file list. It should be `dist/`, the markdown documents under `docs/`,
the licence, the notice, the readme and the changelog — around 80 files and a
little over a megabyte, most of it source maps. `tests/bundle.test.ts` asserts
that shape, including that the generated API reference is *not* in it.

Then tag, push it, and let the tag workflow answer:

```bash
git tag -s v0.10.0 -m "v0.10.0"
git push origin v0.10.0 && git push git1 v0.10.0 && git push git2 v0.10.0
```

A signed tag, because it is what the release is identified by.

**Then, and only once that run is green, publish by hand:**

```bash
npm publish
```

npm will ask for your second factor. `publishConfig.access` is `public`, which a
scoped package needs on its first publish; there is no `provenance` setting,
because provenance from a laptop is not possible and pretending otherwise only
produces a failed publish.

Afterwards, check that what arrived is what you meant to send:

```bash
npm view @vanaheimr/metrological-cbor version
npm view @vanaheimr/metrological-cbor dist.tarball
```

## Before 1.0.0

Version 1.0.0 waited on one thing that is not in this repository: the **IANA
registration of tag 44252**. The specification says the numeric identifications
become permanent with it, and until they were permanent this library had no
business promising that its API is.

**That is done.** IANA assigned 44252 on **2026-08-19** under the registry's
First Come First Served policy —
<https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml>. The tag number
still lives in exactly one constant, [src/tag.ts](../src/tag.ts), mirroring the
specification's own guidance; the contingency it existed for — the number being
taken first — never arose, and the constant is now simply where the number
lives.

What 1.0.0 takes, whenever it is made:

- set the version to `1.0.0` and say in the changelog what the registration is;
- state in the README that the API is stable and that breaking changes now need
  a major version;
- tag `v1.0.0` and publish it the same way as any other.

## Where the versions went

| | |
|---|---|
| 0.1.0 | the tag 44252 codec (WP4) |
| 0.2.0 | the text format (WP5) |
| 0.3.0 | documents between CBOR and JSON (WP6) |
| 0.9.0 | hardening, fuzzing and the conformance matrix — the API freeze (WP7) |
| 0.9.1 | documentation, examples and the release machinery (WP8) — tagged three times, published never |
| 0.10.0 | the specification's conformance decisions |
| 1.0.0 | not made; the IANA registration it waited on was recorded 2026-08-19 |

Everything up to and including 0.9.1 was recorded in this changelog and in the
git history and never left the repository. Three attempts at 0.9.1 failed ahead
of the publish step, for the three reasons recorded in
[WORKPLAN.md](../WORKPLAN.md) under WP8 — read them before cutting the next one,
because all three were a check that CI ran and `npm run verify` did not.
