# GitHub Copilot Instructions for NEXUS HRMS

You MUST strictly adhere to the Gitflow branching strategy defined in `GIT_WORKFLOW_RULES.md`.

- NEVER commit directly to `master`.
- Always branch off `develop` as `feature/<name>` for new features or `bugfix/<name>` for bugfixes.
- Run `npm run test:unit --prefix Backend` and `npm run db:test` before merging.
- Always merge with `--no-ff`.
- Production hotfixes must branch off `master` as `hotfix/<name>`, merge to `master` with a new tag, and merge back to `develop`.
