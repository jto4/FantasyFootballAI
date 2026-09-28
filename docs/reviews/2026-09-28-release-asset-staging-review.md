# Release asset staging review — 2026-09-28

## Scope

Manual review of `scripts/assemble-release-assets.sh` and its fixture coverage. This is a
focused release workflow review, not an automated security scan or release-candidate approval.

## Findings and changes

- The assembler previously copied `INSTALL.md` and `LICENSE` into downloaded artifact
  directories. A pre-existing symlink at either destination could redirect the copy outside
  the artifact directory, and a successful assembly modified its inputs.
- The assembler now rejects symlinks and special files in artifact trees, copies package files
  into a private per-run staging directory, adds documentation only in that staging copy, and
  removes staging data after publishing the complete set of assets.
- Fixture coverage confirms successful assembly does not modify source artifact directories,
  a symlink to a file outside the artifact tree is rejected without changing its target, and
  failed assembly leaves the output directory empty.

## Verification and limits

- `npm run test:release`, `bash -n scripts/assemble-release-assets.sh`, `npm run format:check`,
  and `git diff --check` pass on macOS.
- This review covers the local assembly script and its controlled fixtures. It does not verify
  hosted release workflow behavior, native package provenance, signing, or publication.
