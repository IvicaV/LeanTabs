/**
 * LeanTabs - The Smart Tab & Workspace Manager
 * @author Ivica Vrgoc
 * @repository https://github.com/IvicaV/LeanTabs
 * @description Background service worker handling context menus, shortcuts, and storage hygiene.
 */

// --- START OF background.js (Final: Fixed Workspace Leak & Smart Shortcut) ---
import { getLinks, saveLinks, getSettings, saveSettings, getWhitelist, saveWhitelist, getBackups, saveBackups } from './modules/storage.js';
import { extractDomain } from './modules/categorizer.js';

// --- GLOBAL STATE FOR CONTEXT MENU ---
let isRebuildingMenu = false;
let pendingRebuild = false; // Neuer Zustandshalter für ausstehende Updates

// --- GLOBAL COLD-START INITIATION (Manifest V3 Lifecycle Guard) ---
// Runs every time the service worker starts or wakes up from hibernation
buildContextMenu();

// 1. INITIALIZATION & LISTENERS
chrome.runtime.onInstalled.addListener(async () => {
  console.log('LeanTabs Extension installed/updated!');
  await initializeDefaults();
});

// Re-build menu when storage changes (Debounced to prevent API congestion)
let menuRebuildTimeout = null;

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.savedLinks || changes.settings)) {
    if (menuRebuildTimeout) {
      clearTimeout(menuRebuildTimeout);
    }
    menuRebuildTimeout = setTimeout(() => {
      buildContextMenu();
      menuRebuildTimeout = null;
    }, 200);
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
  const favIconUrl = (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome-extension://')) ? tab.favIconUrl : '';

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
    // --- SMART DASHBOARD OPEN (Focus existing tab in same workspace) ---
    const targetUrl = chrome.runtime.getURL('saved-links.html');
    
    // Get currently active tab to know the context (Window & Workspace)
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentActiveTab = activeTabs[0];

    if (currentActiveTab) {
        // Find existing saved-links tabs in the SAME WINDOW ID
        const existingTabs = await chrome.tabs.query({ url: targetUrl, windowId: currentActiveTab.windowId });
        
        // SMART FILTER: Check if it's in the SAME Workspace
        // Opera/Vivaldi share windowId across workspaces, but workspaceId differs.
        const tabInSameWorkspace = existingTabs.find(t => t.workspaceId === currentActiveTab.workspaceId);
        
        if (tabInSameWorkspace) {
            // Safe: Same visual context -> Focus it
            await chrome.tabs.update(tabInSameWorkspace.id, { active: true });
        } else {
            // Not found in THIS workspace -> Create new
            await chrome.tabs.create({ url: 'saved-links.html' });
        }
    } else {
        // Fallback if no active tab context found
        await chrome.tabs.create({ url: 'saved-links.html' });
    }

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
  // --- DEFENSIRE HERKUNFTS-VERIFIZIERUNG (APPSEC-GUARD) ---
  const extensionOrigin = chrome.runtime.getURL('');
  if (!sender.url || !sender.url.startsWith(extensionOrigin)) {
    console.warn("[AppSec-Guard] Abgeblockte Runtime-Nachricht aus unautorisierter Quelle:", sender.url);
    return;
  }

  if (request.action === 'createBackup') {
    createBackup(request.links, request.tabsClosed);
  }
});

// --- CORE FUNCTIONS ---

async function initializeDefaults() {
  const data = await chrome.storage.local.get(['savedLinks', 'whitelist', 'settings']);
  
  if (!data.whitelist) {
      await saveWhitelist(['gmail.com', 'docs.google.com']);
  }
  
  if (!data.settings) {
      await saveSettings({
        keepLastTabs: 1, 
        autoBackup: true, 
        confirmBeforeClose: true, 
        cleanAllWorkspaces: false,
        enableRatings: true
      });
  }

  // Seeding the Welcome Session only if savedLinks is completely missing or empty
  if (!data.savedLinks || data.savedLinks.length === 0) {
      const timestamp = new Date().toISOString();
      const dateGroup = new Date().toLocaleDateString('en-US');
      const welcomeSessionId = `welcome-session-${Date.now()}`;

      const welcomeLinks = [
          {
              url: "https://github.com/IvicaV/LeanTabs#readme",
              title: "1. Philosophy: Why tabs eat your RAM and how LeanTabs saves it",
              timestamp: timestamp,
              dateGroup: dateGroup,
              category: "Philosophy",
              favicon: "https://github.com/favicon.ico",
              sessionId: welcomeSessionId,
              sessionLabel: "Welcome to LeanTabs (Quickstart Guide)",
              uniqueId: `welcome-link-1-${Date.now()}`,
              isPinned: false,
              rating: 0,
              note: "Tabs keep active memory state. Links consume zero RAM. LeanTabs is your intelligent converter to keep your browser fast as lightning."
          },
          {
              url: "chrome://extensions/shortcuts",
              title: "2. Hotkeys: Press Ctrl+Shift+S to clean your active window",
              timestamp: timestamp,
              dateGroup: dateGroup,
              category: "Shortcuts",
              favicon: "",
              sessionId: welcomeSessionId,
              sessionLabel: "Welcome to LeanTabs (Quickstart Guide)",
              uniqueId: `welcome-link-2-${Date.now()}`,
              isPinned: false,
              rating: 0,
              note: "Toggle this dashboard at any time with Ctrl+Shift+L. Press Ctrl+Shift+K to perform an emergency reset (kills active window tabs without saving)."
          },
          {
              url: chrome.runtime.getURL("saved-links.html#settings"),
              title: "3. Safety: Recover your last 50 cleanups under Data & Backups",
              timestamp: timestamp,
              dateGroup: dateGroup,
              category: "Backup",
              favicon: "icon16.png",
              sessionId: welcomeSessionId,
              sessionLabel: "Welcome to LeanTabs (Quickstart Guide)",
              uniqueId: `welcome-link-3-${Date.now()}`,
              isPinned: false,
              rating: 3, // Pre-rated to show the star rating system in action!
              note: "LeanTabs runs a silent background backup engine. If you ever delete a session by mistake, you can recover it instantly in Settings > Data Management & Backups."
          }
      ];
      await saveLinks(welcomeLinks);
  }
}

// --- HELPER: ADD TO WHITELIST (New) ---
async function addToWhitelist(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        
        const list = await getWhitelist();
        
        if (!list.includes(domain)) {
            list.push(domain);
            await saveWhitelist(list);
            
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

// --- DEFENSIRE NETZWERK-VALIDIERUNG (SSRF-SCHUTZ) ---
function isSafeUrlToFetch(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    
    const host = url.hostname.toLowerCase().trim();
    
    // 1. Loopback and local name resolution blocking
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')) {
      return false;
    }
    
    // 2. Private IPv4 spaces (RFC 1918) blocking
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host)) {
      return false;
    }
    
    // 3. Link-Local addresses (RFC 3927) blocking
    if (/^169\.254\./.test(host)) {
      return false;
    }
    
    // 4. Shared Address Space (RFC 6598) blocking
    if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host)) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

async function fetchPageTitle(url) {
    if (!isSafeUrlToFetch(url)) {
        console.warn("[AppSec-Guard] Fetch aborted - disallowed IP/Host target destination:", url);
        return url;
    }
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
async function buildContextMenu() {
  if (isRebuildingMenu) {
    pendingRebuild = true; // Registriere, dass eine Änderung während des Rebuilds stattfand
    return;
  }
  isRebuildingMenu = true;
  pendingRebuild = false;

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
      title: "+ Start New Session",
      contexts: ["page", "link"]
    });

    chrome.contextMenus.create({
      id: "action-quick-save",
      parentId: "leantabs-root",
      title: "Quick Save (Today's List)",
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
        title: "Add to Whitelist",
        contexts: ["page", "link"]
    });
    // ------------------------------------------

    const allLinks = await getLinks();
    
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
                    title: `Add to: ${shortLabel}`,
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
      if (pendingRebuild) {
          buildContextMenu(); // Führe das ausstehende Update sofort im Anschluss aus
      }
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
    const allLinks = await getLinks();
    
    // --- DEFENSIRE DUPLIKAT-PRÜFUNG IM BACKGROUND START ---
    const normalizedIncomingUrl = normalizeUrlForComparison(url);
    const isDuplicate = allLinks.some(link => {
        if (!link || !link.url) return false;
        return normalizeUrlForComparison(link.url) === normalizedIncomingUrl;
    });
    // --- DEFENSIRE DUPLIKAT-PRÜFUNG IM BACKGROUND END ---
    
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
      category: extractDomain(url),
      favicon: favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      sessionId: sessionId,
      sessionLabel: sessionLabel,
      uniqueId: `${url}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      isPinned: isPinned
    };

    allLinks.unshift(newLink);
    await saveLinks(allLinks);
    
    // --- CONDITIONALES OPTISCHES FEEDBACK ---
    if (isDuplicate) {
        chrome.action.setBadgeText({ text: "DUP" });
        chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }); // Gelb/Orange für Duplikat
    } else {
        chrome.action.setBadgeText({ text: "OK" });
        chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Grün für neuen Link
    }
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
    const rawSettings = await getSettings();
    const settings = { keepLastTabs: 1, cleanAllWorkspaces: false, autoBackup: true, ...rawSettings };
    const whitelist = await getWhitelist();
    
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

        // --- GRUPPEN-CACHE IM BACKGROUND (Mit API-Handshake-Check) ---
        const groupsCache = {};
        if (chrome.tabGroups) {
            for (const tab of candidates) {
                if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
                    try {
                        if (!groupsCache[tab.groupId]) {
                            groupsCache[tab.groupId] = await chrome.tabGroups.get(tab.groupId);
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }

        for (const tab of candidates) {
            // STEP 1: Save logic - Happens BEFORE whitelist logic
            if (!isSystemLink(tab.url)) {
                 const hasGroup = chrome.tabGroups && tab.groupId !== chrome.tabs.TAB_ID_NONE && groupsCache[tab.groupId];
                 
                 linksToSave.push({
                    url: tab.url,
                    title: tab.title,
                    timestamp,
                    dateGroup,
                    category: extractDomain(tab.url),
                    favicon: (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome-extension://')) ? tab.favIconUrl : '',
                    sessionId,
                    sessionLabel: `${timeString} - Background Clean`,
                    // --- METADATEN-SERIALISIERUNG ---
                    groupTitle: hasGroup ? groupsCache[tab.groupId].title : null,
                    groupColor: hasGroup ? groupsCache[tab.groupId].color : null,
                    groupOriginalId: tab.groupId !== chrome.tabs.TAB_ID_NONE ? tab.groupId : null
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
        }
    }

    if (tabsToClose.length > 0 || linksToSave.length > 0) {
        if (linksToSave.length > 0) {
            // CRITICAL: Fetch fresh data just before saving to prevent race conditions
            const currentSavedLinks = await getLinks();
            const updatedLinks = [...linksToSave, ...currentSavedLinks];
            await saveLinks(updatedLinks);
            
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
    const backupList = await getBackups();
    
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
    await saveBackups(backupList);
  } catch (error) { console.error('Backup error:', error); }
}

// --- HELPER: ELITE-GRADE SMART-FOCUS URL NORMALIZATION ---
function normalizeUrlForComparison(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return '';
  }
  
  try {
    let decoded = urlStr;
    try { decoded = decodeURIComponent(urlStr); } catch (e) {}

    let tempUrl = decoded.normalize('NFC').trim();
    if (!/^https?:\/\//i.test(tempUrl)) tempUrl = 'https://' + tempUrl;
    
    const url = new URL(tempUrl);
    let host = url.hostname.toLowerCase().replace(/^www\./i, '');
    let path = url.pathname.toLowerCase();

    path = path.replace(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i, '$2');
    path = path.replace(/\/$/, '');
    
    const preserveParamsHosts = ['youtube.com', 'google.com', 'google.de', 'stackoverflow.com', 'bing.com'];
    const shouldPreserveParams = preserveParamsHosts.some(h => host === h || host.endsWith('.' + h));

    if (shouldPreserveParams) {
        let searchParams = new URLSearchParams(url.search.toLowerCase());
        const paramsToStrip = [
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
          'ref', 'fbclid', 'gclid', 'yclid', 'spm', 't'
        ];
        paramsToStrip.forEach(p => searchParams.delete(p));
        searchParams.sort();
        const cleanSearch = searchParams.toString();
        return host + path + (cleanSearch ? '?' + cleanSearch : '');
    } else {
        return host + path;
    }
  } catch (e) {
    try {
      let decoded = urlStr;
      try { decoded = decodeURIComponent(urlStr); } catch (err) {}
      let clean = decoded.normalize('NFC').trim().toLowerCase();
      clean = clean.split('#')[0]; 
      clean = clean.split('?')[0]; 
      clean = clean.replace(/^https?:\/\//i, '');
      clean = clean.replace(/^www\./i, '');
      clean = clean.replace(/\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i, '$2');
      clean = clean.replace(/\/$/, '');
      return clean;
    } catch (innerError) {
      return '';
    }
  }
}