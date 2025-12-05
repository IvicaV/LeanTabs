/**
 * LeanTabs - The Smart Tab & Workspace Manager
 * @author Ivica Vrgoc
 * @repository https://github.com/IvicaV/LeanTabs
 * @description Script handling the Dashboard UI, drag & drop, link management, and restoring sessions.
 */

// --- START OF saved-links.js (Final: Smart Import Refresh & UI State Sync) ---

let allLinks = [];
let filteredLinks = [];
let selectedLinks = new Set();
let collapsedSessions = new Set(); 
let sessionsDefaultCollapsed = false; 
let isUpdatingMasterCheckbox = false;
let visibleLimit = 100; 

// Track background updates to refresh UI upon visibility
let hasPendingUpdate = false;

// SVG Icons Constants
const ICONS = {
  check: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restore: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replace: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tag: '<svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M2.05 10.5a.75.75 0 0 1 0-1.06l9.69-9.69A.75.75 0 0 1 12.27.22h7.95a.75.75 0 0 1 .75.75v7.95a.75.75 0 0 1-.22.53l-9.69 9.69a.75.75 0 0 1-1.06 0l-7.95-7.95Z"/></svg>',
  shield: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronDown: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronRight: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.4 14.6L17 10.2V4h2V2H5v2h2v6.2l-4.4 4.4v2h8v6l1 2 1-2v-6h8v-2z"/></svg>',
  box: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
  move: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M5 9l7-7 7 7"/><path d="M12 2v14"/><path d="M19 15v6H5v-6"/></svg>',
  arrowUp: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// Listener for live theme changes
window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
        document.documentElement.setAttribute('data-theme', e.newValue);
    }
});

// --- ROBUSTNESS: Sync Data across Tabs ---
// UPDATED LOGIC: Handles updates even if tab is in background (via Pending Flag)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.savedLinks || changes.settings)) {
    if (!document.hidden) {
       loadLinks(); 
       hasPendingUpdate = false;
    } else {
       // Mark as stale so we update immediately upon focusing
       hasPendingUpdate = true;
    }
  }
});

// Listen for tab focus/visibility to apply pending updates (e.g., after Import from Options)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && hasPendingUpdate) {
        loadLinks();
        hasPendingUpdate = false;
    }
});

// --- CUSTOM MODAL HELPER ---
function showCustomModal(title, message, buttons, inputConfig = null) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const actionsEl = document.getElementById('modalActions');
    const inputEl = document.getElementById('modalInput');
    const selectEl = document.getElementById('modalSelect');

    titleEl.textContent = title;
    msgEl.textContent = message;
    actionsEl.innerHTML = ''; 

    // Reset visibility
    inputEl.classList.remove('visible');
    selectEl.style.display = 'none';
    inputEl.value = '';
    selectEl.innerHTML = '';

    // Handle Input/Select Logic
    if (inputConfig) {
        if (inputConfig.type === 'select') {
            // SELECT MODE
            selectEl.style.display = 'block';
            
            // Populate options
            inputConfig.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                selectEl.appendChild(option);
            });
            
            setTimeout(() => selectEl.focus(), 100);
        } else {
            // TEXT INPUT MODE
            inputEl.value = inputConfig.defaultValue || '';
            inputEl.placeholder = inputConfig.placeholder || '';
            inputEl.classList.add('visible');
            setTimeout(() => inputEl.focus(), 100);
        }
    }

    buttons.forEach(btnConfig => {
      const btn = document.createElement('button');
      btn.className = `btn-modal ${btnConfig.class || 'btn-modal-cancel'}`;
      btn.textContent = btnConfig.text;
      
      btn.onclick = () => {
        // Determine return value based on input type
        let valueToReturn = btnConfig.value;
        
        if (btnConfig.value === true && inputConfig) {
            if (inputConfig.type === 'select') {
                valueToReturn = selectEl.value;
            } else {
                valueToReturn = inputEl.value;
            }
        }
        
        modal.classList.add('hidden');
        resolve(valueToReturn);
      };
      actionsEl.appendChild(btn);
    });

    // Handle Enter key for Input
    if (inputConfig && inputConfig.type !== 'select') {
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                 const confirmBtn = buttons.find(b => b.value === true);
                 if (confirmBtn) {
                     modal.classList.add('hidden');
                     resolve(inputEl.value);
                 }
            }
        };
    }

    modal.classList.remove('hidden');
  });
}

async function fetchTitleFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const text = await response.text();
    const matches = text.match(/<title>([^<]*)<\/title>/i);
    if (matches && matches[1]) {
      const doc = new DOMParser().parseFromString(matches[1], "text/html");
      return doc.documentElement.textContent.trim().substring(0, 150); 
    }
    return url; 
  } catch (error) { return url; }
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length >= 2) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return 'Other';
  } catch { return 'Other'; }
}

async function loadLinks() {
  const data = await chrome.storage.local.get(['savedLinks', 'settings']);
  allLinks = data.savedLinks || [];
  
  let needsSave = false;
  allLinks.forEach((link, index) => {
    if (!link.uniqueId) {
      link.uniqueId = `${link.url}-${link.timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`;
      needsSave = true;
    }
  });
  if (needsSave) await chrome.storage.local.set({ savedLinks: allLinks });
  
  filteredLinks = [...allLinks];
  const settings = data.settings || {};
  sessionsDefaultCollapsed = settings.sessionsDefaultCollapsed || false;
  
  const toggleBtn = document.getElementById('toggleAllBtn');
  if (toggleBtn) {
      toggleBtn.innerHTML = sessionsDefaultCollapsed 
        ? `<span class="icon">▶</span> Expand All` 
        : `<span class="icon">▼</span> Collapse All`;
  }
  
  collapsedSessions.clear();
  updateSelectionBar();
  
  const categories = new Set(allLinks.map(link => link.category));
  updateCategoryFilter(categories);
  const windowIds = new Set(allLinks.map(link => link.sessionLabel).filter(Boolean));
  updateWindowFilter(windowIds);
  
  renderLinks();
  updateStats();
}

function updateCategoryFilter(categories) {
  const select = document.getElementById('categoryFilter');
  select.innerHTML = '<option value="">All Categories</option>';
  
  // FIX: SORT CATEGORIES ALPHABETICALLY
  const sortedCategories = Array.from(categories).sort();
  
  sortedCategories.forEach(cat => {
    if (!cat) return; 
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

function updateWindowFilter(windowLabels) {
  const select = document.getElementById('windowFilter');
  select.innerHTML = '<option value="">All Windows</option>';
  
  // FIX: SORT WINDOWS ALPHABETICALLY
  const uniqueLabels = Array.from(windowLabels).sort();
  
  uniqueLabels.forEach(label => {
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label;
    select.appendChild(option);
  });
}

function getLinkKey(link) {
  if (link.uniqueId) return link.uniqueId;
  const uniqueTimestamp = link.originalTimestamp || link.timestamp;
  return `${link.url}-${uniqueTimestamp}`;
}

function updateSelectionBar() {
  const selectedInfo = document.getElementById('selectedInfo');
  const count = document.getElementById('selectionCount');
  count.textContent = selectedLinks.size;
  if (selectedLinks.size > 0) selectedInfo.classList.remove('hidden');
  else selectedInfo.classList.add('hidden');
  
  isUpdatingMasterCheckbox = true;
  document.querySelectorAll('.master-checkbox').forEach(checkbox => {
    const sessionId = checkbox.dataset.sessionId;
    const sessionLinks = filteredLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId === sessionId;
    });
    const selectedInSession = sessionLinks.filter(link => selectedLinks.has(getLinkKey(link))).length;
    const newCheckedState = selectedInSession > 0 && selectedInSession === sessionLinks.length;
    const newIndeterminateState = selectedInSession > 0 && selectedInSession < sessionLinks.length;
    
    if (checkbox.checked !== newCheckedState || checkbox.indeterminate !== newIndeterminateState) {
      checkbox.indeterminate = newIndeterminateState;
      checkbox.checked = newCheckedState;
    }
  });
  isUpdatingMasterCheckbox = false;
}

function renderLinks() {
  const container = document.getElementById('linksContainer');
  
  if (filteredLinks.length === 0) {
    container.innerHTML = `
        <div class="empty-state">
           <div style="opacity:0.3; margin-bottom:15px; transform: scale(2); display:inline-block;">${ICONS.box}</div>
           <h3 style="margin-bottom:8px; color:var(--text-strong); font-size:16px;">No saved sessions yet</h3>
           <p style="max-width:360px; margin:0 auto; font-size:13px; color:var(--text-muted); line-height:1.6;">
             Use <strong>Run Tab Clean</strong> in the extension popup.<br>
             Or <strong>Right-Click</strong> any page to save it instantly.<br>
             <span style="opacity:0.7; font-size:12px; margin-top:8px; display:block;">Pro Tip: Press Alt+Shift+C to clean instantly.</span>
           </p>
        </div>
    `;
    const sessionCountEl = document.getElementById('sessionCount');
    if (sessionCountEl) sessionCountEl.textContent = '0';
    return;
  }
  
  const groupedBySession = {};
  const validLinks = filteredLinks.filter(link => link && link.url);

  validLinks.forEach(link => {
    const sessionKey = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
    if (!groupedBySession[sessionKey]) {
      groupedBySession[sessionKey] = { 
          label: link.sessionLabel || `${link.dateGroup}`, 
          links: [], 
          timestamp: link.timestamp, 
          dateGroup: link.dateGroup 
      };
    }
    groupedBySession[sessionKey].links.push(link);
  });

  const sessionCountEl = document.getElementById('sessionCount');
  if (sessionCountEl) sessionCountEl.textContent = Object.keys(groupedBySession).length;

  const sortedSessions = Object.entries(groupedBySession).sort((a, b) => {
      const isPinnedA = a[1].links[0].isPinned ? 1 : 0;
      const isPinnedB = b[1].links[0].isPinned ? 1 : 0;
      if (isPinnedA !== isPinnedB) return isPinnedB - isPinnedA; 
      return new Date(b[1].timestamp) - new Date(a[1].timestamp);
  });

  container.innerHTML = '';
  
  const sessionsToRender = sortedSessions.slice(0, visibleLimit);
  
  sessionsToRender.forEach(([sessionId, session]) => {
    const sessionSection = document.createElement('div');
    const isPinned = session.links[0].isPinned || false;
    sessionSection.className = `session-section ${isPinned ? 'pinned' : ''}`; 
    
    const sessionHeader = document.createElement('div');
    sessionHeader.className = 'session-header';
    sessionHeader.dataset.sessionId = sessionId;
    
    let isCollapsed;
    if (collapsedSessions.has(`collapsed-${sessionId}`)) {
      isCollapsed = true;
    } else if (collapsedSessions.has(`expanded-${sessionId}`)) {
      isCollapsed = false;
    } else {
      isCollapsed = sessionsDefaultCollapsed;
    }
    
    const sessionLeft = document.createElement('div');
    sessionLeft.className = 'session-left';

    const topRow = document.createElement('div');
    topRow.className = 'session-meta-row';

    const collapseIndicator = document.createElement('span');
    collapseIndicator.className = 'collapse-indicator';
    collapseIndicator.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;
    collapseIndicator.dataset.sessionId = sessionId;

    const masterCheckbox = document.createElement('input');
    masterCheckbox.type = 'checkbox';
    masterCheckbox.className = 'master-checkbox';
    masterCheckbox.name = `session-select-${sessionId}`; 
    masterCheckbox.dataset.sessionId = sessionId;
    masterCheckbox.title = 'Select all';
    
    const dateBadge = document.createElement('span');
    dateBadge.className = 'session-date-badge';
    dateBadge.textContent = session.dateGroup;

    topRow.appendChild(collapseIndicator);
    topRow.appendChild(masterCheckbox);
    topRow.appendChild(dateBadge);

    const headerText = document.createElement('h2');
    headerText.className = 'session-title';
    const labelWithoutEmoji = session.label.replace(/^📅\s*/, '').replace(/\s*\(\d+\s+Tabs\)$/, '');
    headerText.textContent = labelWithoutEmoji;
    headerText.dataset.sessionId = sessionId;
    headerText.title = labelWithoutEmoji; // FIX: Show full title on hover
    
    headerText.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.activeElement !== headerText) {
        headerText.dataset.originalText = headerText.textContent; 
        headerText.contentEditable = 'true';
        headerText.focus();
        const range = document.createRange();
        range.selectNodeContents(headerText);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    
    headerText.addEventListener('blur', async (e) => {
      headerText.contentEditable = 'false';
      let newLabel = e.target.textContent.trim();
      newLabel = newLabel.replace(/^📅\s*/, '').replace(/\s*\(\d+\s+Tabs\)$/, '');
      if (!newLabel) newLabel = headerText.dataset.originalText || labelWithoutEmoji;
      
      if (newLabel && newLabel !== labelWithoutEmoji) {
        const freshData = await chrome.storage.local.get(['savedLinks']);
        allLinks = freshData.savedLinks || [];
        allLinks.forEach(link => {
          const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
          if (linkSessionId === sessionId) link.sessionLabel = newLabel;
        });
        await chrome.storage.local.set({ savedLinks: allLinks });
      }
      headerText.textContent = newLabel;
    });
    
    headerText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); headerText.blur(); }
      if (e.key === 'Escape') {
          e.preventDefault();
          if (headerText.dataset.originalText) headerText.textContent = headerText.dataset.originalText;
          headerText.blur(); 
      }
    });

    const subText = document.createElement('div');
    subText.className = 'tab-count';
    subText.textContent = `${session.links.length} Tabs stored`;
    
    // --- SELECTION ACTION BAR (SAFE CONTAINER - MOVED TO LEFT SIDE) ---
    const selectionActions = document.createElement('div');
    selectionActions.className = 'selection-actions'; 
    selectionActions.dataset.sessionId = sessionId;
    selectionActions.style.display = 'none';
    
    const openSelectedBtn = document.createElement('button');
    openSelectedBtn.className = 'btn-session btn-action-select';
    openSelectedBtn.innerHTML = ICONS.link;
    openSelectedBtn.dataset.action = 'openSelected';
    openSelectedBtn.dataset.sessionId = sessionId;
    openSelectedBtn.title = 'Open Selected';
    
    const moveSelectedBtn = document.createElement('button');
    moveSelectedBtn.className = 'btn-session btn-action-select';
    moveSelectedBtn.innerHTML = ICONS.move; 
    moveSelectedBtn.dataset.action = 'moveSelected';
    moveSelectedBtn.dataset.sessionId = sessionId;
    moveSelectedBtn.title = 'Move Selected to other Session';

    const deleteSelectedBtn = document.createElement('button');
    deleteSelectedBtn.className = 'btn-session btn-action-delete-select';
    deleteSelectedBtn.innerHTML = ICONS.trash;
    deleteSelectedBtn.dataset.action = 'deleteSelected';
    deleteSelectedBtn.dataset.sessionId = sessionId;
    deleteSelectedBtn.title = 'Delete Selected';
    
    selectionActions.appendChild(openSelectedBtn);
    selectionActions.appendChild(moveSelectedBtn); 
    selectionActions.appendChild(deleteSelectedBtn);

    // --- APPEND LEFT SIDE ELEMENTS ---
    sessionLeft.appendChild(topRow);
    sessionLeft.appendChild(headerText);
    sessionLeft.appendChild(subText);
    sessionLeft.appendChild(selectionActions); // <--- MOVED HERE

    // --- RIGHT SIDE BUTTONS ---
    const sessionActions = document.createElement('div');
    sessionActions.className = 'session-actions';
    
    const restoreSessionBtn = document.createElement('button');
    restoreSessionBtn.className = 'btn-session btn-restore';
    restoreSessionBtn.innerHTML = ICONS.restore;
    restoreSessionBtn.dataset.sessionId = sessionId;
    restoreSessionBtn.title = 'Restore Session (Append)';

    const replaceSessionBtn = document.createElement('button');
    replaceSessionBtn.className = 'btn-session btn-replace';
    replaceSessionBtn.innerHTML = ICONS.replace;
    replaceSessionBtn.dataset.sessionId = sessionId;
    replaceSessionBtn.dataset.action = 'restoreReplace';
    replaceSessionBtn.title = 'Replace current tabs. WARNING: Tabs closed will not be saved!';

    const downloadSessionBtn = document.createElement('button');
    downloadSessionBtn.className = 'btn-session';
    downloadSessionBtn.innerHTML = ICONS.download;
    downloadSessionBtn.dataset.sessionId = sessionId;
    downloadSessionBtn.dataset.action = 'downloadSession';
    downloadSessionBtn.title = 'Export Session (Safe to Share)';

    const bumpSessionBtn = document.createElement('button');
    bumpSessionBtn.className = 'btn-session';
    bumpSessionBtn.innerHTML = ICONS.arrowUp;
    bumpSessionBtn.dataset.sessionId = sessionId;
    bumpSessionBtn.dataset.action = 'bumpSession';
    bumpSessionBtn.title = 'Push to Top';

    const pinSessionBtn = document.createElement('button');
    pinSessionBtn.className = `btn-session btn-pin ${isPinned ? 'active' : ''}`;
    pinSessionBtn.innerHTML = ICONS.pin;
    pinSessionBtn.dataset.sessionId = sessionId;
    pinSessionBtn.dataset.action = 'togglePin';
    pinSessionBtn.title = isPinned ? 'Unpin Session' : 'Pin Session';

    const deleteSessionBtn = document.createElement('button');
    deleteSessionBtn.className = 'btn-session btn-delete';
    deleteSessionBtn.innerHTML = ICONS.trash;
    deleteSessionBtn.dataset.sessionId = sessionId;
    deleteSessionBtn.title = 'Delete Session';
    
    sessionActions.appendChild(replaceSessionBtn); 
    sessionActions.appendChild(restoreSessionBtn);
    sessionActions.appendChild(downloadSessionBtn);
    sessionActions.appendChild(bumpSessionBtn);
    sessionActions.appendChild(pinSessionBtn); 
    sessionActions.appendChild(deleteSessionBtn);
    
    sessionHeader.appendChild(sessionLeft);
    sessionHeader.appendChild(sessionActions);
    sessionSection.appendChild(sessionHeader);
    
    const linksList = document.createElement('div');
    linksList.className = 'links-list';
    linksList.dataset.sessionId = sessionId;
    
    if (isCollapsed) {
      linksList.style.display = 'none';
    }

    const addLinkArea = document.createElement('div');
    addLinkArea.className = 'add-link-area';
    addLinkArea.innerHTML = `
        <input type="text" class="add-link-input" placeholder="Paste URL to add..." data-session-id="${sessionId}">
        <button class="btn btn-primary btn-sm btn-add-link" data-session-id="${sessionId}">Add Link</button>
    `;
    linksList.appendChild(addLinkArea);
    
    session.links.forEach((link) => {
      try {
          const linkItem = createLinkElement(link);
          linksList.appendChild(linkItem);
      } catch (err) {
          console.error("Skipping corrupted link", err);
      }
    });
    sessionSection.appendChild(linksList);
    container.appendChild(sessionSection);
  });
  
  if (sortedSessions.length > visibleLimit) {
      const loadMoreContainer = document.createElement('div');
      loadMoreContainer.style.textAlign = 'center';
      loadMoreContainer.style.padding = '20px';
      loadMoreContainer.style.gridColumn = '1 / -1'; 
      
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn btn-secondary'; 
      loadMoreBtn.textContent = `Load More Sessions (${sortedSessions.length - visibleLimit} remaining)`;
      loadMoreBtn.style.minWidth = '200px';
      loadMoreBtn.onclick = () => { visibleLimit += 50; renderLinks(); };
      
      loadMoreContainer.appendChild(loadMoreBtn);
      container.appendChild(loadMoreContainer);
  }
  updateSessionActionButtons();
}

function updateSessionActionButtons() {
  document.querySelectorAll('.selection-actions').forEach(actionsDiv => {
    const sessionId = actionsDiv.dataset.sessionId;
    const sessionLinks = filteredLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId === sessionId;
    });
    const selectedCount = sessionLinks.filter(link => {
      const key = getLinkKey(link);
      return selectedLinks.has(key);
    }).length;
    
    // Visibility Logic
    if (selectedCount > 0) {
        actionsDiv.style.display = 'flex';
    } else {
        actionsDiv.style.display = 'none';
    }
  });
}

function createLinkElement(link) {
  let hostname = "Unknown";
  try { hostname = new URL(link.url).hostname.replace('www.',''); } catch(e) { hostname = "Invalid URL"; }

  const div = document.createElement('div');
  div.className = 'link-item';
  div.setAttribute('draggable', 'true');

  const linkKey = getLinkKey(link);
  const isSelected = selectedLinks.has(linkKey);
  if (isSelected) div.classList.add('selected');
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'link-checkbox';
  checkbox.dataset.linkKey = linkKey; 
  if (isSelected) checkbox.checked = true;

  const linkInfo = document.createElement('div');
  linkInfo.className = 'link-info';

  const linkHeader = document.createElement('div');
  linkHeader.className = 'link-header';

  if (link.favicon) {
      const img = document.createElement('img');
      img.src = link.favicon;
      img.className = 'favicon';
      img.onerror = () => { img.style.display = 'none'; }; 
      linkHeader.appendChild(img);
  } else {
      const fallback = document.createElement('span');
      fallback.style.fontSize = '14px';
      fallback.textContent = '📄';
      linkHeader.appendChild(fallback);
  }

  const linkTitle = document.createElement('a');
  linkTitle.href = link.url;
  linkTitle.target = "_blank";
  linkTitle.className = 'link-title';
  linkTitle.textContent = link.title || link.url; 
  linkHeader.appendChild(linkTitle);

  const date = new Date(link.timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const linkMeta = document.createElement('div');
  linkMeta.className = 'link-meta';
  
  const categorySpan = document.createElement('span');
  categorySpan.className = 'link-category';
  categorySpan.dataset.category = link.category;
  categorySpan.innerHTML = ICONS.tag + ' '; 
  categorySpan.appendChild(document.createTextNode(link.category)); 
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'link-time';
  timeSpan.textContent = time;

  const urlSpan = document.createElement('span');
  urlSpan.className = 'link-url';
  urlSpan.textContent = hostname;

  linkMeta.appendChild(timeSpan);
  linkMeta.appendChild(categorySpan);
  linkMeta.appendChild(urlSpan);

  linkInfo.appendChild(linkHeader);
  linkInfo.appendChild(linkMeta);

  const linkActions = document.createElement('div');
  linkActions.className = 'link-actions';

  const createBtn = (iconHtml, className, title, dataAttributes = {}) => {
      const btn = document.createElement('button');
      btn.className = `btn-icon ${className}`;
      btn.innerHTML = iconHtml;
      btn.title = title;
      Object.keys(dataAttributes).forEach(key => {
          btn.dataset[key] = dataAttributes[key];
      });
      return btn;
  };

  linkActions.appendChild(createBtn(ICONS.shield, 'btn-link-whitelist', 'Add to Whitelist', { url: link.url }));
  linkActions.appendChild(createBtn(ICONS.tag, 'btn-link-category', 'Edit Category', { action: 'category', url: link.url }));
  linkActions.appendChild(createBtn(ICONS.link, 'btn-link-open', 'Open Tab', { action: 'open', url: link.url }));
  linkActions.appendChild(createBtn(ICONS.trash, 'btn-link-delete', 'Delete', { action: 'delete', url: link.url, timestamp: link.timestamp }));

  div.appendChild(checkbox);
  div.appendChild(linkInfo);
  div.appendChild(linkActions);

  div.addEventListener('dragstart', handleDragStart);
  div.addEventListener('dragenter', handleDragEnter);
  div.addEventListener('dragover', handleDragOver);
  div.addEventListener('dragleave', handleDragLeave);
  div.addEventListener('drop', handleDrop);
  div.addEventListener('dragend', handleDragEnd);

  return div;
}

function toggleSessionCollapse(sessionId) {
  const linksList = document.querySelector(`.links-list[data-session-id="${sessionId}"]`);
  const indicator = document.querySelector(`.collapse-indicator[data-session-id="${sessionId}"]`);
  if (!linksList || !indicator) return;
  const isCurrentlyCollapsed = linksList.style.display === 'none';
  if (isCurrentlyCollapsed) {
    collapsedSessions.delete(`collapsed-${sessionId}`);
    collapsedSessions.add(`expanded-${sessionId}`);
    linksList.style.display = 'block';
    indicator.innerHTML = ICONS.chevronDown;
  } else {
    collapsedSessions.add(`collapsed-${sessionId}`);
    collapsedSessions.delete(`expanded-${sessionId}`);
    linksList.style.display = 'none';
    indicator.innerHTML = ICONS.chevronRight;
  }
}

document.getElementById('linksContainer').addEventListener('click', (e) => {
  const sessionHeader = e.target.closest('.session-header');
  if (sessionHeader && 
      !e.target.closest('.session-title') && 
      !e.target.closest('.btn-session') && 
      !e.target.closest('.master-checkbox') &&
      !e.target.closest('.session-actions')) {
    const sessionId = sessionHeader.dataset.sessionId;
    if (sessionId) toggleSessionCollapse(sessionId);
  }
});

document.getElementById('linksContainer').addEventListener('change', (e) => {
  if (e.target.classList.contains('link-checkbox')) {
    const linkKey = e.target.dataset.linkKey;
    if (e.target.checked) {
      selectedLinks.add(linkKey);
      e.target.closest('.link-item').classList.add('selected');
    } else {
      selectedLinks.delete(linkKey);
      e.target.closest('.link-item').classList.remove('selected');
    }
    updateSelectionBar();
    updateSessionActionButtons();
  }
  if (e.target.classList.contains('master-checkbox')) {
    if (isUpdatingMasterCheckbox) return;
    e.stopPropagation();
    const sessionId = e.target.dataset.sessionId;
    const sessionLinks = filteredLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId === sessionId;
    });
    const isChecking = e.target.checked;
    const sessionLinkKeys = new Set(sessionLinks.map(link => getLinkKey(link)));
    if (isChecking) {
      sessionLinkKeys.forEach(key => selectedLinks.add(key));
    } else {
      sessionLinkKeys.forEach(key => selectedLinks.delete(key));
    }
    const allCheckboxes = document.querySelectorAll('.link-checkbox');
    allCheckboxes.forEach(checkbox => {
      const checkboxKey = checkbox.dataset.linkKey;
      if (sessionLinkKeys.has(checkboxKey)) {
        checkbox.checked = isChecking;
        const linkItem = checkbox.closest('.link-item');
        if (isChecking) linkItem.classList.add('selected');
        else linkItem.classList.remove('selected');
      }
    });
    updateSelectionBar();
    updateSessionActionButtons();
  }
});

document.getElementById('goToSettingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
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

document.getElementById('linksContainer').addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-add-link')) {
    e.stopImmediatePropagation();
    const btn = e.target;
    const sessionId = btn.dataset.sessionId;
    const input = btn.previousElementSibling;
    const url = input.value.trim();
    if (!url) return;
    let validUrl = url;
    if (!/^https?:\/\//i.test(url)) validUrl = 'https://' + url;
    try { new URL(validUrl); } catch (_) { 
        await showCustomModal("Invalid URL", "Please enter a valid web address.", [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
        return; 
    }
    const originalBtnText = btn.textContent;
    btn.textContent = "...";
    btn.disabled = true;
    input.disabled = true;
    const fetchedTitle = await fetchTitleFromUrl(validUrl);

    const freshData = await chrome.storage.local.get(['savedLinks']);
    allLinks = freshData.savedLinks || [];

    const sessionSample = allLinks.find(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === sessionId);
    const timestamp = new Date().toISOString();
    const dateGroup = new Date().toLocaleDateString('en-US');
    const newLink = {
        url: validUrl,
        title: fetchedTitle,
        timestamp: timestamp,
        dateGroup: sessionSample ? sessionSample.dateGroup : dateGroup,
        category: extractDomain(validUrl),
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(validUrl).hostname}&sz=32`,
        sessionId: sessionId,
        sessionLabel: sessionSample ? sessionSample.sessionLabel : 'Manually Added',
        uniqueId: `${validUrl}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
        isPinned: sessionSample ? sessionSample.isPinned : false 
    };
    allLinks.unshift(newLink); 
    await chrome.storage.local.set({ savedLinks: allLinks });
    input.value = ''; 
    btn.textContent = originalBtnText;
    btn.disabled = false;
    input.disabled = false;
    await loadLinks(); 
    return;
  }
  if (e.target.closest('[data-action="downloadSession"]')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('[data-action="downloadSession"]');
    const sessionId = btn.dataset.sessionId;
    const sessionLinks = allLinks.filter(link => {
        const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
        return linkSessionId === sessionId;
    });
    if(sessionLinks.length === 0) return;
    const rawLabel = sessionLinks[0].sessionLabel || 'session';
    const cleanName = rawLabel.replace(/[^a-z0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `leantabs-session-${cleanName}-${dateStr}.json`;
    const dataStr = JSON.stringify(sessionLinks, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (e.target.closest('[data-action="togglePin"]')) {
      e.stopImmediatePropagation();
      const btn = e.target.closest('[data-action="togglePin"]');
      const sessionId = btn.dataset.sessionId;
      const freshData = await chrome.storage.local.get(['savedLinks']);
      allLinks = freshData.savedLinks || [];
      const sessionLinks = allLinks.filter(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === sessionId);
      if (sessionLinks.length > 0) {
          const currentStatus = sessionLinks[0].isPinned || false;
          const newStatus = !currentStatus;
          allLinks.forEach(link => {
              const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
              if (linkSessionId === sessionId) link.isPinned = newStatus;
          });
          await chrome.storage.local.set({ savedLinks: allLinks });
          await loadLinks(); 
      }
      return;
  }
  if (e.target.closest('.btn-link-whitelist')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-whitelist');
    try {
        const urlStr = btn.dataset.url;
        const url = new URL(urlStr);
        let domain = url.hostname.replace(/^www\./, '');
        const data = await chrome.storage.local.get(['whitelist']);
        let whitelist = data.whitelist || [];
        if (whitelist.includes(domain)) {
            await showCustomModal("Already Whitelisted", `Domain "${domain}" is already in the Whitelist!`, [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
        } else {
            whitelist.push(domain);
            await chrome.storage.local.set({ whitelist });
            await showCustomModal("Whitelisted", `✅ Domain "${domain}" added to Whitelist!`, [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
        }
    } catch (error) { 
        console.error(error); 
        await showCustomModal("Error", 'Could not parse URL for whitelist.', [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
    }
    return;
  }
  if (e.target.closest('.btn-link-delete')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-delete');
    const url = btn.dataset.url;
    const timestamp = btn.dataset.timestamp;
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    
    if (settings.confirmBeforeClose !== false) {
        const confirmed = await showCustomModal(
            "Delete Link?", 
            "Are you sure you want to remove this link from your saved list?", 
            [
                { text: "Cancel", value: false, class: "btn-modal-cancel" },
                { text: "Delete", value: true, class: "btn-modal-danger" }
            ]
        );
        if (!confirmed) return;
    }
    const freshData = await chrome.storage.local.get(['savedLinks']);
    allLinks = freshData.savedLinks || [];
    const indexToDelete = allLinks.findIndex(link => link.url === url && link.timestamp === timestamp);
    if (indexToDelete !== -1) {
      allLinks.splice(indexToDelete, 1);
      await chrome.storage.local.set({ savedLinks: allLinks });
      await loadLinks();
    }
    return;
  }
  if (e.target.closest('.btn-link-open')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-open');
    window.open(btn.dataset.url, '_blank');
    return;
  }
  if (e.target.closest('.btn-link-category')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-category');
    const url = btn.dataset.url;
    const freshData = await chrome.storage.local.get(['savedLinks']);
    allLinks = freshData.savedLinks || [];
    const linkToUpdate = allLinks.find(link => link.url === url);
    if (linkToUpdate) {
      const newCategory = await showCustomModal(
          "Edit Category", 
          "Enter a new category name for this link:", 
          [
              { text: "Cancel", value: null, class: "btn-modal-cancel" },
              { text: "Save", value: true, class: "btn-modal-confirm" }
          ],
          { defaultValue: linkToUpdate.category, placeholder: "e.g. Work, Research..." }
      );
      if (newCategory && newCategory.trim()) {
        allLinks.forEach(link => {
          if (link.url === url) link.category = newCategory.trim();
        });
        await chrome.storage.local.set({ savedLinks: allLinks });
        await loadLinks();
      }
    }
    return;
  }
  if (e.target.closest('[data-action="openSelected"]')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('[data-action="openSelected"]');
    const sessionId = btn.dataset.sessionId;
    const sessionLinks = filteredLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId === sessionId;
    });
    const selectedInSession = sessionLinks.filter(link => selectedLinks.has(getLinkKey(link)));
    if (selectedInSession.length === 0) return;
    const confirmed = await showCustomModal(
        "Open Selected", 
        `Open ${selectedInSession.length} selected link(s)?`, 
        [
            { text: "Cancel", value: false, class: "btn-modal-cancel" },
            { text: "Open Tabs", value: true, class: "btn-modal-confirm" }
        ]
    );
    if (confirmed) selectedInSession.forEach(link => window.open(link.url, '_blank'));
    return;
  }
  // MOVE LOGIC (Complete)
  if (e.target.closest('[data-action="moveSelected"]')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('[data-action="moveSelected"]');
    const currentSessionId = btn.dataset.sessionId;
    const sessionLinks = filteredLinks.filter(link => {
        const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
        return linkSessionId === currentSessionId;
    });
    const selectedInSession = sessionLinks.filter(link => selectedLinks.has(getLinkKey(link)));
    if (selectedInSession.length === 0) return;
    const sessionOptions = [];
    sessionOptions.push({ value: 'NEW_SESSION_AUTO', text: '✨ Create New Session' });
    const processedSessionIds = new Set();
    allLinks.forEach(link => {
        const sId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
        if (sId !== currentSessionId && !processedSessionIds.has(sId)) {
            processedSessionIds.add(sId);
            let label = link.sessionLabel || link.dateGroup;
            label = label.replace(/^📅\s*/, '');
            if (label.length > 40) label = label.substring(0, 37) + '...';
            sessionOptions.push({ value: sId, text: label });
        }
    });
    const targetValue = await showCustomModal("Move Links", `Move ${selectedInSession.length} links to:`, [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Move", value: true, class: "btn-modal-confirm" }], { type: 'select', options: sessionOptions });
    if (targetValue) {
        const freshData = await chrome.storage.local.get(['savedLinks']);
        allLinks = freshData.savedLinks || [];
        let targetSessionId = targetValue;
        let targetLabel = "";
        let targetPinned = false;
        if (targetValue === 'NEW_SESSION_AUTO') {
            const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            targetSessionId = `manual-move-${Date.now()}`;
            targetLabel = `Moved Session (${timeStr})`;
        } else {
            const targetLinkSample = allLinks.find(l => {
                const sId = l.sessionId || `${l.dateGroup}-${l.timestamp}`;
                return sId === targetValue;
            });
            if (targetLinkSample) {
                targetLabel = targetLinkSample.sessionLabel;
                targetPinned = targetLinkSample.isPinned;
            }
        }
        allLinks.forEach(link => {
            const linkKey = getLinkKey(link);
            if (selectedLinks.has(linkKey)) {
                const sId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
                if (sId === currentSessionId) {
                    link.sessionId = targetSessionId;
                    link.sessionLabel = targetLabel;
                    if (targetValue !== 'NEW_SESSION_AUTO') link.isPinned = targetPinned;
                }
            }
        });
        selectedLinks.clear();
        await chrome.storage.local.set({ savedLinks: allLinks });
        await loadLinks();
    }
    return;
  }
  // BUMP LOGIC (Complete)
  if (e.target.closest('[data-action="bumpSession"]')) {
      e.stopImmediatePropagation();
      const btn = e.target.closest('[data-action="bumpSession"]');
      const sessionId = btn.dataset.sessionId;
      const freshData = await chrome.storage.local.get(['savedLinks']);
      allLinks = freshData.savedLinks || [];
      const now = new Date();
      const newTimestamp = now.toISOString();
      const newDateGroup = now.toLocaleDateString('en-US');
      let changed = false;
      allLinks.forEach(link => {
          const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
          if (linkSessionId === sessionId) {
              link.timestamp = newTimestamp;
              link.dateGroup = newDateGroup; 
              changed = true;
          }
      });
      if (changed) {
          await chrome.storage.local.set({ savedLinks: allLinks });
          await loadLinks(); 
      }
      return;
  }
  if (e.target.closest('[data-action="deleteSelected"]')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('[data-action="deleteSelected"]');
    const sessionId = btn.dataset.sessionId;
    const selectedInSession = allLinks.filter(link => selectedLinks.has(getLinkKey(link)));
    if (selectedInSession.length === 0) return;
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    if (settings.confirmBeforeClose !== false) {
        const confirmed = await showCustomModal("Delete Selected", `Really delete ${selectedInSession.length} selected link(s)?\nThis cannot be undone.`, [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Delete All", value: true, class: "btn-modal-danger" }]);
        if (!confirmed) return;
    }
    const freshData = await chrome.storage.local.get(['savedLinks']);
    allLinks = freshData.savedLinks || [];
    allLinks = allLinks.filter(link => {
      const linkKey = getLinkKey(link);
      return !selectedLinks.has(linkKey);
    });
    selectedInSession.forEach(link => selectedLinks.delete(getLinkKey(link)));
    await chrome.storage.local.set({ savedLinks: allLinks });
    await loadLinks(); 
    return;
  }
  if (e.target.closest('.btn-restore') || e.target.closest('.btn-replace')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-restore') || e.target.closest('.btn-replace');
    const isReplace = btn.classList.contains('btn-replace');
    const sessionId = btn.dataset.sessionId;
    const sessionLinks = allLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId === sessionId;
    });
    const actionText = isReplace ? 'REPLACE current tabs with' : 'Open';
    const warningText = isReplace ? '\n\n⚠️ Tabs in THIS workspace will be closed!' : '';
    const confirmed = await showCustomModal(isReplace ? "Replace Session" : "Restore Session", `${actionText} ${sessionLinks.length} link(s) from this session?${warningText}`, [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: isReplace ? "Replace" : "Restore", value: true, class: isReplace ? "btn-modal-danger" : "btn-modal-confirm" }]);
    if (confirmed) {
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      const shouldRestoreStructure = (settings.restoreWindowStructure !== false) && !isReplace; 
      let oldTabsIds = [];
      if (isReplace) {
          const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
          const activeTab = currentWindowTabs.find(t => t.active);
          if (activeTab && activeTab.workspaceId !== undefined) {
             oldTabsIds = currentWindowTabs.filter(t => t.workspaceId === activeTab.workspaceId).map(t => t.id);
          } else {
             oldTabsIds = currentWindowTabs.map(t => t.id);
          }
      }
      if (shouldRestoreStructure) {
          const linksByWindow = {};
          sessionLinks.forEach(link => {
              const wId = link.windowId || 'default';
              if (!linksByWindow[wId]) linksByWindow[wId] = [];
              linksByWindow[wId].push(link.url);
          });
          const windowIds = Object.keys(linksByWindow);
          if (windowIds.length === 1) {
             const urls = linksByWindow[windowIds[0]];
             for (const url of urls) await chrome.tabs.create({ url, active: false });
          } else {
             for (const wId of windowIds) {
                const urls = linksByWindow[wId];
                if (urls.length > 0) await chrome.windows.create({ url: urls });
             }
          }
      } else {
          for (const link of sessionLinks) await chrome.tabs.create({ url: link.url, active: false });
      }
      if (isReplace && oldTabsIds.length > 0) await chrome.tabs.remove(oldTabsIds);
      if (settings.deleteAfterRestore) {
        const freshData = await chrome.storage.local.get(['savedLinks']);
        allLinks = freshData.savedLinks || [];
        allLinks = allLinks.filter(link => {
          const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
          return linkSessionId !== sessionId;
        });
        await chrome.storage.local.set({ savedLinks: allLinks });
        await loadLinks();
      }
    }
    return;
  }
  if (e.target.closest('.btn-session.btn-delete')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-session.btn-delete');
    const sessionId = btn.dataset.sessionId;
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    if (settings.confirmBeforeClose !== false) {
        const confirmed = await showCustomModal("Delete Session", "Really delete all links from this session?\nThis action cannot be undone.", [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Delete Session", value: true, class: "btn-modal-danger" }]);
        if (!confirmed) return;
    }
    const freshData = await chrome.storage.local.get(['savedLinks']);
    allLinks = freshData.savedLinks || [];
    allLinks = allLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId !== sessionId;
    });
    await chrome.storage.local.set({ savedLinks: allLinks });
    await loadLinks();
    return;
  }
});

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('categoryFilter').addEventListener('change', applyFilters);
document.getElementById('windowFilter').addEventListener('change', applyFilters);

function applyFilters() {
  const searchQuery = document.getElementById('searchInput').value.toLowerCase();
  const selectedCategory = document.getElementById('categoryFilter').value;
  const selectedWindow = document.getElementById('windowFilter').value;
  filteredLinks = allLinks.filter(link => {
    const title = (link.title || "").toLowerCase();
    const url = (link.url || "").toLowerCase();
    const matchesSearch = !searchQuery || title.includes(searchQuery) || url.includes(searchQuery);
    const matchesCategory = !selectedCategory || link.category === selectedCategory;
    const matchesWindow = !selectedWindow || link.sessionLabel === selectedWindow;
    return matchesSearch && matchesCategory && matchesWindow;
  });
  renderLinks();
  updateStats();
}

// --- SMART EXPORT LOGIC (Session Names & Sessions Only) ---
document.getElementById('exportBtn').addEventListener('click', async () => {
  // GET ONLY SAVED LINKS (NO SETTINGS)
  const data = await chrome.storage.local.get(['savedLinks']);
  const timestamp = new Date().toISOString().slice(0, 10);
  
  // Calculate Session Names for Filename
  const allLinks = data.savedLinks || [];
  const uniqueSessionLabels = new Set();
  
  for (const link of allLinks) {
      if (link.sessionLabel) {
          let clean = link.sessionLabel
              .replace(/^📅\s*/, '') 
              .replace(/[^\w\s-]/g, '') 
              .trim()
              .replace(/\s+/g, '_'); 
          
          if (clean.length > 20) clean = clean.substring(0, 20); 
          
          if (clean) uniqueSessionLabels.add(clean);
          if (uniqueSessionLabels.size >= 3) break; 
      }
  }
  
  const labelParts = Array.from(uniqueSessionLabels);
  const suffix = labelParts.length > 0 ? `-${labelParts.join('-')}` : '';

  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // FILENAME: Session Backup Prefix
  a.download = `leantabs-sessions-backup-${timestamp}${suffix}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('clearAllBtn').addEventListener('click', async () => {
  const confirm1 = await showCustomModal("Delete All Links", `Really delete ALL ${allLinks.length} links?\n\nThis action cannot be undone!`, [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Delete All", value: true, class: "btn-modal-danger" }]);
  if (confirm1) {
    const confirm2 = await showCustomModal("Final Confirmation", "Are you ABSOLUTELY sure?", [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Yes, Wipe Everything", value: true, class: "btn-modal-danger" }]);
    if (confirm2) {
      await chrome.storage.local.set({ savedLinks: [] });
      await loadLinks();
    }
  }
});

document.getElementById('toggleAllBtn').addEventListener('click', () => {
  const btn = document.getElementById('toggleAllBtn');
  const isCollapsing = btn.textContent.includes('Collapse');
  const newDisplay = isCollapsing ? 'none' : 'block';
  const newHtml = isCollapsing ? `<span class="icon">▶</span> Expand All` : `<span class="icon">▼</span> Collapse All`;

  document.querySelectorAll('.links-list').forEach(list => {
    list.style.display = newDisplay;
  });
  document.querySelectorAll('.collapse-indicator').forEach(arrow => {
    arrow.innerHTML = isCollapsing ? ICONS.chevronRight : ICONS.chevronDown;
  });
  document.querySelectorAll('.session-header').forEach(header => {
    const sessionId = header.dataset.sessionId;
    if (isCollapsing) {
      collapsedSessions.add(`collapsed-${sessionId}`);
      collapsedSessions.delete(`expanded-${sessionId}`);
    } else {
      collapsedSessions.delete(`collapsed-${sessionId}`);
      collapsedSessions.add(`expanded-${sessionId}`);
    }
  });
  btn.innerHTML = newHtml;
});

function updateStats() {
  document.getElementById('totalCount').textContent = allLinks.length;
  document.getElementById('filteredCount').textContent = filteredLinks.length;
}

// --- DRAG & DROP LOGIC (Vanilla JS) ---
let dragSourceEl = null;
let dragSourceKey = null;
let dragSessionId = null;

function handleDragStart(e) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput.value.trim() !== '' || document.getElementById('categoryFilter').value !== '' || document.getElementById('windowFilter').value !== '') {
      e.preventDefault();
      // FIX: Optional feedback (minimal invasive)
      return;
  }
  dragSourceEl = this;
  dragSourceKey = this.querySelector('.link-checkbox').dataset.linkKey;
  dragSessionId = this.closest('.links-list').dataset.sessionId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML); 
  this.classList.add('dragging');
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault(); 
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  const targetSession = this.closest('.links-list').dataset.sessionId;
  if (this !== dragSourceEl && targetSession === dragSessionId) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.stopPropagation(); 
  const targetSession = this.closest('.links-list').dataset.sessionId;
  if (dragSourceEl !== this && dragSessionId === targetSession) {
      const targetKey = this.querySelector('.link-checkbox').dataset.linkKey;
      const sourceIndex = allLinks.findIndex(l => getLinkKey(l) === dragSourceKey);
      const targetIndex = allLinks.findIndex(l => getLinkKey(l) === targetKey);
      if (sourceIndex > -1 && targetIndex > -1) {
          const [movedItem] = allLinks.splice(sourceIndex, 1);
          allLinks.splice(targetIndex, 0, movedItem);
          await chrome.storage.local.set({ savedLinks: allLinks });
          renderLinks(); 
      }
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.link-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

const createSessionBtn = document.getElementById('createSessionBtn');
if (createSessionBtn) {
  createSessionBtn.addEventListener('click', async () => {
    const sessionName = await showCustomModal("Create New Session", "Enter a name for your new collection:", [{ text: "Cancel", value: null, class: "btn-modal-cancel" }, { text: "Next", value: true, class: "btn-modal-confirm" }], { placeholder: "e.g. Project Alpha, Reading List..." });
    if (!sessionName || !sessionName.trim()) return;
    const firstUrl = await showCustomModal("Add First Link", `Session "${sessionName}" needs a first link to start.\nEnter a URL:`, [{ text: "Cancel", value: null, class: "btn-modal-cancel" }, { text: "Create Session", value: true, class: "btn-modal-confirm" }], { placeholder: "https://..." });
    if (!firstUrl || !firstUrl.trim()) return;
    let validUrl = firstUrl.trim();
    if (!/^https?:\/\//i.test(validUrl)) validUrl = 'https://' + validUrl;
    try {
        new URL(validUrl); 
        const timestamp = new Date().toISOString();
        const newLink = {
            url: validUrl,
            title: validUrl, 
            timestamp: timestamp,
            dateGroup: new Date().toLocaleDateString('en-US'),
            category: extractDomain(validUrl),
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(validUrl).hostname}&sz=32`,
            sessionId: `manual-${timestamp}`, 
            sessionLabel: sessionName.trim(), 
            uniqueId: `${validUrl}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
            isPinned: false
        };
        allLinks.unshift(newLink);
        await chrome.storage.local.set({ savedLinks: allLinks });
        await loadLinks();
        fetchTitleFromUrl(validUrl).then(title => {
            if (title && title !== validUrl) {
                const linkIndex = allLinks.findIndex(l => l.uniqueId === newLink.uniqueId);
                if (linkIndex > -1) {
                    allLinks[linkIndex].title = title;
                    chrome.storage.local.set({ savedLinks: allLinks });
                    renderLinks();
                }
            }
        });
    } catch (e) {
        await showCustomModal("Invalid URL", "That URL looks invalid. Session not created.", [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
    }
  });
}

loadLinks();
// --- END OF saved-links.js ---