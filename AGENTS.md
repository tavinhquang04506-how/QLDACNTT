# AGENTS.md — Mandatory AI Behavior & Gitflow Protocol

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS (Antigravity, Cursor, Copilot, Cline, Claude Code, ChatGPT, etc.):**
> You are operating within the enterprise repository **NEXUS HRMS**.
> You MUST automatically follow the Gitflow branching workflow described below for EVERY task without needing the user to mention it.

---

## 🚨 AUTOMATIC EXECUTION RULES (MANDATORY)

Whenever the user asks you to:
- Add a new feature / screen / API / component
- Fix a bug / issue / performance problem
- Refactor code / update documentation
- Work on any task that involves modifying code

You **MUST AUTOMATICALLY** execute these steps:

### 1. Identify the Branch Type:
- **New Feature / Improvement**: Must branch off `develop` as `feature/<module>-<description>`
- **Sprint Bug Fix**: Must branch off `develop` as `bugfix/<issue-name>`
- **Production Critical Bug**: Must branch off `master` as `hotfix/<issue-name>`
- **Release Preparation**: Must branch off `develop` as `release/vX.Y`

### 2. Check Out the Branch First BEFORE Writing Code:
```bash
# For new feature:
git checkout develop
git checkout -b feature/<feature-name> develop
```

### 3. Implement Code & Verify (Quality Gate):
Before finishing, you MUST run:
```bash
npm run test:unit --prefix Backend
npm run db:test
```
Ensure all tests pass 100%.

### 4. Merge Back to `develop` with `--no-ff`:
```bash
git checkout develop
git merge --no-ff feature/<feature-name> -m "Merge branch 'feature/<feature-name>' into develop"
```
**NEVER use Fast-Forward merge.** `--no-ff` is strictly required to preserve graph topology.

### 5. Never Commit Directly to `master`:
`master` only receives code from `release/*` or `hotfix/*` with an annotated Git Tag (`vX.Y`).

Refer to `GIT_WORKFLOW_RULES.md` for full specification.
