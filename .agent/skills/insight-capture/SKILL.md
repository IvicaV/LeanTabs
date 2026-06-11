---
name: insight-capture
description: INVOKE when reasoning reveals sudden synthesis, reframing, non-obvious implications, when a prior assumption was wrong, or when catching sloppy AI habits. Captures structural insights before they're lost.
---

# Insight Capture Skill

Use this skill to preserve knowledge that emerges during development but isn't part of the code itself.

## Triggering Conditions

suggest invoking this when:
- 🎯 A response reveals a sudden synthesis or reframing.
- 🎯 Reasoning derives a non-obvious structural insight.
- 🎯 A prior assumption turns out to be wrong.
- 🎯 A pattern clicks that wasn't explicit before.
- 🎯 You catch a sloppy habit or an AI tendency that causes problems.

## Capture Flow

### Step 1: Acknowledge
Pause. Notify the user: "That's an interesting insight - I'll capture this in the SCRATCHPAD."

### Step 2: Quick Classification
- **Synthesis** → Connected dots that weren't obvious.
- **Reframe** → Shifted how to think about the problem.
- **Correction** → Prior assumption was wrong.
- **Pattern** → Could become a rule.
- **System insight** → Reveals how things actually work.
- **Sloppy habit** → AI tendency that causes problems.

### Step 3: Capture Location
| Size | Where | Format |
|------|-------|--------|
| One-liner | [SCRATCHPAD.md](file:///c:/Users/mail/Downloads/LeanTabs%20Extension%20EN/SCRATCHPAD.md) → Insights section | `- 💡 [DATE] Description` |
| Paragraph | [SCRATCHPAD.md](file:///c:/Users/mail/Downloads/LeanTabs%20Extension%20EN/SCRATCHPAD.md) + brief reference | `- 💡 [DATE] Brief. Details below.` |
| Full write-up | `.agent/notes/DISCOVERY-*.md` | Reference in SCRATCHPAD |

### Step 4: Rule Potential Check
Consider if this should become a formal rule in a skill.
- If yes → Add to [SCRATCHPAD.md](file:///c:/Users/mail/Downloads/LeanTabs%20Extension%20EN/SCRATCHPAD.md) → **Proposed Rules** section.

## Examples

### Quick Insight
```markdown
- 💡 [2026-06-11] Opera/Vivaldi share windowId across different virtual workspaces, meaning simple window-based queries can leak tabs from hidden workspaces.
- 💡 [2026-06-11] The DOM parser fails silently on option fields that contain non-escaped special characters.
```

### Rule Proposal
```markdown
- 📋 [2026-06-11] All storage writes must fetch a fresh state immediately prior to saving → Added to robust skill.
```
