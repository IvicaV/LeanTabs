---
name: tab-management-governance
description: Rules and guidelines for managing workspace-aware cleaning, tab lifecycles, and context menu updates in LeanTabs. Use when editing background worker and tab manipulation modules.
---

# Tab Management & Workspace Governance

This document lists the critical rules governing window, tab, and workspace operations within LeanTabs, preventing regressions with Chrome, Opera, and Vivaldi.

> **ANY CHANGE to cleaning, resetting, or tab query logic MUST satisfy the constraints below.**
> Protected variables and properties in `background.js` (like `workspaceId` checks) must not be simplified.

---

## 1. The Workspace-Aware Query Mandate (Opera & Vivaldi)

**CRITICAL RULE:** When retrieving tabs to clean, reset, or search, NEVER assume checking `windowId` is sufficient.
- Opera and Vivaldi reuse the same `windowId` across multiple visual workspaces, but split them using the custom property `workspaceId`.
- Always verify the active tab context and match `workspaceId` properties when querying tabs.

```javascript
// --- WORKSPACE AWARE FILTERING PATTERN ---
const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
if (activeTabs.length > 0) {
    const activeTab = activeTabs[0];
    const allWindowTabs = await chrome.tabs.query({ windowId: activeTab.windowId });
    
    // Strict Workspace Filter
    const targetWorkspaceTabs = allWindowTabs.filter(t => t.workspaceId === activeTab.workspaceId);
}
```

---

## 2. Order of Operations in Tab Cleaning

**CRITICAL RULE:** Background cleaning MUST process data in a strict chronological sequence to ensure user safety:
1. **Scope Identification**: Query scoped tabs (workspace-aware).
2. **Persistence Check**: Identify candidates to close (excluding active, pinned, and whitelisted tabs).
3. **Pre-Close Save**: Map and prepend the URLs of all candidate tabs to the saved links storage *before* closing them.
4. **Trigger Backup**: Create a recovery backup record.
5. **Close Execution**: Execute `chrome.tabs.remove(ids)` only after storage operations resolve successfully.

---

## 3. Strict Whitelist Matching Heuristics

When evaluating whitelisted items during cleanups, use rigid hostname matching to avoid false positives (e.g., matching a subdirectory instead of a domain):
- Compare the exact parsed URL host against whitelist entries.
- Allow subdomains only if explicitly matching the pattern suffix (e.g., `hostname.endsWith('.' + pattern)`).

---

## 4. Context Menu Rebuild Reentrancy Guard

Rebuilding context menus dynamically (`chrome.contextMenus.create`) can cause runtime errors if multiple updates occur concurrently (e.g., when multiple tabs change states rapidly).
- Maintain an `isRebuildingMenu` boolean lock.
- Clean up all existing menu elements via `chrome.contextMenus.removeAll()` inside a promise chain before registering new elements.
- Use a slight debounce timer (e.g., 100ms) on storage listeners before triggering a rebuild.
