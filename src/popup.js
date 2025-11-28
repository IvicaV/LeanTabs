// --- START OF popup.js (Fix: Smart Workspace Detection) ---

// --- 1. HELPER: CUSTOM MODAL ---
function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('modalMessage');
        const btnYes = document.getElementById('modalConfirmBtn');
        const btnNo = document.getElementById('modalCancelBtn');

        if (!modal || !msgEl || !btnYes || !btnNo) {
            resolve(confirm(message)); 
            return;
        }

        msgEl.textContent = message;
        modal.classList.remove('hidden');

        const newBtnYes = btnYes.cloneNode(true);
        const newBtnNo = btnNo.cloneNode(true);
        btnYes.parentNode.replaceChild(newBtnYes, btnYes);
        btnNo.parentNode.replaceChild(newBtnNo, btnNo);

        newBtnYes.onclick = () => {
            modal.classList.add('hidden');
            resolve(true);
        };
        newBtnNo.onclick = () => {
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}

async function updateStats() {
  try {
      const tabs = await chrome.tabs.query({});
      const data = await chrome.storage.local.get(['savedLinks', 'settings']);
      const savedLinks = data.savedLinks || [];
      const settings = data.settings || { keepLastTabs: 3 }; 
      
      const tabCountEl = document.getElementById('tabCount');
      const savedCountEl = document.getElementById('savedCount');
      
      if (tabCountEl) tabCountEl.textContent = tabs.length;
      if (savedCountEl) savedCountEl.textContent = savedLinks.length;
      
      updateSubtext(settings.keepLastTabs);
  } catch (e) {
      console.error("Stats update failed", e);
  }
}

function updateSubtext(keepCount) {
    const scopeSelect = document.getElementById('cleanScope');
    if (!scopeSelect) return;
    
    const isGlobal = scopeSelect.value === 'global';
    const subtext = document.getElementById('cleanBtnSubtext');
    
    if (subtext) {
        subtext.textContent = `Closes all except the last ${keepCount} tabs (${isGlobal ? 'all windows' : 'current window'})`;
    }
}

async function initScopeDropdown() {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    const scopeSelect = document.getElementById('cleanScope');

    if (!scopeSelect) return;

    if (settings.cleanAllWorkspaces === true) {
        scopeSelect.value = 'global';
    } else {
        scopeSelect.value = 'current';
    }

    scopeSelect.addEventListener('change', async () => {
        updateSubtext(settings.keepLastTabs || 3);
        settings.cleanAllWorkspaces = (scopeSelect.value === 'global');
        await chrome.storage.local.set({ settings });
    });
}

function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 3000);
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const domainMap = {
      'youtube.com': 'YouTube', 'github.com': 'GitHub', 'stackoverflow.com': 'Stack Overflow',
      'reddit.com': 'Reddit', 'twitter.com': 'Twitter', 'linkedin.com': 'LinkedIn',
      'facebook.com': 'Facebook', 'amazon.de': 'Amazon', 'amazon.com': 'Amazon',
      'wikipedia.org': 'Wikipedia', 'google.com': 'Google', 'gmail.com': 'Gmail',
      'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive'
    };
    if (domainMap[hostname]) return domainMap[hostname];
    const withoutWww = hostname.replace(/^www\./, '');
    if (domainMap[withoutWww]) return domainMap[withoutWww];
    const parts = withoutWww.split('.');
    if (parts.length >= 2) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return 'Other';
  } catch { return 'Other'; }
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

async function getTabsBasedOnScope(isGlobal) {
    if (isGlobal) {
        return await chrome.tabs.query({});
    } else {
        const currentWindow = await chrome.tabs.query({ currentWindow: true });
        const activeTab = currentWindow.find(t => t.active);
        if (activeTab && activeTab.workspaceId !== undefined) {
            return currentWindow.filter(t => t.workspaceId === activeTab.workspaceId);
        }
        return currentWindow;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    
    await initScopeDropdown();
    await updateStats();

    const themeBtn = document.getElementById('themeToggleBtn');
    const sunIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const moonIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const updateThemeIcon = (isDark) => {
        themeBtn.innerHTML = isDark ? sunIcon : moonIcon;
        themeBtn.title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    };

    const currentTheme = localStorage.getItem('theme') || 'light';
    updateThemeIcon(currentTheme === 'dark');

    themeBtn.addEventListener('click', async () => {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme === 'dark');
        showStatus(`${newTheme === 'dark' ? 'Dark' : 'Light'} Mode enabled as default`);
    });

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
          const confirmed = await showCustomConfirm(
            "⚠️ EMERGENCY RESET\n\nThis will close ALL tabs immediately.\nNothing will be saved.\n\nAre you sure?"
          );
          
          if (!confirmed) return;

          try {
            const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
            const activeTab = currentWindowTabs.find(t => t.active);
            let tabsToDelete = [];
            
            if (activeTab && activeTab.workspaceId !== undefined) {
                tabsToDelete = currentWindowTabs.filter(t => t.workspaceId === activeTab.workspaceId);
            } else {
                tabsToDelete = currentWindowTabs;
            }
            
            const idsToRemove = tabsToDelete.map(t => t.id);

            if (idsToRemove.length > 0) {
                await chrome.tabs.create({ active: false });
                await chrome.tabs.remove(idsToRemove);
            } 
          } catch (error) {
            console.error("Reset failed:", error);
          }
        });
    }

    const cleanBtn = document.getElementById('cleanBtn');
    if (cleanBtn) {
        cleanBtn.addEventListener('click', async () => {
          cleanBtn.disabled = true;
          const originalText = cleanBtn.innerHTML;
          cleanBtn.innerHTML = '<span>Processing...</span>';

          try {
            // ONLY READ SETTINGS/WHITELIST HERE
            const settingsData = await chrome.storage.local.get(['whitelist', 'settings']);
            const settings = settingsData.settings || { 
              keepLastTabs: 3, 
              confirmBeforeClose: true, 
              autoBackup: true 
            };
            const whitelist = settingsData.whitelist || [];
            
            // Note: We do NOT read savedLinks yet!
            
            const scopeSelect = document.getElementById('cleanScope');
            const isGlobal = scopeSelect.value === 'global';
            
            const tabsToProcess = await getTabsBasedOnScope(isGlobal);
            const allGlobalTabs = await chrome.tabs.query({});
            const allGlobalWindowIds = [...new Set(allGlobalTabs.map(t => t.windowId))].sort((a, b) => a - b);
            const getSimpleWindowNum = (id) => allGlobalWindowIds.indexOf(id) + 1;

            const tabsByContext = {};
            const realActiveTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const realActiveTabId = realActiveTabs[0] ? realActiveTabs[0].id : -1;

            tabsToProcess.forEach(tab => {
                const contextKey = (tab.workspaceId !== undefined) 
                    ? `workspace-${tab.workspaceId}-win-${tab.windowId}` 
                    : `window-${tab.windowId}`;
                    
                if (!tabsByContext[contextKey]) {
                    const simpleWinNum = getSimpleWindowNum(tab.windowId);
                    let labelName = (tab.workspaceId !== undefined) 
                        ? `Workspace ${tab.workspaceId} (Window ${simpleWinNum})` 
                        : `Window ${simpleWinNum}`;

                    tabsByContext[contextKey] = {
                        tabs: [],
                        label: labelName,
                        isCurrentContext: false
                    };
                }
                tabsByContext[contextKey].tabs.push(tab);

                if (tab.id === realActiveTabId) {
                    tabsByContext[contextKey].isCurrentContext = true;
                }
            });

            let globalTabsToBackup = []; 
            let globalTabsToClose = [];  
            let sessionsToCreate = [];   

            const timestamp = new Date().toISOString();
            const dateGroup = new Date().toLocaleDateString('en-US');
            const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            for (const [contextKey, contextData] of Object.entries(tabsByContext)) {
                const groupTabs = contextData.tabs;
                const isCurrent = contextData.isCurrentContext;

                const sessionLinks = [];
                const sessionId = `clean-${contextKey}-${timestamp}`;

                groupTabs.forEach(tab => {
                    if (!isSystemLink(tab.url)) {
                        const link = {
                            url: tab.url, 
                            title: tab.title, 
                            timestamp, 
                            dateGroup,
                            category: extractDomain(tab.url), 
                            favicon: tab.favIconUrl || '',
                            windowId: tab.windowId,
                            workspaceId: tab.workspaceId,
                            sessionId,
                            sessionLabel: `${timeString} - ${contextData.label}`
                        };
                        sessionLinks.push(link);
                        globalTabsToBackup.push(link);
                    }
                });

                if (sessionLinks.length > 0) {
                    sessionsToCreate.push(sessionLinks);
                }

                const keepCount = isCurrent ? settings.keepLastTabs : 0;
                let candidatesToClose = [];

                if (keepCount === 0) {
                    candidatesToClose = groupTabs;
                } else {
                    if (groupTabs.length > keepCount) {
                        candidatesToClose = groupTabs.slice(0, -keepCount);
                    }
                }

                const filteredToClose = candidatesToClose.filter(tab => {
                    const isWhitelisted = whitelist.some(pattern => {
                        try {
                            const url = new URL(tab.url);
                            return url.hostname === pattern || url.hostname.endsWith('.' + pattern);
                        } catch { return false; }
                    });
                    return !isWhitelisted;
                });

                globalTabsToClose = globalTabsToClose.concat(filteredToClose);
            }

            if (globalTabsToClose.length === 0 && sessionsToCreate.length === 0) {
                showStatus('Nothing to clean or save.', 'info');
                return;
            }

            // --- WAIT FOR USER CONFIRMATION ---
            if (settings.confirmBeforeClose) {
                let msg = `SUMMARY (${isGlobal ? 'Global' : 'Current Window'}):\n\n`;
                msg += `💾 Saving: ${globalTabsToBackup.length} tabs\n`;
                msg += `🧹 Closing: ${globalTabsToClose.length} tabs\n`;
                
                const totalContexts = Object.keys(tabsByContext).length;
                const createdSessions = sessionsToCreate.length;
                if (createdSessions < totalContexts) {
                    msg += `(Skipped ${totalContexts - createdSessions} empty/system workspaces)\n`;
                }
                
                const userConfirmed = await showCustomConfirm(msg);
                if (!userConfirmed) return;
            }

            // --- CRITICAL FIX: READ DATA NOW, JUST BEFORE SAVING ---
            // This prevents overwriting data if changes happened while modal was open
            const freshData = await chrome.storage.local.get(['savedLinks']);
            let currentSavedLinks = freshData.savedLinks || [];

            const allNewLinksFlat = sessionsToCreate.flat();
            const updatedLinks = [...allNewLinksFlat, ...currentSavedLinks];
            
            await chrome.storage.local.set({ savedLinks: updatedLinks });

            if (settings.autoBackup && globalTabsToBackup.length > 0) {
                await chrome.runtime.sendMessage({ 
                    action: 'createBackup', 
                    links: globalTabsToBackup, 
                    tabsClosed: globalTabsToClose.length 
                });
            }

            if (globalTabsToClose.length > 0) {
                await chrome.tabs.remove(globalTabsToClose.map(t => t.id));
                showStatus(`✅ Cleaned & Saved!`, 'success');
            } else {
                showStatus(`✅ Saved!`, 'success');
            }
            
            setTimeout(updateStats, 500);

          } catch (error) {
            console.error('Error during Tab Clean:', error);
            showStatus('❌ Error processing tabs', 'error');
          } finally {
            setTimeout(() => {
                cleanBtn.disabled = false;
                cleanBtn.innerHTML = originalText;
            }, 1000);
          }
        });
    }

    const viewLinksBtn = document.getElementById('viewLinksBtn');
    if (viewLinksBtn) {
        viewLinksBtn.addEventListener('click', async () => {
             const targetUrl = chrome.runtime.getURL('saved-links.html');
             
             // 1. Get the current active tab to identify the CURRENT Workspace context
             const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
             const currentActiveTab = activeTabs[0];

             if (currentActiveTab) {
                 // 2. Find existing saved-links tabs in the SAME WINDOW ID
                 const existingTabs = await chrome.tabs.query({ url: targetUrl, windowId: currentActiveTab.windowId });
                 
                 // 3. SMART FILTER: Check if it's in the SAME Workspace
                 // Opera/Vivaldi share windowId across workspaces, but workspaceId differs.
                 const tabInSameWorkspace = existingTabs.find(t => t.workspaceId === currentActiveTab.workspaceId);
                 
                 if (tabInSameWorkspace) {
                     // Safe: Same visual context
                     await chrome.tabs.update(tabInSameWorkspace.id, { active: true });
                 } else {
                     // Not found in THIS workspace -> Create new (prevents crash by not switching workspaces)
                     await chrome.tabs.create({ url: 'saved-links.html' });
                 }
             } else {
                 // Fallback
                 await chrome.tabs.create({ url: 'saved-links.html' });
             }
        });
    }
    
    const optionsBtn = document.getElementById('optionsBtn');
    if (optionsBtn) optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

    const aboutLink = document.getElementById('aboutLink');
    if (aboutLink) aboutLink.addEventListener('click', () => chrome.tabs.create({ url: 'https://github.com/IvicaV/LeanTabs' }));
});