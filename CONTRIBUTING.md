# 🚀 Contributing to LeanTabs: The Productivity Core

Welcome! I am incredibly grateful for your interest in contributing to LeanTabs. My goal is to transform this extension into the most **reliable, secure, intuitive, and efficient Tab Management Solution** available.

As the sole maintainer, I treat every contribution as a critical step toward this goal. Your expertise is invaluable in maintaining a high standard of code clarity and stability, especially given the project’s complex data and browser interactions.

---

## 1. 🥇 The LeanTabs Quality Standard

**My Priority is Trust.** Since LeanTabs manages user session data and system resources, every line of code must be meticulously safe.

* **Security & Data Integrity:** Contributions must never introduce external tracking, compromise local storage security, or create potential for data loss (e.g., race conditions during save/restore operations).
* **Performance:** Code must be optimized for speed, particularly in data handling (`saved-links.js` rendering) and background processes (`background.js` cleaning logic).
* **Simplicity & Clarity:** While I seek powerful solutions, I prioritize **clear, maintainable, and effective Vanilla JavaScript** over overly abstracted or complex engineering patterns. Readability ensures long-term stability.

---

## 2. 🚨 Before You Code: Reporting Issues

Please use the [**GitHub Issues Tab**] for all bug reports and feature proposals. This is the single source of truth for all project discussions.

### A. Reporting Critical Bugs

When reporting an issue that affects data, saving, or core functionality, please include the following diagnostic data to aid in reproduction and analysis:

1.  **Reproduction Steps:** A concise, step-by-step procedure to reliably trigger the bug.
2.  **Environment Snapshot:**
    * Browser Type and **Exact Version** (e.g., Opera One 109.0.5097.48).
    * Operating System.
    * Screenshot of relevant **LeanTabs Settings** (especially `Keep last tabs` and `Cleaning Scope`).
3.  **Data Impact:** Clearly state if the bug resulted in lost or corrupted saved links.

### B. Proposing Enhancements

For new features, please describe the **User Story**—*Why* the user needs this feature and *What* specific problem it solves.

**Key areas for advanced contributions:**
* Refactoring the **Session Movement Logic** (`saved-links.js`).
* Enhancing **Workspace/Window Management API** resilience in `background.js`.
* Improvements to the **Drag & Drop** data persistence logic.

---

## 3. 🧑‍💻 Submitting Code (Pull Requests)

Please follow these technical guidelines to ensure your work can be integrated smoothly and safely.

### A. Code Requirements & Style

* **Technology Stack:** The project is exclusively **Vanilla JavaScript (ES6+), HTML5, and CSS3**. Do not introduce external libraries, frameworks, or transpiled code (e.g., TypeScript) without prior discussion in a dedicated Issue.
* **Code Quality:** I use basic linting checks. Please avoid unused variables, unnecessary console logs, and overly verbose comments where code clarity is sufficient.
* **Data Integrity Check:** Your submitted code must be verifiably safe. I retain the ultimate right to request refactoring to ensure the simplest, safest path for data storage and retrieval.

### B. The Pull Request Workflow

1.  **Fork and Branch:** Create a fork and a descriptive branch (e.g., `feature/session-merge` or `fix/silent-clean-error`).
2.  **Atomic Commits:** Each commit should represent a single, isolated change. This allows me to easily track and revert specific modifications if necessary.
3.  **Local Testing:** **Your most crucial step.** Verify that your changes work reliably on your local unpacked version, paying close attention to edge cases (e.g., handling `chrome://` URLs, large number of tabs, empty sessions).

### C. The PR Description (The Reviewer's Guide)

Your PR description is the guide for my review. It must contain the following sections:

| Section | Content |
| :--- | :--- |
| **WHAT** | A summary of the files and functions changed. |
| **WHY** | The rationale for the change, linking directly to the corresponding Issue. |
| **VERIFICATION** | **CRITICAL:** The steps I must take to test your code. Specify: "I tested this fix by closing 15 tabs in a Workspace while the Whitelist was active." |

---

## 4. 🧠 Maintenance and Acknowledgement

* **I am the Maintainer:** I appreciate every contribution, but I am the sole person responsible for merging. Please be patient, as I review code in my limited personal time. **All decisions on merging are final.**
* **Acknowledgement:** Your name and contribution will be permanently recorded in the Git history. For major contributions, I will happily add your name to the project's `README.md`.

Thank you again for helping build a robust and reliable LeanTabs. I look forward to reviewing your pull request!
