# Contributing to Perimeter

Thanks for helping build Perimeter. This page covers how work moves through the repository.

## Branches

There is one long-lived branch: `main`. It is always releasable, and every change reaches it through a pull request.

You need a short-lived branch to open a pull request. Create it from `main`, push it, and it is deleted automatically when the pull request merges. There is no `develop` branch and no release merges.

## Making a change

1. Pull the latest `main` and create a branch from it (for example `feat/router-scoring`).
2. Make your change locally and run the tests for the area you touched.
3. Push the branch and open a pull request into `main`. CODEOWNERS requests the owner of each area you touched. Auto-merge is switched on for you.
4. CI runs on the pull request. Fix anything red by pushing to the same branch.
5. Once the pull request has one approval and all required checks are green, GitHub squash-merges it.
6. After the merge, CI runs again on `main` and adds an integration job that starts the full stack (Postgres, engine, BFF), sends an alert and checks the stored incident. If it fails, fixing it is the next priority.

## Who approves

- **Teammates:** every pull request needs one approval from someone other than its author. In practice the lead (@SannidhiSriram-06) approves, and aims to do so within 15 minutes of a request. Ping the lead in the group chat when you open a PR.
- **The lead:** the lead's own pull requests can be merged by the lead once the required checks pass.
- **Checks are not optional for anyone.** Nobody merges with a failing required check, the lead included.
- Pull requests that touch infra, CI, AI or IAM always get the lead's review, whoever wrote them.

Required checks must pass before merge: correlation engine tests, BFF build, dashboard tests, test-services tests, docker-compose validation, lint, Docker image builds, and the Python and npm security audits.

Other automated checks run on every pull request and weekly:

- Lint: ruff (Python), shellcheck (scripts), actionlint (workflow files).
- Security: dependency review, `npm audit`, `pip-audit`, bandit, and CodeQL (set up in repository settings, not in a workflow file).
- Coverage: the engine tests fail below 85% coverage.

Run the same checks locally with `ruff check services/correlation_engine services/test-services` and `cd services/bff-server && npm audit --omit=dev`.

## Releases

There is no separate release step. Whatever is on `main` is the release, and the post-merge integration job is its health check.

## Commit messages

Use the form `type(scope): summary`, for example:

- `feat(engine): add blast-radius depth limit`
- `fix(bff): reject alerts with empty payload`
- `ci: cache pip dependencies`
- `docs: explain local stack setup`

Common types: `feat`, `fix`, `ci`, `docs`, `chore`, `test`, `refactor`.

## Ownership

Areas and owners are listed in [.github/CODEOWNERS](.github/CODEOWNERS).

## Running things locally

- Local dependencies: see [deploy/README.md](deploy/README.md).
- Correlation engine tests: `cd services/correlation_engine && python3 -m pytest tests/`
- Backend tests (need Postgres loaded from `deploy/db/init.sql`): `cd services/bff-server && TEST_DATABASE_URL=... npm test`
- Dashboard tests: `cd services/dashboard && npm test`
- Demo: `./scripts/demo.sh`
