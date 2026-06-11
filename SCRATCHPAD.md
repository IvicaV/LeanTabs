# SCRATCHPAD

Preserving critical insights and decisions for the LeanTabs workspace.

## Insights

- 💡 [2026-06-11] **Workspace-Aware Focus Filters (Opera/Vivaldi compatibility)**:
  Opera and Vivaldi share `windowId` values across different virtual workspaces, but isolate tabs using a specific `workspaceId` property. Traditional `chrome.tabs.query({ url, windowId })` calls can cause cross-workspace focus leaks. Tab focusing, cleanups, and resets must filter target tabs using `tab.workspaceId === activeTab.workspaceId` to maintain visual context boundaries.

- 💡 [2026-06-11] **Asynchronous Storage Operations and Race Conditions**:
  When executing async calls (such as fetching a webpage title via network request) before saving data, the storage state can change in the background. Always fetch the fresh links array (`allLinks = await getLinks()`) *after* all async steps are completed and immediately before writing (`saveLinks(allLinks)`), to prevent concurrent events (e.g., background clean and quick-saves) from overwriting each other.

## Proposed Rules

- 📋 [2026-06-11] **Double-Read Pattern on Async Storage Writes**:
  Any function that performs an async fetch before calling `saveLinks` MUST follow the double-read pattern. Read the storage once if needed for initial validation, but query the fresh state again immediately prior to the write command.
