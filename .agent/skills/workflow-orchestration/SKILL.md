---
name: workflow-orchestration
description: Core workflow orchestration and behavioral principles. This skill MUST be applied and followed by the AI Agent for ANY non-trivial task (3+ steps or architectural decisions).
---

# Workflow Orchestration

## 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately—don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

## 2. Subagent Strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

## 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` (or creation of it) with the pattern.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review lessons at session start for the relevant project.

## 4. Verification Before Done
- Never mark a task complete without proving it works.
- **Full-Chain Traceability**: Before proposing any fix, trace the full processing chain of the affected component—from the outermost interface layer (UI, API, input handler) through all intermediate logic down to the final persistence or execution layer (database, storage, external service).
- **Verify Underlying Acceptance**: Never resolve a surface-level symptom (a block, a warning, a failed state) by removing or bypassing the mechanism that produces it, without first verifying that the underlying system will accept and correctly process the resulting data or state. 
- **Holistic Consistency**: A fix is only valid if every layer of the chain remains consistent after the change.
- Diff behavior between main and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.

## 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes—don't over-engineer.
- Challenge your own work before presenting it.

## 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests—then resolve them.
- Zero context switching required from the user.
- Go fix failing build steps without being told how.

---

## Task Management

1. **Plan First**: Write a plan to `tasks/todo.md` with checkable items.
2. **Verify Plan**: Check in before starting implementation.
3. **Track Progress**: Mark items complete as you go.
4. **Explain Changes**: High-level summary at each step.
5. **Document Results**: Add a review section to `tasks/todo.md`.
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections.
