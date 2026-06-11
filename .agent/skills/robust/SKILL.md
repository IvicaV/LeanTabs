---
name: robust
description: Guidelines for Defensive Programming, Data Integrity, and Stability in LeanTabs. Use when modifying storage, backup imports/exports, tab APIs, or event synchronization logic.
---

# Robust: Defensive Programming, Data Sovereignty & Ecosystem Stability

This skill outlines the critical practices for maintaining the stability of the LeanTabs extension, protecting user session data, and preventing common extension race conditions.

## Core Concepts

### 0. Data Sovereignty & Integrity (CRITICAL)
Loss of saved sessions or whitelists is the ultimate failure.
- **Clockwork Backups**: Prior to performing destructive cleanups (e.g., automated tab cleaning) or processing imports, verify that session state is saved.
- **Strict Import Validation**: When importing sessions via JSON (in options/dashboard):
  - Always validate the JSON structure.
  - Reject imports that lack required fields (e.g., `url`, `title`).
  - Provide a safe fallback and log validation errors gracefully.
- **Double-Read Pattern on Async Storage Writes**:
  When performing an asynchronous operation (like `fetchPageTitle` or favicon resolution) prior to a `saveLinks` write:
  - DO NOT rely on a links array fetched before the asynchronous operation began.
  - You MUST perform a fresh `allLinks = await getLinks()` call *after* the async step completes, and immediately before writing, to prevent concurrent actions (such as a quick-save and background clean) from overwriting each other.

### 1. Defensive Programming & API Checks
Assume browser states are highly volatile.
- **API Call Wrappers**: Wrap Chrome extension APIs (like `chrome.tabs.query`, `chrome.tabs.remove`, or `chrome.contextMenus.create`) in `try-catch` blocks.
- **Verify Target States**: Always check if a tab or window exists before attempting to update or focus it (to prevent "No tab with id: X" runtime crashes).
- **Graceful Null Fallbacks**: Ensure default values are returned for empty storage namespaces (e.g., `return data.whitelist || []` instead of throwing on undefined).

### 2. Performance Safeguards & Fluidity Assurance
A tab manager must be ultra-fluid and run at 60fps.
- **Debounced Storage Writes**: Avoid writing to storage on high-frequency events (such as drag-and-drop moves or live input typing). Debounce writes (minimum 150ms) or buffer them in-memory first.
- **UI State Synchronization**: LeanTabs pages (like the Dashboard and Options) must sync states cleanly.
  - Use `chrome.storage.onChanged` to capture updates.
  - To prevent background render storms, check `document.hidden` inside listeners. If the page is in the background, set a `hasPendingUpdate` flag instead of rendering, and refresh the UI only when the page receives focus (`visibilitychange` event).
- **Scale Tolerance**: Structure DOM rendering of lists to support large session histories (e.g., using pagination or lazy loading like the `visibleLimit` pattern in `saved-links.js`).

### 3. Bounded Async Listeners (Watchdogs)
Extension message passing channels can freeze if left open indefinitely.
- **Watchdog Timers**: Never rely solely on asynchronous browser events (like `chrome.tabs.onUpdated`) to resolve a Promise or message channel. Always pair them with a deterministic fallback timer ("Watchdog") to ensure the channel closes (via `sendResponse` or `resolve`) even if the event is swallowed (e.g., by SPA hard-navigations) to prevent "Channel Closed" errors.

---

## Code Reference Example (Double-Read Pattern)

```javascript
async function saveSingleLink(url, title, favicon, targetSessionId) {
  try {
    // 1. Perform async operations (e.g., network request for page title)
    let finalTitle = title;
    if (!title || title === url) {
        finalTitle = await fetchPageTitle(url); // Async boundary
    }

    // 2. CRITICAL: Fetch fresh state AFTER the async fetch completes
    const allLinks = await getLinks(); 
    
    // 3. Assemble and prepend new element
    const newLink = { url, title: finalTitle, favicon, sessionId: targetSessionId };
    allLinks.unshift(newLink);
    
    // 4. Save immediately after read
    await saveLinks(allLinks);
  } catch (err) {
    console.error("Save failed", err);
  }
}
```
