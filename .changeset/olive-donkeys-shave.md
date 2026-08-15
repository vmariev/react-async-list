---
'@vmariev/react-async-list': patch
---

Documentation and repository tooling only — no runtime changes.

- Link a live [CodeSandbox](https://codesandbox.io/p/sandbox/zealous-blackwell-573gfd)
  from the top of the README, from the quick start, and from the virtualizer
  guide, so every example can be tried without cloning anything.
- Finish the virtualizer guide. It now shows the exported `useMergedRef` solving
  the one-node-two-owners problem, and points at `example/demos/Virtualized.tsx`,
  which pages 5000 rows while keeping about fifteen of them in the DOM.
- Document the release process end to end — changeset, version bump, tag, GitHub
  release — including the two things that are easiest to get wrong: `NPM_TOKEN`
  needs write access to the whole `@vmariev` scope rather than to a list of
  packages, and a published version can never be replaced.
- Remove the unused `release` script. It published outside the workflow, which
  skipped the provenance attestation and made a duplicate publish of the same
  version possible.
