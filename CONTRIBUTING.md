# Contributing to Perimeter

Thanks for helping build Perimeter. This page covers how work moves through the repository.

## Branches

There are two shared branches:

- `develop`: the working branch. All finished work lands here.
- `main`: released code only. It is updated by merging `develop` into it.

No other branches are allowed on the remote. GitHub blocks creating them.

## Making a change

1. Pull the latest `develop`.
2. Make your change locally.
3. Open a pull request into `develop` and request review. CODEOWNERS requests the owner of each area you touched.
4. Get one approval from someone other than yourself.
5. Merge with **Squash and merge**. The branch is removed automatically after merge.

Required checks must pass before merge: the correlation engine tests, the BFF build, and docker-compose validation.

## Releases

When `develop` is stable, the repository owner opens a pull request from `develop` into `main` and merges it. No extra approval is needed for this step, because the `develop` changes were already approved.

## Commit messages

Use the form `type(scope): summary`, for example:

- `feat(engine): add blast-radius depth limit`
- `fix(bff): reject alerts with empty payload`
- `ci: cache pip dependencies`
- `docs: explain local stack setup`

Common types: `feat`, `fix`, `ci`, `docs`, `chore`, `test`, `refactor`.

## Ownership

Areas and owners are listed in [.github/CODEOWNERS](.github/CODEOWNERS) and in [TEAM_ROLES.txt](TEAM_ROLES.txt) where the team keeps it.

## Running things locally

- Local dependencies: see [deploy/README.md](deploy/README.md).
- Correlation engine tests: `cd services/correlation-engine && python3 -m pytest tests/`
- Demo: `./scripts/demo.sh`
