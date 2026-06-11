---
name: solo-dev-compliance
description: Ensures that all user-facing copy, support messages, options, settings, and documentation use "I/Me" instead of "We/Us" to reflect that LeanTabs is a solo-developer project.
---

# Solo-Dev Compliance Skill

Use this skill to audit and correct any "corporate" multi-person phrasing in LeanTabs.

## Core Rules

1.  **"I" instead of "We"**: Every instance of "We believe", "We have added", "We are working on", "We designed" must be changed to "I believe", "I have added", "I am working on", "I designed".
2.  **"Me" instead of "Us"**: "Contact us" -> "Contact me", "Support us" -> "Support me".
3.  **"My" instead of "Our"**: "Our goal" -> "My goal", "Our mission" -> "My mission", "Our repository" -> "My repository".

## Implementation Pattern

Check these areas regularly when editing code or copy:
- **Dashboard UI (`saved-links.html`, `saved-links.js`)**: Help sections, informational text, empty states.
- **Settings UI (`options.html`, `options.js`)**: About sections, developer notes, import/export buttons.
- **Popup UI (`popup.html`, `popup.js`)**: Clean summaries, footer notes.
- **Walkthroughs/Documentation (`README.md`, `PRIVACY.md`)**: Project introduction, features summary, contribution notes, and user-facing logs.
- **UI Notifications**: Success/Error toast messages.

## Audit Checklist

- [ ] Does this message imply a team is behind LeanTabs? (Fix to "I").
- [ ] Is the tone personal and direct?
- [ ] Did I inadvertently use "our" in a README or PRIVACY update?
- [ ] Are success messages written in a direct, personal tone?
