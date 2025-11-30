/**
 * LeanTabs - The Smart Tab & Workspace Manager
 * @author Ivica Vrgoc
 * @repository https://github.com/IvicaV/LeanTabs
 * @description Background service worker handling context menus, shortcuts, and storage hygiene.
 */

// --- START OF background.js (Final: Fixed Workspace Leak in Background Clean & Reset) ---

// 1. INITIALIZATION & LISTENERS
chrome.runtime.onInstalled.addListener(async () => {
  console.log('LeanTabs Extension installed/updated!');
  await initializeDefaults();
  await buildContextMenu(); 
});

// Re-build menu when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.savedLinks || changes.settings)) {
    setTimeout(() => buildContextMenu(), 100);
  }
});

// 2. CONTEXT MENU CLICK HANDLER
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || tab.url;
  
  // --- NEW: WHITELIST LOGIC ---
  if (info.menuItemId === "action-add-whitelist") {
      await addToWhitelist(targetUrl);
      return;
  }
  // ----------------------------

  let targetTitle = info.linkUrl ? (info.selectionText || targetUrl) : tab.title;
  const favIconUrl = tab.favIconUrl;

  if (info.menuItemId === "action-new-session") {
     await saveSingleLink(targetUrl, targetTitle, favIconUrl, "NEW_SESSION");
  } 
  else if (info.menuItemId === "action-quick-save") {
     await saveSingleLink(targetUrl, targetTitle, favIconUrl, null);
  }
  else if (info.menuItemId.startsWith("session-")) {
     const sessionId = info.menuItemId.replace("session-", "");
     await saveSingleLink(targetUrl, targetTitle, favIconUrl, sessionId);
  }
});

// 3. SHORTCUT COMMANDS HANDLER
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-saved') {
    chrome.tabs.create({ url: 'saved-links.html' });
  } else if (command === 'run-clean') {
    await performBackgroundClean();
  } else if (command === 'run-reset') {
    // EMERGENCY RESET (Fixed: Workspace Aware)
    try {
        // 1. Identify Scope (Current Workspace only)
        let tabsToDelete = [];
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (activeTabs.length > 0) {
            const activeTab = activeTabs[0];
            const allWindowTabs = await chrome.tabs.query({ windowId: activeTab.windowId });
            // Strict Workspace Filter
            tabsToDelete = allWindowTabs.filter(t => t.workspaceId === activeTab.workspaceId);
        } else {
            // Fallback
            tabsToDelete = await chrome.tabs.query({ currentWindow: true });
        }

        // 2. Create Safety Tab (so window/workspace doesn't close)
        await chrome.tabs.create({}); 
        
        // 3. Delete scoped tabs
        const idsToRemove = tabsToDelete.map(t => t.id);
        if (idsToRemove.length > 0) {
            await chrome.tabs.remove(idsToRemove);
        }
    } catch (e) { console.error("Reset failed", e); }
  }
});

// 4. MESSAGE LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createBackup') {
    createBackup(request.links, request.tabsClosed);
  }
});

// --- CORE FUNCTIONS ---

async function initializeDefaults() {
  const data = await chrome.storage.local.get(['savedLinks', 'whitelist', 'settings']);
  if (!data.savedLinks) await chrome.storage.local.set({ savedLinks: [] });
  if (!data.whitelist) await chrome.storage.local.set({ whitelist: ['gmail.com', 'docs.google.com'] });
  if (!data.settings) await chrome.storage.local.set({
    settings: { 
      keepLastTabs: 3, 
      autoBackup: true, 
      confirmBeforeClose: true, 
      cleanAllWorkspaces: false
    }
  });
}

// --- HELPER: ADD TO WHITELIST (New) ---
async function addToWhitelist(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        
        const data = await chrome.storage.local.get(['whitelist']);
        const list = data.whitelist || [];
        
        if (!list.includes(domain)) {
            list.push(domain);
            await chrome.storage.local.set({ whitelist: list });
            
            // Visual Feedback on Icon
            chrome.action.setBadgeText({ text: "WL+" });
            chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Green
        } else {
            // Already exists feedback
            chrome.action.setBadgeText({ text: "HAS" });
            chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }); // Orange
        }
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
    } catch (e) {
        console.error("Whitelist add failed", e);
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
    }
}

// --- HELPER: FETCH TITLE IN BACKGROUND ---
async function fetchPageTitle(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return url; 
        const text = await response.text();
        const matches = text.match(/<title>([^<]*)<\/title>/i);
        if (matches && matches[1]) {
            let title = matches[1]
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"');
            return title.trim();
        }
    } catch (e) { }
    return url;
}

// --- DYNAMIC MENU BUILDER ---
let isRebuildingMenu = false;

async function buildContextMenu() {
  if (isRebuildingMenu) return; 
  isRebuildingMenu = true;

  try {
    await new Promise(resolve => {
        chrome.contextMenus.removeAll(() => {
            if (chrome.runtime.lastError) { /* ignore */ }
            resolve();
        });
    });

    chrome.contextMenus.create({
      id: "leantabs-root",
      title: "Save to LeanTabs",
      contexts: ["page", "link"]
    });

    chrome.contextMenus.create({
      id: "action-new-session",
      parentId: "leantabs-root",
      title: "➕ Start New Session",
      contexts: ["page", "link"]
    });

    chrome.contextMenus.create({
      id: "action-quick-save",
      parentId: "leantabs-root",
      title: "📥 Quick Save (Today's List)",
      contexts: ["page", "link"]
    });
    
    // --- NEW SEPARATOR AND WHITELIST OPTION ---
    chrome.contextMenus.create({
        id: "sep-whitelist",
        type: "separator",
        parentId: "leantabs-root",
        contexts: ["page", "link"]
    });

    chrome.contextMenus.create({
        id: "action-add-whitelist",
        parentId: "leantabs-root",
        title: "🛡️ Add to Whitelist",
        contexts: ["page", "link"]
    });
    // ------------------------------------------

    const data = await chrome.storage.local.get(['savedLinks']);
    const allLinks = data.savedLinks || [];
    
    const sessionsMap = new Map();
    allLinks.forEach(link => {
        if (link.sessionId && link.isPinned) {
            if (!sessionsMap.has(link.sessionId)) {
                sessionsMap.set(link.sessionId, link.sessionLabel);
            }
        }
    });

    if (sessionsMap.size > 0) {
        chrome.contextMenus.create({
            id: "sep-1",
            type: "separator",
            parentId: "leantabs-root",
            contexts: ["page", "link"]
        });

        sessionsMap.forEach((label, id) => {
            let shortLabel = label.replace(/^📅\s*/, '').substring(0, 20);
            if(label.length > 20) shortLabel += "...";
            
            try {
                chrome.contextMenus.create({
                    id: `session-${id}`,
                    title: `📌 Add to: ${shortLabel}`,
                    parentId: "leantabs-root",
                    contexts: ["page", "link"]
                });
            } catch (e) { /* ignore duplicates */ }
        });
    }

  } catch (err) {
      console.error("Menu build failed:", err);
  } finally {
      isRebuildingMenu = false;
  }
}

async function saveSingleLink(url, title, favicon, targetSessionId) {
  try {
    chrome.action.setBadgeText({ text: "..." });
    chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });

    // Fetch title first (async operation)
    let finalTitle = title;
    if (!title || title === url || title.startsWith("http")) {
        finalTitle = await fetchPageTitle(url);
    }

    // CRITICAL: Get fresh data AFTER the async fetch to prevent race conditions
    const data = await chrome.storage.local.get(['savedLinks']);
    const allLinks = data.savedLinks || [];
    
    const timestamp = new Date().toISOString();
    const dateGroup = new Date().toLocaleDateString('en-US');
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    let domain = "Other";
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch(e){}

    let sessionId = targetSessionId;
    let sessionLabel = "";
    let isPinned = false;

    if (targetSessionId === "NEW_SESSION") {
        sessionId = `manual-session-${timestamp}`; 
        sessionLabel = `New Session (${timeStr})`;
        isPinned = false;
    } 
    else if (targetSessionId) {
        const existingLink = allLinks.find(l => l.sessionId === targetSessionId);
        if (existingLink) {
            sessionLabel = existingLink.sessionLabel;
            isPinned = existingLink.isPinned;
        } else {
            sessionLabel = "Restored Session";
        }
    } 
    else {
        const baseId = `manual-save-${dateGroup}`;
        let candidateId = baseId;
        let counter = 0;
        let foundSafeSession = false;

        while (!foundSafeSession) {
            const existingSessionLink = allLinks.find(l => l.sessionId === candidateId);
            if (!existingSessionLink) {
                sessionId = candidateId;
                foundSafeSession = true;
            } else {
                const isPure = !existingSessionLink.isPinned && existingSessionLink.sessionLabel.startsWith("Quick Saves");
                if (isPure) {
                    sessionId = candidateId;
                    foundSafeSession = true;
                } else {
                    counter++;
                    candidateId = `${baseId}-${counter}`;
                }
            }
        }
        sessionLabel = `Quick Saves (${dateGroup})`;
    }

    const newLink = {
      url: url,
      title: finalTitle, 
      timestamp: timestamp,
      dateGroup: dateGroup,
      category: domain,
      favicon: favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      sessionId: sessionId,
      sessionLabel: sessionLabel,
      uniqueId: `${url}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      isPinned: isPinned
    };

    allLinks.unshift(newLink);
    await chrome.storage.local.set({ savedLinks: allLinks });
    
    chrome.action.setBadgeText({ text: "OK" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); 
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);

  } catch (err) {
    console.error("Error saving link:", err);
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
}

function isSystemLink(url) {
    if (!url) return true;
    if (url.startsWith(chrome.runtime.getURL(''))) return true;
    return url.startsWith('chrome://') ||
           url.startsWith('edge://') ||
           url.startsWith('opera://') ||
           url.startsWith('vivaldi://') ||
           url.startsWith('brave://') ||
           url.startsWith('about:') ||
           url === 'about:blank';
}

async function performBackgroundClean() {
  try {
    chrome.action.setBadgeText({ text: "..." }); 
    chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" }); 

    // Initial read for settings
    const data = await chrome.storage.local.get(['whitelist', 'settings']);
    const settings = data.settings || { keepLastTabs: 3, cleanAllWorkspaces: false, autoBackup: true };
    const whitelist = data.whitelist || [];
    
    let tabsToProcess = [];
    if (settings.cleanAllWorkspaces) {
        tabsToProcess = await chrome.tabs.query({});
    } else {
        // --- FIX: WORKSPACE AWARE CLEANING ---
        // Prevents cleaning tabs in hidden workspaces if they share the same windowId (Opera/Vivaldi)
        const currentWindowTabs = await chrome.tabs.query({ currentWindow: true, active: true });
        if (currentWindowTabs.length > 0) {
           const activeTab = currentWindowTabs[0];
           const allTabsInWindow = await chrome.tabs.query({ windowId: activeTab.windowId });
           
           // Filter: Must be in the same workspace (or both undefined in standard Chrome)
           tabsToProcess = allTabsInWindow.filter(t => t.workspaceId === activeTab.workspaceId);
        } else {
           // Fallback if no active tab found (unlikely)
           tabsToProcess = await chrome.tabs.query({ currentWindow: true });
        }
    }

    const tabsByContext = {};
    const activeTabs = await chrome.tabs.query({ active: true });
    const activeTabIds = new Set(activeTabs.map(t => t.id));

    tabsToProcess.forEach(tab => {
        const contextKey = tab.windowId;
        if (!tabsByContext[contextKey]) {
            tabsByContext[contextKey] = { tabs: [], hasActive: false };
        }
        tabsByContext[contextKey].tabs.push(tab);
        if (activeTabIds.has(tab.id)) tabsByContext[contextKey].hasActive = true;
    });

    let tabsToClose = [];
    let linksToSave = [];
    const timestamp = new Date().toISOString();
    const dateGroup = new Date().toLocaleDateString('en-US');
    const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    for (const [winId, ctx] of Object.entries(tabsByContext)) {
        const groupTabs = ctx.tabs;
        let keepCount = settings.keepLastTabs;
        
        let candidates = [];
        if (groupTabs.length > keepCount) {
            candidates = groupTabs.slice(0, -keepCount);
        }

        const sessionId = `clean-shortcut-${winId}-${timestamp}`;

        candidates.forEach(tab => {
            // STEP 1: Save logic - Happens BEFORE whitelist logic
            // This guarantees whitelisted items are saved if they are about to be processed
            if (!isSystemLink(tab.url)) {
                 linksToSave.push({
                    url: tab.url,
                    title: tab.title,
                    timestamp,
                    dateGroup,
                    category: new URL(tab.url).hostname.replace('www.',''),
                    favicon: tab.favIconUrl || '',
                    sessionId,
                    sessionLabel: `${timeString} - Background Clean`
                 });
            }

            // STEP 2: Logic to Close
            let shouldClose = true;
            
            if (tab.pinned) shouldClose = false;
            if (activeTabIds.has(tab.id)) shouldClose = false;
            
            // STRICTER WHITELIST LOGIC (Prevents false positives)
            try { 
                const urlObj = new URL(tab.url);
                const hostname = urlObj.hostname;
                const isWhitelisted = whitelist.some(pattern => {
                    return hostname === pattern || hostname.endsWith('.' + pattern);
                });
                if (isWhitelisted) shouldClose = false;
            } catch(e) { }

            if (shouldClose) {
                tabsToClose.push(tab.id);
            }
        });
    }

    if (tabsToClose.length > 0 || linksToSave.length > 0) {
        if (linksToSave.length > 0) {
            // CRITICAL: Fetch fresh data just before saving to prevent race conditions
            const freshData = await chrome.storage.local.get(['savedLinks']);
            let currentSavedLinks = freshData.savedLinks || [];
            currentSavedLinks = [...linksToSave, ...currentSavedLinks];
            await chrome.storage.local.set({ savedLinks: currentSavedLinks });
            
            if (settings.autoBackup) createBackup(linksToSave, tabsToClose.length);
        }

        if (tabsToClose.length > 0) {
            await chrome.tabs.remove(tabsToClose);
            chrome.action.setBadgeText({ text: `${tabsToClose.length}` });
            chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
        } else {
            // Nothing closed (maybe all whitelisted), but saved
            chrome.action.setBadgeText({ text: "SAVED" });
            chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
        }
        
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    } else {
        chrome.action.setBadgeText({ text: "0" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1000);
    }
  } catch (error) {
    console.error("Background clean failed:", error);
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
}

async function createBackup(links, tabsClosed = 0) {
  try {
    const timestamp = new Date().toISOString();
    const readableTime = new Date().toLocaleString('en-US');
    
    const uniqueDomains = [...new Set(links.map(link => {
        try {
            return new URL(link.url).hostname.replace(/^www\./, '');
        } catch (e) { return 'Link'; }
    }))].slice(0, 3);

    let smartLabel = uniqueDomains.join(', ');
    if (uniqueDomains.length > 0) {
        smartLabel = smartLabel.split(', ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    }
    
    if (links.length > 3) {
        smartLabel += ` (+${links.length - 3})`;
    }
    if (links.length === 0) smartLabel = "Empty Clean";

    const backupData = { created: timestamp, version: '1.0.0', tabsClosed: tabsClosed, links: links };
    const backups = await chrome.storage.local.get(['backups']);
    const backupList = backups.backups || [];
    
    backupList.push({ 
        id: timestamp, 
        timestamp: timestamp, 
        readableTime: readableTime, 
        count: links.length, 
        tabsClosed: tabsClosed,
        label: smartLabel, 
        data: backupData 
    });

    if (backupList.length > 50) backupList.shift();
    await chrome.storage.local.set({ backups: backupList });
  } catch (error) { console.error('Backup error:', error); }
}
// --- END OF background.js ---