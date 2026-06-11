/**
 * LeanTabs - The Smart Tab & Workspace Manager
 * @author Ivica Vrgoc
 * @repository https://github.com/IvicaV/LeanTabs
 * @description Script handling the Dashboard UI, drag & drop, link management, and restoring sessions.
 */

// --- START OF saved-links.js (Final: Smart Import Refresh & UI State Sync) ---
import { getLinks, saveLinks, getSettings, saveSettings, getWhitelist, saveWhitelist } from './modules/storage.js';
import { deleteSession, renameSession, togglePinSession, bumpSession } from './modules/sessions.js';
import { extractDomain } from './modules/categorizer.js';
import { setRating } from './modules/ratings.js';

let allLinks = [];
let filteredLinks = [];
let selectedLinks = new Set();
let collapsedSessions = new Set(); 
let sessionsDefaultCollapsed = false; 
let isUpdatingMasterCheckbox = false;
let visibleLimit = 100; 

// In-memory sort state: sessionId -> sortType ('date', 'rating', 'alphabetical', 'opens')
let sessionSortStates = {}; 

let lpActiveUndoData = null; // In-Memory Puffer
let lpUndoTimeout = null;

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



async function loadLinks() {
  allLinks = await getLinks();
  const settings = await getSettings();
  
  let needsSave = false;
  allLinks.forEach((link, index) => {
    if (!link.uniqueId) {
      link.uniqueId = `${link.url}-${link.timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`;
      needsSave = true;
    }
  });
  if (needsSave) await saveLinks(allLinks);
  
  filteredLinks = [...allLinks];
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

// --- HELPER: ELITE-GRADE SMART-FOCUS URL NORMALIZATION WITH LOCALIZATION STRIPPER ---
function normalizeUrlForComparison(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return '';
  }
  
  try {
    // 1. URL-Encoding auflösen (%2F -> /)
    let decoded = urlStr;
    try { decoded = decodeURIComponent(urlStr); } catch (e) {}

    // 2. Unicode-Normalisierung & Trimming
    let tempUrl = decoded.normalize('NFC').trim();
    if (!/^https?:\/\//i.test(tempUrl)) tempUrl = 'https://' + tempUrl;
    
    const url = new URL(tempUrl);
    let host = url.hostname.toLowerCase().replace(/^www\./i, '');
    let path = url.pathname.toLowerCase();

    // --- NEU: LOCALIZATION STRIPPER ---
    // Entfernt Ländercodes wie /de, /en, /fr, /de-de, /en-us am Anfang des Pfads,
    // da diese durch automatische Server-Redirects entstehen und inhaltlich identisch sind.
    path = path.replace(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i, '$2');
    
    // Schrägstrich am Ende entfernen
    path = path.replace(/\/$/, '');
    
    // 3. Smart-Focus Filter: Parameter nur bei Video- & Suchportalen erhalten
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
        // Für Standard-Webseiten ignorieren wir Parameter und Ländercodes komplett
        return host + path;
    }
  } catch (e) {
    // Absolut sicherer String-Fallback
    try {
      let decoded = urlStr;
      try { decoded = decodeURIComponent(urlStr); } catch (err) {}
      let clean = decoded.normalize('NFC').trim().toLowerCase();
      clean = clean.split('#')[0]; 
      clean = clean.split('?')[0]; 
      clean = clean.replace(/^https?:\/\//i, '');
      clean = clean.replace(/^www\./i, '');
      // Einfacher Ländercode-Schnitt für Fallback
      clean = clean.replace(/\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i, '$2');
      clean = clean.replace(/\/$/, '');
      return clean;
    } catch (innerError) {
      return '';
    }
  }
}

async function openLinkAndIncrement(linkKey, active = true) {
  allLinks = await getLinks();
  const targetLink = allLinks.find(l => getLinkKey(l) === linkKey);
  if (targetLink) {
    targetLink.openCount = (targetLink.openCount || 0) + 1;
    await saveLinks(allLinks);
    await chrome.tabs.create({ url: targetLink.url, active: active });
    await loadLinks();
  }
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
    
    sessionSection.addEventListener('click', () => {
      sessionSection.classList.add('active');
    });
    
    sessionSection.addEventListener('mouseleave', () => {
      sessionSection.classList.remove('active');
    });
    
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
        await renameSession(sessionId, newLabel);
        await loadLinks();
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
    
    // Sort Select Control
    const sortSelect = document.createElement('select');
    sortSelect.className = 'session-sort-select';
    sortSelect.dataset.sessionId = sessionId;
    sortSelect.title = 'Sort links';
    
    const sortOptions = [
      { value: 'date', text: '📅 Date' },
      { value: 'rating', text: '⭐ Rating' },
      { value: 'alphabetical', text: '🔤 A-Z' },
      { value: 'opens', text: '🔥 Most Opened' }
    ];
    
    const currentSort = sessionSortStates[sessionId] || 'date';
    sortOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === currentSort) {
        option.selected = true;
      }
      sortSelect.appendChild(option);
    });
    
    sortSelect.addEventListener('click', (e) => e.stopPropagation());
    sortSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      sessionSortStates[sessionId] = e.target.value;
      renderLinks();
    });
    
    const restoreSessionBtn = document.createElement('button');
    restoreSessionBtn.className = 'btn-session btn-restore';
    restoreSessionBtn.innerHTML = ICONS.restore;
    restoreSessionBtn.dataset.sessionId = sessionId;
    restoreSessionBtn.title = 'Restore Session (Append)';

    // Dropdown container
    const dropdownDiv = document.createElement('div');
    dropdownDiv.className = 'session-dropdown';

    // Dropdown toggle button (3-dots)
    const dropdownToggleBtn = document.createElement('button');
    dropdownToggleBtn.className = 'btn-session btn-dropdown-toggle';
    dropdownToggleBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dropdownToggleBtn.title = 'More Actions';
    dropdownToggleBtn.setAttribute('aria-haspopup', 'true');
    dropdownToggleBtn.setAttribute('aria-expanded', 'false');

    // Dropdown menu list
    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'session-dropdown-menu';

    // Replace action inside dropdown
    const replaceSessionBtn = document.createElement('button');
    replaceSessionBtn.className = 'session-dropdown-item btn-replace';
    replaceSessionBtn.innerHTML = `${ICONS.replace} Replace Tabs`;
    replaceSessionBtn.dataset.sessionId = sessionId;
    replaceSessionBtn.dataset.action = 'restoreReplace';
    replaceSessionBtn.title = 'Replace current tabs. WARNING: Tabs closed will not be saved!';

    // Export action inside dropdown
    const downloadSessionBtn = document.createElement('button');
    downloadSessionBtn.className = 'session-dropdown-item';
    downloadSessionBtn.innerHTML = `${ICONS.download} Export Session`;
    downloadSessionBtn.dataset.sessionId = sessionId;
    downloadSessionBtn.dataset.action = 'downloadSession';
    downloadSessionBtn.title = 'Export Session (Safe to Share)';

    // Push to Top action inside dropdown
    const bumpSessionBtn = document.createElement('button');
    bumpSessionBtn.className = 'session-dropdown-item';
    bumpSessionBtn.innerHTML = `${ICONS.arrowUp} Push to Top`;
    bumpSessionBtn.dataset.sessionId = sessionId;
    bumpSessionBtn.dataset.action = 'bumpSession';
    bumpSessionBtn.title = 'Push to Top';

    // Pin action inside dropdown
    const pinSessionBtn = document.createElement('button');
    pinSessionBtn.className = `session-dropdown-item btn-pin ${isPinned ? 'active' : ''}`;
    pinSessionBtn.innerHTML = `${ICONS.pin} ${isPinned ? 'Unpin' : 'Pin'} Session`;
    pinSessionBtn.dataset.sessionId = sessionId;
    pinSessionBtn.dataset.action = 'togglePin';
    pinSessionBtn.title = isPinned ? 'Unpin Session' : 'Pin Session';

    // Delete action inside dropdown
    const deleteSessionBtn = document.createElement('button');
    deleteSessionBtn.className = 'session-dropdown-item btn-session btn-delete';
    deleteSessionBtn.innerHTML = `${ICONS.trash} Delete Session`;
    deleteSessionBtn.dataset.sessionId = sessionId;
    deleteSessionBtn.title = 'Delete Session';

    dropdownMenu.appendChild(replaceSessionBtn);
    dropdownMenu.appendChild(downloadSessionBtn);
    dropdownMenu.appendChild(bumpSessionBtn);
    dropdownMenu.appendChild(pinSessionBtn);
    dropdownMenu.appendChild(deleteSessionBtn);

    dropdownDiv.appendChild(dropdownToggleBtn);
    dropdownDiv.appendChild(dropdownMenu);
    
    sessionActions.appendChild(sortSelect);
    sessionActions.appendChild(restoreSessionBtn);
    sessionActions.appendChild(dropdownDiv);
    
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
    
    // Sort logic prior to rendering links
    const activeSort = sessionSortStates[sessionId] || 'date';
    let displayedLinks = [...session.links];
    if (activeSort === 'rating') {
      displayedLinks.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (activeSort === 'alphabetical') {
      displayedLinks.sort((a, b) => {
        const titleA = (a.title || a.url || '').toLowerCase();
        const titleB = (b.title || b.url || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    } else if (activeSort === 'opens') {
      displayedLinks.sort((a, b) => (b.openCount || 0) - (a.openCount || 0));
    }
    
    displayedLinks.forEach((link) => {
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
  linkTitle.title = link.title || link.url;
  
  linkTitle.addEventListener('click', async (e) => {
    e.preventDefault();
    const active = !e.ctrlKey && !e.metaKey;
    await openLinkAndIncrement(linkKey, active);
  });
  
  linkHeader.appendChild(linkTitle);

  // Rating Rendering
  const rating = link.rating || 0;
  const ratingContainer = document.createElement('div');
  ratingContainer.className = `link-rating-container ${rating > 0 ? 'rated' : 'unrated'}`;
  
  for (let i = 1; i <= 3; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.dataset.value = i;
    star.textContent = i <= rating ? '★' : '☆';
    ratingContainer.appendChild(star);
  }
  
  ratingContainer.addEventListener('mouseover', (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    const value = parseInt(star.dataset.value, 10);
    ratingContainer.querySelectorAll('.star').forEach(s => {
      const val = parseInt(s.dataset.value, 10);
      s.textContent = val <= value ? '★' : '☆';
      s.classList.add('hovered');
    });
  });
  
  ratingContainer.addEventListener('mouseleave', () => {
    ratingContainer.querySelectorAll('.star').forEach(s => {
      const val = parseInt(s.dataset.value, 10);
      s.textContent = val <= rating ? '★' : '☆';
      s.classList.remove('hovered');
    });
  });
  
  ratingContainer.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const star = e.target.closest('.star');
    if (!star) return;
    const clickedValue = parseInt(star.dataset.value, 10);
    const newRating = rating === clickedValue ? 0 : clickedValue;
    try {
      await setRating(linkKey, newRating);
      await loadLinks();
    } catch (err) {
      console.error("Failed to set rating:", err);
    }
  });
  
  linkHeader.appendChild(ratingContainer);

  const date = new Date(link.timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const linkMeta = document.createElement('div');
  linkMeta.className = 'link-meta';
  
  const categorySpan = document.createElement('span');
  categorySpan.className = 'link-category';
  categorySpan.dataset.category = link.category;
  categorySpan.innerHTML = ICONS.tag + ' '; 
  categorySpan.appendChild(document.createTextNode(link.category)); 
  
  let openCountSpan = null;
  if (link.openCount && link.openCount > 0) {
      openCountSpan = document.createElement('span');
      openCountSpan.className = 'link-open-count';
      openCountSpan.title = `Opened ${link.openCount} times`;
      openCountSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg" style="width: 10px; height: 10px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> ${link.openCount}`;
  }

  const timeSpan = document.createElement('span');
  timeSpan.className = 'link-time';
  timeSpan.textContent = time;

  const urlSpan = document.createElement('span');
  urlSpan.className = 'link-url';
  urlSpan.textContent = hostname;

  linkMeta.appendChild(timeSpan);
  linkMeta.appendChild(categorySpan);
  if (openCountSpan) {
      linkMeta.appendChild(openCountSpan);
  }
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

  // Create link dropdown container
  const dropdownDiv = document.createElement('div');
  dropdownDiv.className = 'link-dropdown';

  // Toggle button (3-dots)
  const dropdownToggleBtn = document.createElement('button');
  dropdownToggleBtn.className = 'btn-icon btn-link-dropdown-toggle';
  dropdownToggleBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  dropdownToggleBtn.title = 'Link Actions';
  dropdownToggleBtn.setAttribute('aria-haspopup', 'true');
  dropdownToggleBtn.setAttribute('aria-expanded', 'false');

  // Dropdown menu
  const dropdownMenu = document.createElement('div');
  dropdownMenu.className = 'link-dropdown-menu';

  // Whitelist item inside dropdown
  const whitelistItemBtn = createBtn(ICONS.shield, 'btn-link-whitelist', 'Add to Whitelist', { url: link.url });
  whitelistItemBtn.innerHTML = `${ICONS.shield} <span>Whitelist</span>`;
  whitelistItemBtn.className = 'link-dropdown-item btn-link-whitelist';

  // Edit Category item inside dropdown
  const categoryItemBtn = createBtn(ICONS.tag, 'btn-link-category', 'Edit Category', { action: 'category', url: link.url });
  categoryItemBtn.innerHTML = `${ICONS.tag} <span>Edit Category</span>`;
  categoryItemBtn.className = 'link-dropdown-item btn-link-category';

  dropdownMenu.appendChild(whitelistItemBtn);
  dropdownMenu.appendChild(categoryItemBtn);

  dropdownDiv.appendChild(dropdownToggleBtn);
  dropdownDiv.appendChild(dropdownMenu);

  linkActions.appendChild(createBtn(ICONS.link, 'btn-link-open', 'Open Tab', { action: 'open', url: link.url }));
  linkActions.appendChild(createBtn(ICONS.trash, 'btn-link-delete', 'Delete', { action: 'delete', url: link.url, timestamp: link.timestamp }));
  linkActions.appendChild(dropdownDiv);

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
  // Clicked collapse chevron indicator inside the header
  const indicator = e.target.closest('.collapse-indicator');
  if (indicator) {
    const sessionId = indicator.dataset.sessionId;
    if (sessionId) toggleSessionCollapse(sessionId);
    return;
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
  if (e.target.closest('.btn-add-link')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-add-link');
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

    // --- DEFENSIRE DUPLIKAT-WARNUNG START ---
    try {
        allLinks = await getLinks();
        const normalizedIncomingUrl = normalizeUrlForComparison(validUrl);
        
        // DEEP-CONSOLE DIAGNOSTIK: Zeigt uns genau, was in allLinks geladen wurde
        console.log("[LeanTabs] Checking manual input:", {
            rawInput: validUrl,
            normalizedInput: normalizedIncomingUrl,
            totalDbEntries: allLinks.length,
            allDbUrlsNormalized: allLinks.map(l => ({
                raw: l.url,
                normalized: normalizeUrlForComparison(l.url)
            }))
        });

        const duplicateMatch = allLinks.find(link => {
            if (!link || !link.url) return false;
            const normalizedDbUrl = normalizeUrlForComparison(link.url);
            return normalizedDbUrl === normalizedIncomingUrl;
        });

        if (duplicateMatch) {
            console.log("[LeanTabs] ✓ MATCH FOUND! Showing custom modal now.");
            const existingSessionName = duplicateMatch.sessionLabel || "another session";
            
            const userConfirmed = await showCustomModal(
                "Link Already Saved",
                `This URL is already saved in "${existingSessionName}".\n\nDo you want to add it to this session anyway?`,
                [
                    { text: "Cancel", value: false, class: "btn-modal-cancel" },
                    { text: "Add Anyway", value: true, class: "btn-modal-confirm" }
                ]
            );
            
            if (!userConfirmed) {
                input.value = ''; // Feld leeren
                return; // Vorgang abbrechen ohne Mutation
            }
        } else {
            console.log("[LeanTabs] ✗ No duplicate match found in database for:", normalizedIncomingUrl);
        }
    } catch (criticalCheckError) {
        console.error("[LeanTabs] Non-blocking duplicate check error:", criticalCheckError);
    }
    // --- DEFENSIRE DUPLIKAT-WARNUNG END ---

    const originalBtnText = btn.textContent;
    btn.textContent = "...";
    btn.disabled = true;
    input.disabled = true;
    const fetchedTitle = await fetchTitleFromUrl(validUrl);

    allLinks = await getLinks();

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
    await saveLinks(allLinks);
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
      await togglePinSession(sessionId);
      await loadLinks();
      return;
  }
  if (e.target.closest('.btn-link-whitelist')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-whitelist');
    try {
        const urlStr = btn.dataset.url;
        const url = new URL(urlStr);
        let domain = url.hostname.replace(/^www\./, '');
        let whitelist = await getWhitelist();
        if (whitelist.includes(domain)) {
            await showCustomModal("Already Whitelisted", `Domain "${domain}" is already in the Whitelist!`, [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
        } else {
            whitelist.push(domain);
            await saveWhitelist(whitelist);
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
    const settings = await getSettings();
    
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
    allLinks = await getLinks();
    const indexToDelete = allLinks.findIndex(link => link.url === url && link.timestamp === timestamp);
    if (indexToDelete !== -1) {
      // Sichern vor Mutation
      lpActiveUndoData = {
        type: 'link',
        index: indexToDelete,
        data: { ...allLinks[indexToDelete] } // Flache Kopie
      };

      allLinks.splice(indexToDelete, 1);
      await saveLinks(allLinks);
      await loadLinks(); // UI Update

      showLpUndoToast("Link deleted");
    }
    return;
  }
  if (e.target.closest('.btn-link-open')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-open');
    const linkItem = btn.closest('.link-item');
    const checkbox = linkItem.querySelector('.link-checkbox');
    const linkKey = checkbox.dataset.linkKey;
    await openLinkAndIncrement(linkKey, true);
    return;
  }

  if (e.target.closest('.btn-link-category')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-category');
    const url = btn.dataset.url;
    allLinks = await getLinks();
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
        await saveLinks(allLinks);
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
    if (confirmed) {
      allLinks = await getLinks();
      for (const sLink of selectedInSession) {
        const sKey = getLinkKey(sLink);
        const targetLink = allLinks.find(l => getLinkKey(l) === sKey);
        if (targetLink) {
          targetLink.openCount = (targetLink.openCount || 0) + 1;
        }
        await chrome.tabs.create({ url: sLink.url, active: false });
      }
      await saveLinks(allLinks);
      await loadLinks();
    }
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
        allLinks = await getLinks();
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
        await saveLinks(allLinks);
        await loadLinks();
    }
    return;
  }
  // BUMP LOGIC (Complete)
  if (e.target.closest('[data-action="bumpSession"]')) {
      e.stopImmediatePropagation();
      const btn = e.target.closest('[data-action="bumpSession"]');
      const sessionId = btn.dataset.sessionId;
      await bumpSession(sessionId);
      await loadLinks();
      return;
  }
  if (e.target.closest('[data-action="deleteSelected"]')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('[data-action="deleteSelected"]');
    const sessionId = btn.dataset.sessionId;
    const selectedInSession = allLinks.filter(link => selectedLinks.has(getLinkKey(link)));
    if (selectedInSession.length === 0) return;
    const settings = await getSettings();
    if (settings.confirmBeforeClose !== false) {
        const confirmed = await showCustomModal("Delete Selected", `Really delete ${selectedInSession.length} selected link(s)?\nThis cannot be undone.`, [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Delete All", value: true, class: "btn-modal-danger" }]);
        if (!confirmed) return;
    }
    allLinks = await getLinks();
    allLinks = allLinks.filter(link => {
      const linkKey = getLinkKey(link);
      return !selectedLinks.has(linkKey);
    });
    selectedInSession.forEach(link => selectedLinks.delete(getLinkKey(link)));
    await saveLinks(allLinks);
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
    
    // --- DEFENSIRE HOCHLEISTUNGS-WARNUNG START ---
    const MAX_SAFE_TABS = 15;
    const isMassiveRestore = sessionLinks.length > MAX_SAFE_TABS;
    
    const actionText = isReplace ? 'REPLACE current tabs with' : 'Open';
    
    let warningText = isReplace ? '\n\n⚠️ Tabs in THIS workspace will be closed!' : '';
    if (isMassiveRestore) {
        warningText += `\n\n⚠️ WARNING: You are about to open ${sessionLinks.length} tabs simultaneously. This might temporarily slow down your browser!`;
    }
    // --- DEFENSIRE HOCHLEISTUNGS-WARNUNG END ---

    const confirmed = await showCustomModal(
        isReplace ? "Replace Session" : "Restore Session", 
        `${actionText} ${sessionLinks.length} link(s) from this session?${warningText}`, 
        [
            { text: "Cancel", value: false, class: "btn-modal-cancel" },
            { text: isReplace ? "Replace" : "Restore", value: true, class: isReplace ? "btn-modal-danger" : "btn-modal-confirm" }
        ]
    );
    if (confirmed) {
      allLinks = await getLinks();
      sessionLinks.forEach(sLink => {
        const sKey = getLinkKey(sLink);
        const targetLink = allLinks.find(l => getLinkKey(l) === sKey);
        if (targetLink) {
          targetLink.openCount = (targetLink.openCount || 0) + 1;
        }
      });
      await saveLinks(allLinks);

      const settings = await getSettings();
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
        await deleteSession(sessionId);
        await loadLinks();
      }
    }
    return;
  }
  if (e.target.closest('.btn-session.btn-delete')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-session.btn-delete');
    const sessionId = btn.dataset.sessionId;
    const settings = await getSettings();
    if (settings.confirmBeforeClose !== false) {
        const confirmed = await showCustomModal("Delete Session", "Really delete all links from this session?\nThis action cannot be undone.", [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Delete Session", value: true, class: "btn-modal-danger" }]);
        if (!confirmed) return;
    }

    // --- DEFENSIRE SESSION-UNDO INJEKTION START ---
    allLinks = await getLinks();
    const indicesAndLinks = [];
    
    // Ermittle alle Links dieser Session und sichere ihre Indizes chronologisch
    allLinks.forEach((link, idx) => {
        const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
        if (linkSessionId === sessionId) {
            indicesAndLinks.push({ index: idx, data: { ...link } });
        }
    });

    if (indicesAndLinks.length > 0) {
        lpActiveUndoData = {
            type: 'session',
            data: indicesAndLinks
        };
        
        await deleteSession(sessionId);
        await loadLinks(); // UI Update
        
        showLpUndoToast("Session deleted");
    }
    // --- DEFENSIRE SESSION-UNDO INJEKTION END ---
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
  const data = { savedLinks: await getLinks() };
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
      await saveLinks([]);
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
          sessionSortStates[targetSession] = 'date';
          await saveLinks(allLinks);
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
        await saveLinks(allLinks);
        await loadLinks();
        fetchTitleFromUrl(validUrl).then(title => {
            if (title && title !== validUrl) {
                const linkIndex = allLinks.findIndex(l => l.uniqueId === newLink.uniqueId);
                if (linkIndex > -1) {
                    allLinks[linkIndex].title = title;
                    saveLinks(allLinks);
                    renderLinks();
                }
            }
        });
    } catch (e) {
        await showCustomModal("Invalid URL", "That URL looks invalid. Session not created.", [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
    }
  });
}

// --- SESSION DROPDOWN EVENT HANDLERS ---
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.btn-dropdown-toggle, .btn-link-dropdown-toggle');
  if (!toggle) {
    closeAllDropdowns();
  }
}, true); // Capture phase closes dropdown on outside / item clicks

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.btn-dropdown-toggle, .btn-link-dropdown-toggle');
  if (toggle) {
    e.stopPropagation();
    const dropdown = toggle.nextElementSibling;
    const isShown = dropdown.classList.contains('show');
    
    closeAllDropdowns();
    
    if (!isShown) {
      dropdown.classList.add('show');
      toggle.setAttribute('aria-expanded', 'true');
    }
  }
});

function closeAllDropdowns() {
  document.querySelectorAll('.session-dropdown-menu.show, .link-dropdown-menu.show').forEach(menu => {
    menu.classList.remove('show');
    const toggle = menu.previousElementSibling;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllDropdowns();
  }
});

loadLinks();

// --- HELPER: SHOW UNDO TOAST FOR DELETED ELEMENTS ---
function showLpUndoToast(message) {
  const toast = document.getElementById('lp-undo-toast');
  const text = document.getElementById('lp-undo-text');
  const btn = document.getElementById('lp-undo-btn');
  
  if (!toast || !text || !btn) return;

  text.textContent = message;
  toast.classList.remove('hidden');

  if (lpUndoTimeout) clearTimeout(lpUndoTimeout);

  btn.onclick = async (e) => {
    e.stopPropagation();
    if (lpActiveUndoData) {
      const currentLinks = await getLinks();
      
      if (lpActiveUndoData.type === 'link') {
        const insertIndex = Math.min(lpActiveUndoData.index, currentLinks.length);
        currentLinks.splice(insertIndex, 0, lpActiveUndoData.data);
      } else if (lpActiveUndoData.type === 'session') {
        // Rekonstruiere alle Links der gelöschten Session an ihren Ursprungspositionen
        // Aufsteigend nach Index sortieren, um Verschiebungen während der Splices zu verhindern
        const sortedBackup = [...lpActiveUndoData.data].sort((a, b) => a.index - b.index);
        sortedBackup.forEach(item => {
            const insertIndex = Math.min(item.index, currentLinks.length);
            currentLinks.splice(insertIndex, 0, item.data);
        });
      }
      
      await saveLinks(currentLinks);
      lpActiveUndoData = null;
      toast.classList.add('hidden');
      await loadLinks(); // UI Update über Standard-Pfad
    }
  };

  lpUndoTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    lpActiveUndoData = null;
  }, 6000); // 6 Sekunden Einblendzeit
}

// --- END OF saved-links.js ---