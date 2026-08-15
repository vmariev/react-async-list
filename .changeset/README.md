# Changesets

Every change that should appear in the changelog gets a small markdown file in
this folder, written by `npm run changeset`. The file records which bump the
change deserves (patch / minor / major) and a one-line description.

Workflow:

```bash
npm run changeset          # describe your change, commit the generated file
npm run version            # consume the files: bumps package.json, writes CHANGELOG.md
```

Then push, and publish by creating a GitHub release — the publish workflow builds
and pushes to npm.

Why bother rather than editing `CHANGELOG.md` by hand: the description is written
while the change is fresh, in the same pull request, so the changelog cannot
drift from what actually shipped. See
[the changesets docs](https://github.com/changesets/changesets) for details.
