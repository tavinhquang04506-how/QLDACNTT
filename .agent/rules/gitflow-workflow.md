# Gitflow Workflow Rule for Antigravity & Agentic AIs

When working on NEXUS HRMS, you MUST adhere to the Gitflow branching strategy.

## Critical Instructions:
1. **Never Commit Directly to `master`**:
   - `master` is for Production releases only.
   - It only receives merges from `release/vX.Y` or `hotfix/*` with an annotated Git tag.

2. **Branching Workflow for New Features**:
   - Always branch off `develop`:
     `git checkout develop`
     `git checkout -b feature/<module>-<feature> develop`
   - Complete implementation.
   - Run verification commands:
     - `npm run test:unit --prefix Backend`
     - `npm run db:test`
     - `npm run build --prefix FrontEnd`
   - Merge back to `develop` with `--no-ff`:
     `git checkout develop`
     `git merge --no-ff feature/<module>-<feature> -m "Merge branch 'feature/<module>-<feature>' into develop"`

3. **Hotfix Workflow for Critical Bugs**:
   - Branch off `master`:
     `git checkout -b hotfix/<bug-name> master`
   - Fix and verify with tests.
   - Merge to `master` with `--no-ff` and tag.
   - Merge to `develop` with `--no-ff`.

4. **Always Use `--no-ff`**:
   - Fast-forward merges destroy the branch topology graph required by academic and enterprise audits.
   - Always use `--no-ff`.
