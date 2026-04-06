---
name: implement-feature
description: Implement a feature from a GitHub Issue feature spec.
---

# Feature Implementation Skill

Given a GitHub Issue containing a feature spec (created by `/feature-spec`), implement the feature end-to-end: fetch the spec, explore the codebase, present a plan for confirmation, then implement.

---

## Pre-flight

1. Fetch the issue using `gh issue view <number-or-url> --repo <owner/repo> --json title,body,labels`
2. Verify it has the `feature-spec` label — if not, warn the user that this issue may not be a feature spec and ask for confirmation to proceed anyway.
3. Parse the spec sections: Scope, Requirements, Decisions, Out of Scope.

If no issue number or URL was provided, ask the user for one before proceeding.

---

## Elicitation

Ask only what cannot be inferred from the spec:

1. **Which repo?** — default to the current working directory's repo (run `gh repo view --json nameWithOwner`). Only ask if ambiguous.
2. **Scope confirmation** — summarise what you plan to build in 3–5 bullet points and ask for explicit confirmation before touching any files.

The project board URL is always `https://github.com/users/soonland/projects/5` — do NOT ask the user for it.
Set `PROJECT_OWNER=soonland` and `PROJECT_NUMBER=5` directly.

Do not ask about constraints, deadlines, or dependencies — proceed directly to scope confirmation.

Do not ask questions already answered in the spec.

---

## Implementation Protocol

Execute in this order. Complete each step fully before moving to the next. **Never start implementation without the user confirming the plan.**

After each step completes, tick its checkbox in the issue comment (see the `gh api PATCH` command above).

### Step 0 — Branch & Mark In Progress

Before touching any files:

1. Move the issue to **In Progress**:
```bash
PROJECT_OWNER=soonland
PROJECT_NUMBER=5

# Resolve project metadata dynamically
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json | jq -r '.id')
STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
  | jq -r '.fields[] | select(.name == "Status") | .id')
IN_PROGRESS_OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
  | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name | test("(?i)in.progress")) | .id')

ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
  | jq -r '.items[] | select(.content.number == <issue-number>) | .id')

gh project item-edit \
  --project-id "$PROJECT_ID" \
  --id "$ITEM_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$IN_PROGRESS_OPTION_ID"
```

2. Assign the issue to the current user:
```bash
/opt/homebrew/bin/gh issue edit <issue-number> --add-assignee @me --repo <owner/repo>
```

3. Create a feature branch:
```bash
git checkout -b feat/<kebab-case-slug>
```
The slug should be 3–5 words describing the feature (e.g. `feat/theme-switcher`, `feat/employee-export`). Never implement directly on `main`.

### Step 1 — Explore

Before writing a single line, read the relevant parts of the codebase:
- Identify which files will need to change based on the spec's Scope field.
- Read every file you plan to modify — never edit blind.
- Note existing patterns (naming, imports, component structure) and follow them exactly.
- Check for existing tests covering the areas you will touch.

### Step 2 — Present the Plan

Output a numbered implementation plan:

```
FEATURE: <title>
ISSUE: <url>

CHANGES:
  1. <file path> — <what changes and why>
  2. <file path> — <what changes and why>
  ...

DB CHANGES: <list any schema/migration changes, or "none">
NEW FILES: <list new files, or "none">
TESTS: <list test files to add/update — required, not optional>

RISKS / ASSUMPTIONS:
  - <any assumption made that the user should validate>
```

Ask: "Does this plan look correct? Should I proceed?"

Do not proceed until the user confirms.

Once confirmed, post the plan as a comment on the issue. Format it as a task list so progress can be tracked — save the comment URL returned by `gh` (you'll need it to edit the comment later):
```bash
gh issue comment <issue-number> --repo <owner/repo> --body "$(cat <<'EOF'
## Implementation Plan

<paste the CHANGES / DB CHANGES / NEW FILES / TESTS / RISKS block here>

## Progress

- [ ] Step 3 — Implement
- [ ] Step 4 — Tests
- [ ] Step 5 — Breaking Change Check
- [ ] Step 6 — Lint & Typecheck
- [ ] Step 8 — Smoke Test
- [ ] Step 9 — PR created

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

After each step completes, edit the comment to check off the corresponding box:
```bash
# Get the comment ID first (if not saved from creation)
COMMENT_ID=$(gh issue view <issue-number> --repo <owner/repo> --json comments \
  | jq -r '.comments | last | .id // empty')

gh api repos/<owner/repo>/issues/comments/$COMMENT_ID \
  --method PATCH \
  --field body="<updated body with checked boxes>"
```

### Step 3 — Implement

Execute the plan in order. For each file:
- Read the full file first if you haven't already.
- Make the minimum change required — do not refactor surrounding code.
- Follow existing conventions exactly (naming, imports, formatting, lint rules).
- After each significant change, state what was done and why.

Before every commit, run the full test suite and confirm it is green:

```bash
npm test
```

If any existing tests break due to your changes (e.g. renamed IDs, changed colours, updated defaults), fix or update those tests **in the same commit** as the code change — never commit with a red test suite.

Commit logical groups of changes using **Conventional Commits** format:
```
<type>(<scope>): <short description>

[optional body]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Types:
| Type | When to use |
|---|---|
| `feat` | New capability visible to users |
| `fix` | Bug fix |
| `chore` | Build, deps, config — no production code change |
| `test` | Adding or updating tests |
| `refactor` | Code change with no behaviour change |
| `docs` | Documentation only |

Scope is optional but recommended — use the component name (e.g. `feat(nexus-terminal-game): connectivity builder`).

Never bundle unrelated changes in one commit. Prefer multiple small commits over one large one.

### Step 4 — Tests

Write unit tests for the feature before considering it complete:
- Identify the test framework in use (check `package.json` — typically Vitest in this repo).
- Follow existing test file conventions — location, naming, import style.
- Cover: happy path, edge cases, and any branching logic introduced.
- Target **≥ 90% code coverage** on new code. Edge cases that require excessive infrastructure setup may be omitted — document them with a `// TODO: test` comment.
- Use the `vitest-unit-tester` agent for writing the tests.
- Run the test suite and confirm all tests pass before proceeding.

**A feature is not complete without passing tests at ≥ 90% coverage.**

### Step 5 — Breaking Change Check

Before moving on, explicitly verify:
- Any interface, type, or component prop that was changed — find all call sites and confirm they compile.
- Any re-export or backward-compat shim added — confirm it is actually needed; remove it if nothing uses it.
- If session/JWT fields were added or changed: note that the token is not updated until the user's next login. Document this as a known limitation in the PR description if it affects user-visible behaviour.

### Step 6 — Lint & Typecheck Gate

Before smoke testing, run the full static analysis suite and fix any issues:

```bash
npm run lint
npm run build
```

- Fix all ESLint errors. Do not suppress rules with `// eslint-disable` unless the rule is genuinely inapplicable and you explain why in a comment.
- Fix all TypeScript errors. Do not use `as any` or `@ts-ignore` to silence type errors.
- Re-run until both commands exit cleanly before proceeding.

### Step 8 — Smoke Test

Start the dev server and manually verify the happy path end-to-end:
- Walk through the primary user flow described in the spec's Requirements section.
- Confirm each Success Metric from the spec is satisfied. For each metric, state explicitly whether it passes or fails.
- If a metric cannot be verified locally (e.g. a contrast ratio audit), note it as a follow-up in the PR.

### Step 9 — PR

Create a pull request. Group the summary by concern (DB & Auth, UI, API, etc.) — not per file. Include `Closes #<issue-number>` so GitHub auto-closes the issue on merge.

```bash
gh pr create \
  --title "feat: <feature name>" \
  --body "$(cat <<'EOF'
## Summary

**<Group 1 — e.g. Engine>**
- <what changed and why>

**<Group 2 — e.g. Tests>**
- <what changed and why>

Closes #<issue-number>

## Test plan
- [ ] Unit tests pass (≥ 90% coverage)
- [ ] Typecheck passes
- [ ] Smoke tested: <describe what was manually verified>

## Known limitations
<deferred metrics, or anything explicitly out of scope — omit section if none>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

`Closes #<issue-number>` in the body is sufficient — GitHub will auto-close the issue and move it to **Done** when the PR is merged.

Post a comment on the issue linking the PR:
```bash
/opt/homebrew/bin/gh issue comment <issue-number> --repo <owner/repo> --body "$(cat <<'EOF'
Implementation complete — PR: <pr-url>

<one-line summary per concern group>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

After the PR is created, move the issue to **In Review**:
```bash
PROJECT_OWNER=soonland
PROJECT_NUMBER=5

PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json | jq -r '.id')
STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
  | jq -r '.fields[] | select(.name == "Status") | .id')
IN_REVIEW_OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
  | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name | test("(?i)review|approval|waiting")) | .id' \
  | head -1)

ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
  | jq -r '.items[] | select(.content.number == <issue-number>) | .id')

gh project item-edit \
  --project-id "$PROJECT_ID" \
  --id "$ITEM_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$IN_REVIEW_OPTION_ID"
```

---

## Rules

- **Branch first.** Always create a `feat/<slug>` branch before any file changes. Never commit to `main`.
- **Confirm before implementing.** Never edit files before the user approves the plan.
- **Minimum change principle.** Only touch what the spec requires. Do not clean up unrelated code, add extra abstractions, or implement nice-to-haves not listed as requirements.
- **Out of Scope is a hard boundary.** If a spec section says something is out of scope, do not implement it even if it seems easy.
- **Decisions are settled.** Do not re-open resolved decisions from the spec's Decisions table.
- **Read before editing.** Always read a file in full before modifying it.
- If the spec is ambiguous about a requirement, ask before implementing — do not guess.
- If the feature involves a workflow, offer to run `/workflow` or `/implement-workflow` for that part.

---

## Supported Scopes

| Scope | Where to look |
|---|---|
| Game engine | `src/engine/` — command resolution, state mutations |
| Game data | `src/data/` — anchor nodes, procedural generators |
| Types | `src/types/` — game state, terminal line types |
| UI components | `src/components/` — React terminal components |
| Tests | `src/` — Vitest tests co-located with source |
