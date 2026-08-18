# Contributing

Thank you for considering a contribution. This library implements a
specification that legal metrology depends on, so a few of the rules below are
stricter than in an average TypeScript project. They exist because a wrong
number here is worse than a missing feature.

## Getting started

```bash
npm ci
npm run verify
```

`verify` runs the registry check, the type checker, the linter, the tests and
the build — the same sequence as CI. Run it before opening a pull request.

## Project language

English, everywhere: code, identifiers, comments, documentation, commit
messages, issues and pull requests.

## The rules that are not negotiable

1. **No binary floating point in metrological values.** The specification
   (Section 3.1) forbids it, because an IEEE 754 double can represent neither
   `0.1` exactly nor a decimal scale at all. Values are `bigint` mantissas with
   integer exponents; formatting and parsing are exact string arithmetic. ESLint
   enforces this in `src/model/`, `src/codec/` and `src/text/`.

2. **The written representation is data.** `4([-1, 50])` (5.0) and `5` denote
   the same quantity but different measurement resolutions, and both must
   survive a decode/encode round trip unchanged. The same holds for a unit
   written as an identification versus its symbol. Never normalise away a
   distinction the wire made.

3. **Reject, never guess.** An unknown unit, an out-of-range prefix or a value
   that cannot be represented exactly is an error. Substituting a placeholder
   or rounding silently attributes a measurement to something it is not.

4. **The unit registry is generated, not edited.** `src/registry/units.json` is
   the single source of truth; `src/registry/units.generated.ts` is produced
   from it by `npm run generate:registry`. Editing the generated file is
   pointless — CI regenerates and compares. A change to the registry data must
   correspond to a change in the specification, never the other way round.

5. **Every normative requirement gets a test.** New behaviour derived from the
   specification cites its clause in the test name, so `docs/conformance.md`
   stays traceable.

## Tests

- Golden vectors from Section 5 of the specification are byte-exact, in both
  directions. They are not to be "adjusted" — if a vector fails, the code is
  wrong.
- Negative tests belong to every normative MUST.
- Property-based round trips guard the three representations against each
  other: bytes, model, text.
- The fuzz suites in `tests/fuzz` measure how often their corpus is *accepted*,
  not only what it produces. Every other property there is of the form "if it
  was accepted, then …", which holds vacuously over a corpus that has stopped
  reaching the decoder — and a fuzzer that reports green while covering nothing
  is worse than none. If you narrow the corpus, expect those floors to fail,
  and fix the corpus rather than the floor.

## Documentation

- Every exported function, class and interface carries a doc comment saying
  what it is for, not what it does. `npm run docs:api` builds the reference.
- Typedoc's `notDocumented` check is deliberately off. What it reports is the
  discriminant and payload fields of tagged unions — `CborInt.type` is `'int'`,
  `DecimalFraction.mantissa` is a `bigint` — where a sentence restates the type
  and nothing else. A hundred such warnings hide the one that matters, so what
  stays on is the check for a symbol reachable from the API and not exported,
  and the one for a link that goes nowhere. Both are errors.
- `docs/conformance.md` is tested. A new error code that does not say which
  clause it enforces fails `tests/conformance.test.ts`.
- The examples in `examples/` are tested too, by running them. Documentation
  that is not executed rots, and a rotted example is the first thing a reader
  meets.

## Commits and pull requests

- One logical change per pull request; keep the diff reviewable.
- Reference the work package from [WORKPLAN.md](WORKPLAN.md) where it applies.
- Update `CHANGELOG.md` under `## [Unreleased]`.
- New source files carry the Apache-2.0 header used by the existing files.

## Reporting specification problems

If the specification under `spec/` contradicts itself or the byte-level
examples, open an issue. Do not work around it in code — a divergence between
implementation and specification is the one bug this project cannot afford.

## Security

Please report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the
Apache License 2.0, as described in [LICENSE](LICENSE).
