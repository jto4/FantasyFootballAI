# Quarterly maintenance review

Review this repository against the current implementation plan and support matrix. This
issue is a reminder and checklist; it does not run automated security scans or replace the
required manual release reviews.

## Code and architecture

- [ ] Read `docs/tasks.md` and compare its open work with the current source and workflows.
- [ ] Review recent changes for correctness, error handling, boundary validation, and stale
      documentation.
- [ ] Review performance evidence and identify avoidable latency, memory use, or duplicated
      work.
- [ ] Identify refactoring that would improve package boundaries or reduce duplication; record
      decisions in `docs/decisions.md` and update the implementation plan when needed.
- [ ] Confirm the documented setup and supported-platform claims still match current behavior.

## Manual security review

- [ ] Follow the manual code and security review checklists in `SECURITY.md` for the reviewed
      changes and current trust boundaries.
- [ ] Confirm secrets remain in the OS credential store, service listeners stay on loopback,
      and external data remains bounded and validated.
- [ ] Record findings and fixes in `docs/tasks.md` and add a dated review note under
      `docs/reviews/` when the review discovers a material issue.
- [ ] Do not run automated security scans; they are explicitly excluded for this project.

## Closeout

- [ ] Run the documented typecheck, test, lint, formatting, and build commands after changes.
- [ ] Record reviewer, date, commit, checks performed, and unresolved items in this issue.
- [ ] Link any follow-up pull requests and carry unresolved release blockers into the next
      release review.
