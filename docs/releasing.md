# Releasing

Publishing is a maintainer's action, not a workflow's. This is what it takes and
what each step is for.

## What publishes, and what triggers it

`.github/workflows/release.yml` runs on a `v*` tag and on nothing else. It

1. runs `npm run verify` — the registry check, the type checker, the linter, the
   build and the whole test suite;
2. refuses to continue if the tag does not match `package.json`'s version, so a
   `v1.2.3` tag cannot publish a `1.2.4`;
3. publishes with `--provenance --access public`.

**Provenance** is the reason step 3 lives in a workflow rather than on a laptop.
npm signs the package with an OIDC token issued to that workflow run, so anyone
can check which commit, in which repository, produced the bytes they installed.
A package published from a developer's machine carries no such statement, and
for a library that reads legally relevant measurement data the statement is the
point. It needs `id-token: write`, which the workflow has, and an `NPM_TOKEN`
secret in the `release` environment.

## Cutting one

Everything below runs on the maintainer's machine except the last line, which
runs itself.

```bash
npm run verify
npm install --prefix examples && npm run typecheck:examples
```

The second line is not optional and not part of `verify`: the examples are a
package of their own, because one of them needs a cryptography library that the
library under test does not have and must not acquire. The root type check
therefore cannot see them, and the first release attempt failed on exactly that
— the examples type-checked on the machine that had installed their dependency
and nowhere else.

Then set the version and write the changelog entry — the version in
`package.json` and the heading in `CHANGELOG.md` must agree, because the
workflow compares the tag against the first and a reader compares it against the
second.

Rehearse the tarball before tagging anything:

```bash
npm publish --dry-run
```

Read the file list. It should be `dist/`, the two markdown documents under
`docs/`, the licence, the notice, the readme and the changelog — about 77 files
and a little over a megabyte, most of it source maps. `tests/bundle.test.ts`
asserts that shape, including that the generated API reference is *not* in it;
if you have changed the `files` manifest, that test is what tells you.

Then:

```bash
git tag -s v0.10.0 -m "v0.10.0" && git push origin v0.10.0
```

A signed tag, because the tag is what authorises the publish. Pushing it to
`origin` is what starts the workflow; the other two remotes mirror the code and
do not publish.

## Before 1.0.0

Version 1.0.0 is gated on one thing that is not in this repository: the **IANA
registration of tag 44252**. The specification says the numeric identifications
become permanent with it, and until they are permanent this library should not
promise that its API is.

The tag number lives in exactly one constant, [src/tag.ts](../src/tag.ts),
mirroring the specification's own guidance — if 44252 is taken before the
registration completes, one line changes and every test that reads the constant
follows.

When the registration is recorded:

- set the version to `1.0.0` and say in the changelog what the registration is;
- state in the README that the API is stable and that breaking changes now need
  a major version;
- tag `v1.0.0`.

## Where the versions went

| | |
|---|---|
| 0.1.0 | the tag 44252 codec (WP4) |
| 0.2.0 | the text format (WP5) |
| 0.3.0 | documents between CBOR and JSON (WP6) |
| 0.9.0 | hardening, fuzzing and the conformance matrix — the API freeze (WP7) |
| 0.9.1 | documentation, examples and the release machinery (WP8) |
| 0.10.0 | the specification's conformance decisions — **the first version on npm** |
| 1.0.0 | gated on the IANA registration |

Everything up to and including 0.9.1 was tagged in this changelog and in the git
history and never left the repository. 0.10.0 is the first that did. Three
attempts at 0.9.1 failed ahead of the publish step, for the three reasons
recorded in [WORKPLAN.md](../WORKPLAN.md) under WP8 — read them before cutting
the next one, because all three were a check that CI ran and `npm run verify`
did not.
