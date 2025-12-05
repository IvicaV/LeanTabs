/**
 * LeanTabs - The Smart Tab & Workspace Manager
 * @author Ivica Vrgoc
 * @repository https://github.com/IvicaV/LeanTabs
 * @description Script handling the Options page logic, backup management, and settings persistence.
 */

// --- START OF options.js (Final: Smart Import Redirect) ---

let whitelist = [];
let settings = {};

// SVG Icons (Matching saved-links.js for consistency)
const ICONS = {
  shield: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
  restore: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// --- MODAL HELPER ---
function showCustomModal(title, message, buttons) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const actionsEl = document.getElementById('modalActions');

    titleEl.textContent = title;
    msgEl.textContent = message;
    actionsEl.innerHTML = ''; // Clear previous buttons

    buttons.forEach(btnConfig => {
      const btn = document.createElement('button');
      btn.className = `btn-modal ${btnConfig.class || 'btn-modal-cancel'}`;
      btn.textContent = btnConfig.text;
      btn.onclick = () => {
        modal.classList.add('hidden');
        resolve(btnConfig.value);
      };
      actionsEl.appendChild(btn);
    });

    modal.classList.remove('hidden');
  });
}

function showSaveStatus(message, type = 'success') {
  const status = document.getElementById('saveStatus');
  status.textContent = message;
  status.className = `save-status ${type}`;
  setTimeout(() => { status.textContent = ''; }, 3000);
}

function renderWhitelist() {
  const container = document.getElementById('whitelistContainer');
  if (whitelist.length === 0) {
    container.innerHTML = '<p class="empty-state" style="padding:15px; font-size:12px;">No protected domains. Add some!</p>';
    return;
  }
  
  // Updated to use SVG Icons
  container.innerHTML = whitelist.map((domain, index) => `
    <div class="whitelist-item">
      <span style="display:flex; align-items:center; gap:8px;">${ICONS.shield} ${domain}</span>
      <button class="btn-icon-danger btn-delete" data-index="${index}" title="Delete File">
        ${ICONS.trash}
      </button>
    </div>
  `).join('');
}

function loadSettings() {
  const keepTabsInput = document.getElementById('keepTabsInput');
  if (keepTabsInput) keepTabsInput.value = settings.keepLastTabs;

  document.getElementById('autoBackupCheck').checked = settings.autoBackup;
  document.getElementById('confirmCheck').checked = settings.confirmBeforeClose;
  document.getElementById('deleteAfterRestoreCheck').checked = settings.deleteAfterRestore || false;
  document.getElementById('cleanAllWorkspacesCheck').checked = settings.cleanAllWorkspaces || false;
  document.getElementById('sessionsDefaultCollapsedCheck').checked = settings.sessionsDefaultCollapsed || false;
  document.getElementById('restoreWindowStructureCheck').checked = (settings.restoreWindowStructure !== undefined) ? settings.restoreWindowStructure : true;
  document.getElementById('smartImportCheck').checked = (settings.smartImport !== undefined) ? settings.smartImport : true;
  
  // Load Theme from localStorage (Synchronous for instant UI)
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.getElementById('darkModeCheck').checked = (currentTheme === 'dark');
}

function loadBackups(backups) {
  const container = document.getElementById('backupContainer');
  if (backups.length === 0) {
    container.innerHTML = '<p class="empty-state" style="padding:15px; font-size:12px;">No automatic backups available yet.</p>';
    return;
  }
  const sortedBackups = [...backups].reverse();
  
  const backupHTML = sortedBackups.map((backup, displayIndex) => {
    const originalIndex = backups.length - 1 - displayIndex;
    
    // --- SMART LABEL DISPLAY WITH PREFIX ---
    const displayTitle = backup.label 
        ? `Auto-Backup: ${backup.label}` 
        : `Backup #${backups.length - displayIndex}`;

    return `
      <div class="backup-item">
        <div style="display:flex; flex-direction:column; overflow:hidden;">
          <strong style="color:var(--primary); display:flex; align-items:center; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${displayTitle}">
            ${ICONS.box} ${displayTitle}
          </strong>
          <span style="font-size:11px; color:var(--text-muted); margin-left: 22px;">${backup.readableTime}</span>
          <span style="font-size:11px; color:var(--text-muted); margin-left: 22px;">${backup.count} links saved, ${backup.tabsClosed || 0} closed</span>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="btn btn-secondary btn-sm" data-backup-index="${originalIndex}" title="Restore">${ICONS.restore}</button>
          <button class="btn btn-secondary btn-sm" data-download-backup-index="${originalIndex}" title="Download JSON">${ICONS.download}</button>
          <button class="btn btn-danger btn-sm" data-delete-backup-index="${originalIndex}" title="Delete">${ICONS.trash}</button>
        </div>
      </div>
    `;
  }).join('');
  container.innerHTML = backupHTML;
}

async function loadData() {
  const data = await chrome.storage.local.get(['whitelist', 'settings', 'backups']);
  whitelist = data.whitelist || [];
  settings = data.settings || { 
    keepLastTabs: 3, 
    autoBackup: true, 
    confirmBeforeClose: true, 
    deleteAfterRestore: false,
    cleanAllWorkspaces: false,
    sessionsDefaultCollapsed: false,
    restoreWindowStructure: true,
    smartImport: true 
  };
  renderWhitelist();
  loadSettings();
  loadBackups(data.backups || []);
}

function initEventListeners() {
  const dashBtn = document.getElementById('goToDashboardBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', async () => {
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

  document.getElementById('whitelistContainer').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete');
    if (btn) {
      const index = parseInt(btn.dataset.index);
      whitelist.splice(index, 1);
      await chrome.storage.local.set({ whitelist });
      renderWhitelist();
      showSaveStatus('Domain removed!');
    }
  });

  document.getElementById('addWhitelistBtn').addEventListener('click', async () => {
    const input = document.getElementById('whitelistInput');
    const domain = input.value.trim();
    if (!domain) {
      showSaveStatus('Please enter a domain!', 'error');
      return;
    }
    let cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!cleanDomain.includes('.')) {
      showSaveStatus('Invalid domain! Example: gmail.com', 'error');
      return;
    }
    if (!whitelist.includes(cleanDomain)) {
      whitelist.push(cleanDomain);
      await chrome.storage.local.set({ whitelist });
      renderWhitelist();
      input.value = '';
      showSaveStatus('Domain added!');
    } else {
      showSaveStatus('Domain already exists!', 'error');
    }
  });

  document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('addWhitelistBtn').click();
  });

  document.getElementById('darkModeCheck').addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    try {
      let keepTabs = parseInt(document.getElementById('keepTabsInput').value);
      if (isNaN(keepTabs) || keepTabs < 1) keepTabs = 1;
      if (keepTabs > 20) keepTabs = 20;
      settings.keepLastTabs = keepTabs;
      settings.autoBackup = document.getElementById('autoBackupCheck').checked;
      settings.confirmBeforeClose = document.getElementById('confirmCheck').checked;
      settings.deleteAfterRestore = document.getElementById('deleteAfterRestoreCheck').checked;
      settings.cleanAllWorkspaces = document.getElementById('cleanAllWorkspacesCheck').checked;
      settings.sessionsDefaultCollapsed = document.getElementById('sessionsDefaultCollapsedCheck').checked;
      settings.restoreWindowStructure = document.getElementById('restoreWindowStructureCheck').checked;
      settings.smartImport = document.getElementById('smartImportCheck').checked;

      await chrome.storage.local.set({ settings });
      loadSettings();
      showSaveStatus('✅ Settings saved!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showSaveStatus('❌ Error saving!', 'error');
    }
  });

  document.getElementById('backupContainer').addEventListener('click', async (e) => {
    const restoreBtn = e.target.closest('[data-backup-index]');
    const downloadBtn = e.target.closest('[data-download-backup-index]');
    const deleteBtn = e.target.closest('[data-delete-backup-index]');

    if (restoreBtn) {
      const index = parseInt(restoreBtn.dataset.backupIndex);
      const data = await chrome.storage.local.get(['backups', 'savedLinks']);
      const backup = data.backups[index];
      const currentLinks = data.savedLinks || [];
      
      const choice = await showCustomModal(
          "Restore Backup?", 
          `Restore ${backup.count} links from ${backup.readableTime}?\nThis will add them to your saved links list.`,
          [
              { text: "Cancel", value: false, class: "btn-modal-cancel" },
              { text: "Restore Backup", value: true, class: "btn-modal-confirm" }
          ]
      );

      if (choice) {
        const timestamp = new Date().toISOString();
        const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const sessionId = `restored-${timestamp}`;
        const restoredLinks = backup.data.links.map(link => ({
          ...link, 
          originalTimestamp: link.timestamp, 
          sessionId, 
          sessionLabel: `${timeString} - Restored Backup`, 
          restoredAt: timestamp, 
          timestamp 
        }));
        const allLinks = [...restoredLinks, ...currentLinks];
        await chrome.storage.local.set({ savedLinks: allLinks });
        showSaveStatus('✅ Backup restored!', 'success');
        setTimeout(() => chrome.tabs.create({ url: 'saved-links.html' }), 1000);
      }
      return;
    }

    if (downloadBtn) {
      const index = parseInt(downloadBtn.dataset.downloadBackupIndex);
      const data = await chrome.storage.local.get(['backups']);
      const backup = data.backups[index];
      const timestamp = new Date(backup.timestamp).toISOString().slice(0, 10);
      const dataStr = JSON.stringify(backup.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leantabs-backup-${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSaveStatus('✅ Downloaded!', 'success');
      return;
    }

    if (deleteBtn) {
      const index = parseInt(deleteBtn.dataset.deleteBackupIndex);
      const data = await chrome.storage.local.get(['backups']);
      const backupList = data.backups || [];
      
      const choice = await showCustomModal(
          "Delete Backup?", 
          "Are you sure you want to permanently delete this backup file?",
          [
              { text: "Cancel", value: false, class: "btn-modal-cancel" },
              { text: "Delete Permanently", value: true, class: "btn-modal-danger" }
          ]
      );

      if (choice) {
        backupList.splice(index, 1);
        await chrome.storage.local.set({ backups: backupList });
        loadBackups(backupList);
        showSaveStatus('Backup deleted!', 'success');
      }
      return;
    }
  });

  document.getElementById('exportDataBtn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(null);
    const timestamp = new Date().toISOString().slice(0, 10);
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leantabs-full-backup-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSaveStatus('✅ Export complete!', 'success');
  });

  document.getElementById('importDataBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try {
          data = JSON.parse(text);
      } catch (e) {
          throw new Error('Invalid JSON format');
      }

      if (typeof data !== 'object' || data === null) {
        throw new Error('Imported file is not a valid JSON object.');
      }

      // --- NEW: CONFIG IMPORT LOGIC (Settings & Whitelist) ---
      // This block checks for configuration data and asks the user before overwriting.
      if (data.settings || data.whitelist) {
          const importConfig = await showCustomModal(
              "System Configuration Found",
              "This backup includes Settings and Whitelist data.\nDo you want to restore them? (Overwrites current settings)",
              [
                  { text: "No, Links Only", value: false, class: "btn-modal-cancel" },
                  { text: "Yes, Restore Config", value: true, class: "btn-modal-confirm" }
              ]
          );

          if (importConfig) {
              if (data.settings) {
                  settings = data.settings; // Update local var
                  await chrome.storage.local.set({ settings: data.settings });
              }
              if (data.whitelist) {
                  whitelist = data.whitelist; // Update local var
                  await chrome.storage.local.set({ whitelist: data.whitelist });
              }
              // Refresh UI immediately
              loadSettings();
              renderWhitelist();
              showSaveStatus("✅ Settings & Whitelist restored!");
          }
      }
      // --- END OF CONFIG IMPORT LOGIC ---

      let rawLinks = [];
      if (data.links && Array.isArray(data.links)) {
        rawLinks = data.links;
      } else if (data.savedLinks && Array.isArray(data.savedLinks)) {
        rawLinks = data.savedLinks;
      } else if (Array.isArray(data)) {
        rawLinks = data;
      }
      
      const linksToImport = rawLinks.filter(l => l && typeof l === 'object' && l.url);

      if (linksToImport.length === 0) {
        // If we imported settings but found no links, that's still a success, just finish here.
        if (data.settings || data.whitelist) return;
        
        showSaveStatus('❌ No valid links found!', 'error');
        return;
      }

      const currentData = await chrome.storage.local.get(['savedLinks']);
      const currentLinks = currentData.savedLinks || [];
      
      const getSignature = (l) => l.url + (l.originalTimestamp || l.timestamp);
      
      const existingSignatures = new Set(currentLinks.map(l => getSignature(l)));
      
      const cleanLinks = [];
      const duplicateLinks = [];

      linksToImport.forEach(link => {
          if (existingSignatures.has(getSignature(link))) {
              duplicateLinks.push(link);
          } else {
              cleanLinks.push(link);
          }
      });

      let finalImportList = [];
      let shouldImport = false;
      let preserveStructure = false; 

      // --- SMART RESTORE DETECTION ---
      const hasSessionStructure = linksToImport.some(l => l.sessionId && l.sessionLabel);

      if (hasSessionStructure) {
          const restoreMode = await showCustomModal(
              "Backup Detected", 
              `This file contains ${linksToImport.length} links with Session structure.\n\nHow do you want to restore them?`,
              [
                  { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                  { text: "Merge into 1 List", value: "merge", class: "btn-modal-secondary" },
                  { text: "Restore Sessions", value: "restore", class: "btn-modal-confirm" }
              ]
          );

          if (restoreMode === "cancel") return;
          
          if (restoreMode === "restore") {
              preserveStructure = true;
              
              if (duplicateLinks.length > 0) {
                  const dupChoice = await showCustomModal(
                      "Duplicates Found",
                      `Warning: ${duplicateLinks.length} links already exist.\nRestore duplicates anyway?`,
                      [
                          { text: "Skip Duplicates", value: "skip", class: "btn-modal-secondary" },
                          { text: "Restore All", value: "all", class: "btn-modal-confirm" }
                      ]
                  );
                  finalImportList = (dupChoice === 'all') ? linksToImport : cleanLinks;
              } else {
                  finalImportList = linksToImport;
              }
              shouldImport = true;
          } else {
              preserveStructure = false;
          }
      } 
      
      if (!preserveStructure && !shouldImport) {
          const useSmartImport = (settings.smartImport !== false); 
          
          if (!useSmartImport) {
              const confirmAll = await showCustomModal(
                "Confirm Import",
                `Import ${linksToImport.length} links into a new session?`,
                [
                  { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                  { text: "Import All", value: "all", class: "btn-modal-confirm" }
                ]
              );
              if (confirmAll === 'all') {
                 finalImportList = linksToImport;
                 shouldImport = true;
              }
          } else {
              if (duplicateLinks.length > 0) {
                  const choice = await showCustomModal(
                      "Duplicates Found", 
                      `Found ${linksToImport.length} links.\n⚠️ ${duplicateLinks.length} duplicates.\n✅ ${cleanLinks.length} unique.\n\nProceed?`,
                      [
                          { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                          { text: "Import All", value: "all", class: "btn-modal-secondary" },
                          { text: `Import ${cleanLinks.length} Unique`, value: "filter", class: "btn-modal-confirm" }
                  ]);
                  if (choice === 'filter') finalImportList = cleanLinks;
                  else if (choice === 'all') finalImportList = linksToImport;
                  if (choice !== 'cancel') shouldImport = true;
              } else {
                  const confirmUnique = await showCustomModal(
                      "Confirm Import",
                      `Import ${linksToImport.length} links?`,
                      [{ text: "Cancel", value: "cancel", class: "btn-modal-cancel" }, { text: "Import", value: "all", class: "btn-modal-confirm" }]
                  );
                  if (confirmUnique === 'all') {
                      finalImportList = linksToImport;
                      shouldImport = true;
                  }
              }
          }
      }

      if (shouldImport && finalImportList.length > 0) {
        let preparedLinks;
        const timestamp = new Date().toISOString();
        const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        if (preserveStructure) {
            // --- FIX: Prevent merging by re-mapping Session IDs ---
            const importTimestampSuffix = Date.now();
            const sessionIdMap = {}; // Maps old sessionID -> new unique sessionID

            preparedLinks = finalImportList.map(link => {
                const oldSessionId = link.sessionId || 'unknown';
                
                // If we haven't seen this session ID in this import batch yet, generate a new one
                if (!sessionIdMap[oldSessionId]) {
                    // Append import timestamp to make it unique, even if "manual-save-today" already exists locally
                    sessionIdMap[oldSessionId] = `${oldSessionId}-imported-${importTimestampSuffix}`;
                }

                return {
                    ...link,
                    sessionId: sessionIdMap[oldSessionId], // Assign new unique ID
                    uniqueId: `${link.url}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                    importedAt: timestamp
                };
            });
            showSaveStatus(`✅ Restored ${preparedLinks.length} links & sessions!`, 'success');

        } else {
            const sessionId = `imported-${timestamp}`;
            preparedLinks = finalImportList.map(link => ({
                ...link, 
                originalTimestamp: link.timestamp, 
                sessionId, 
                sessionLabel: `${timeString} - Imported Backup`, 
                importedAt: timestamp, 
                timestamp 
            }));
            showSaveStatus(`✅ Imported ${preparedLinks.length} links!`, 'success');
        }

        const allLinks = [...preparedLinks, ...currentLinks];
        await chrome.storage.local.set({ savedLinks: allLinks });
        
        // --- SMART REDIRECT AFTER IMPORT ---
        setTimeout(async () => {
            const targetUrl = chrome.runtime.getURL('saved-links.html');
            const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentActiveTab = activeTabs[0];

            if (currentActiveTab) {
                const existingTabs = await chrome.tabs.query({ url: targetUrl, windowId: currentActiveTab.windowId });
                const tabInSameWorkspace = existingTabs.find(t => t.workspaceId === currentActiveTab.workspaceId);
                
                if (tabInSameWorkspace) {
                    await chrome.tabs.update(tabInSameWorkspace.id, { active: true });
                } else {
                    await chrome.tabs.create({ url: 'saved-links.html' });
                }
            } else {
                await chrome.tabs.create({ url: 'saved-links.html' });
            }
        }, 1000);
        // -----------------------------------

      } else if (shouldImport && finalImportList.length === 0) {
         showSaveStatus('⚠️ No links selected to import.', 'error');
      }

    } catch (error) {
      showSaveStatus('❌ Import error!', 'error');
      console.error("Import error:", error);
    }
    e.target.value = '';
  });

  // Footer Links Handlers
  const aboutLink = document.getElementById('aboutLink');
  if (aboutLink) {
    aboutLink.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/IvicaV/LeanTabs' });
    });
  }

  const kofiLink = document.getElementById('kofiLink');
  if (kofiLink) {
    kofiLink.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://ko-fi.com/ivicav' });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadData();
});