# Releasing

Publishing is a maintainer's action, by hand, with multi-factor authentication,
from a trusted machine. **No credential that can publish this package exists in
this repository, and none should.**

**0.10.0 was released that way on 2026-08-21** and is the first version of this
package on npm. What follows is the process it went through, and the two things
it taught, written where the next release will meet them.

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

[`.github/workflows/tag.yml`](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/.github/workflows/tag.yml)
runs on a `v*` tag. It has `contents: read` and no secrets at all, so it
*cannot* publish. It

1. refuses the tag if it does not match the version in `package.json`;
2. runs `npm run verify`;
3. runs it again on a bare clone, without fetching the specification — the
   configuration a publish actually runs in, and the one that broke three
   attempts at 0.9.1;
4. rehearses the tarball with `npm pack --dry-run`.

It answers the question a maintainer has at that exact moment — *is the thing I
just tagged good?* — and then stops, because the next step is yours. For 0.10.0
that is how it went: the tag was pushed at 20:01 local time, the workflow went
green, and `npm publish` was typed at 20:04.

## Cutting one

Every line below runs on your machine. `1.0.0` stands for the version being cut.

**Check what a release checks, plus the one thing it cannot.**

```bash
npm run verify
```

```bash
npm install --prefix examples && npm run typecheck:examples
```

The second is not optional and not part of `verify`: the examples are a package
of their own, because one of them needs a cryptography library that the library
under test does not have and must not acquire. The root type check therefore
cannot see them, and the first release attempt at 0.9.1 failed on exactly that —
they type-checked on the machine that had installed their dependency and nowhere
else.

**Set the version and write the changelog entry.**

```bash
npm version 1.0.0 --no-git-tag-version
```

`--no-git-tag-version`, because the tag is made and signed below rather than by
npm. The version in `package.json` and the heading in
[../CHANGELOG.md](../CHANGELOG.md) must agree: the tag workflow compares the tag
against the first and a reader compares it against the second. Check what is
under `## [Unreleased]` before choosing the number — if it holds behaviour
changes, a patch is the wrong shape, and 0.9.1 became 0.10.0 for exactly that
reason. Move what this release contains out of `[Unreleased]` and under the new
heading while you are there; it is easier now than when somebody is diffing the
tarball against the repository.

**Read the README as a stranger holding only the tarball.** It is published with
the package, it is the page npm renders, and it is frozen at whatever it said
when you published — see below. Every link in it must be absolute.

**Rehearse the tarball, then build it.**

```bash
npm pack --dry-run
```

```bash
npm pack
```

Read the file list. It should be `dist/`, the markdown documents under `docs/`,
the licence, the notice, the readme and the changelog — around 80 files and a
little over a megabyte, most of it source maps. 0.10.0 was 80 files and 1.29 MB
unpacked. `tests/bundle.test.ts` asserts that shape, including that the
generated API reference is *not* in it.

**Tag it, push it, and let the tag workflow answer.**

```bash
git tag -s v1.0.0 -m "v1.0.0"
```

```bash
git push origin v1.0.0 && git push git1 v1.0.0 && git push git2 v1.0.0
```

A signed tag, because it is what the release is identified by — and because "npm
carries the bytes of this commit" is only a checkable claim while the tag still
points where it pointed when you published.

**Then, and only once that run is green, publish by hand:**

```bash
npm login
```

```bash
npm whoami
```

```bash
npm publish
```

npm will ask for your second factor. `publishConfig.access` is `public`, which a
scoped package needs on its first publish; there is no `provenance` setting,
because provenance from a laptop is not possible and pretending otherwise only
produces a failed publish.

Afterwards, check that what arrived is what you meant to send:

```bash
npm view @vanaheimr/metrological-cbor version dist.fileCount dist.unpackedSize
```

## What the first one taught

Nothing about the *package* was wrong. Two things about the **README** were, and
both are particular to publishing rather than to this library.

**npm showing no README is not a packaging defect.** The website said the
package had none for a while after 0.10.0 went up, which reads exactly like a
`files` manifest that forgot it. It was not: the registry metadata named the file
and the 14.4 kB document was in the tarball the whole time. The page caught up on
its own. Ask the registry before believing the website:

```bash
npm view @vanaheimr/metrological-cbor readmeFilename readme
```

**A README is part of the release, not part of the repository.** Two things
follow, and the second is the one that costs.

*Its links must be absolute.* A relative link is right on GitHub and wrong on a
registry page, and wrong again for a reader holding only the tarball: four of the
nine targets the 0.10.0 README pointed at — `CONTRIBUTING.md`, `SECURITY.md` and
two files under `examples/` — are deliberately not in the published package at
all. The rule generalises to the documents under `docs/`, which ship as well:
**link relatively where the target ships, absolutely where it does not.**
[conformance.md](conformance.md) is the deliberate exception — it is a map of the
source tree, meant to be read beside it, and its line-anchored links into `src/`
are checked by `tests/conformance.test.ts`.

*And a README fixed after the publish does not reach npm.* npm renders the README
of the tarball it was handed. The 0.10.0 links were made absolute two commits
after the release, so the npm page keeps the older README until the next version
is cut, while GitHub shows the newer one. Nothing can be done about that except
cut the next version, and nothing should be: republishing a version to fix its
prose is worse than the prose.

## Before 1.0.0

Version 1.0.0 waited on one thing that is not in this repository: the **IANA
registration of tag 44252**. The specification says the numeric identifications
become permanent with it, and until they were permanent this library had no
business promising that its API is.

**That is done.** IANA assigned 44252 on **2026-08-19** under the registry's
First Come First Served policy —
<https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml>. The tag number
still lives in exactly one constant,
[src/tag.ts](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/src/tag.ts),
mirroring the specification's own guidance; the contingency it existed for — the
number being taken first — never arose, and the constant is now simply where the
number lives.

So 1.0.0 is a decision rather than a wait, and the path it would take is no
longer theoretical. What it takes:

- set the version to `1.0.0` and say in the changelog what the registration is;
- state in the README that the API is stable and that breaking changes now need
  a major version;
- tag `v1.0.0` and publish it the same way as any other.

## Where the versions went

| Version | What it was | Where it went |
|---|---|---|
| 0.1.0 | the tag 44252 codec (WP4) | the repository |
| 0.2.0 | the text format (WP5) | the repository |
| 0.3.0 | documents between CBOR and JSON (WP6) | the repository |
| 0.9.0 | hardening, fuzzing and the conformance matrix — the API freeze (WP7) | the repository |
| 0.9.1 | documentation, examples and the release machinery (WP8) | tagged three times, published never |
| 0.10.0 | the specification's conformance decisions | **npm, 2026-08-21** — the first |
| 1.0.0 | not made; the IANA registration it waited on was recorded 2026-08-19 | — |

Everything up to and including 0.9.1 was recorded in
[../CHANGELOG.md](../CHANGELOG.md) and in the git history and never left the
repository. Three attempts at 0.9.1 failed ahead of the publish step, for the
three reasons recorded in
[WORKPLAN.md](https://github.com/Vanaheimr/MetrologicalCBOR.TS/blob/master/WORKPLAN.md)
under WP8 — read them before cutting the next one, because all three were a check
that CI ran and `npm run verify` did not.
