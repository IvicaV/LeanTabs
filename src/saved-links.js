/**
 * LeanTabs - The Smart Tab & Workspace Manager
 * @author Ivica Vrgoc
 * @repository https://github.com/IvicaV/LeanTabs
 * @description Script handling the Dashboard UI, drag & drop, link management, and restoring sessions.
 */

// --- START OF saved-links.js (Final: Smart Import Refresh & UI State Sync) ---
import { getLinks, saveLinks, getSettings, saveSettings, getWhitelist, saveWhitelist, getBackups, saveBackups } from './modules/storage.js';
import { deleteSession, renameSession, togglePinSession, bumpSession, toggleLockSession, setSessionColor, setSessionNote } from './modules/sessions.js';
import { extractDomain } from './modules/categorizer.js';
import { setRating } from './modules/ratings.js';

// --- SICHERHEITS-ROUTINEN (XSS-SCHUTZ) ---
function escapeHTML(str) {
  if (!str) return '';
  return str.toString().replace(/[&<>'"]/g, (tag) => {
    const chars = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return chars[tag] || tag;
  });
}

function sanitizeURL(urlStr) {
  if (!urlStr) return 'about:blank';
  try {
    const parsed = new URL(urlStr);
    // Erlaube ausschließlich http, https und interne Extension-Assets
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'chrome-extension:') {
      return parsed.href;
    }
  } catch (e) {}
  // Fallback bei unzulässigen Protokollen wie javascript: oder data:
  return 'about:blank';
}

let allLinks = [];
let filteredLinks = [];
let selectedLinks = new Set();
let collapsedSessions = new Set(); 
let sessionsDefaultCollapsed = false; 
let dragExpandTimeout = null;
let isUpdatingMasterCheckbox = false;
let visibleLimit = 100; 

// In-memory sort state: sessionId -> sortType ('date', 'rating', 'alphabetical', 'opens')
let sessionSortStates = {}; 

let lpActiveUndoData = null; // In-Memory Puffer
let lpUndoTimeout = null;
let activeModalResolve = null; // Neuer globaler Zustand für das aktive Modal

// Track background updates to refresh UI upon visibility
let hasPendingUpdate = false;

// Sync-Lock flag to ignore self-triggered storage events (e.g. rating updates)
let ignoreNextStorageChange = false;

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
  arrowUp: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  note: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"></path><polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"></polyline><line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round" stroke-linejoin="round"></line><line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round" stroke-linejoin="round"></line><polyline points="10 9 9 9 8 9" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>',
  fallbackFavicon: '<svg class="icon-svg favicon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"></path><polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>'
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
    if (ignoreNextStorageChange) {
      ignoreNextStorageChange = false;
      return;
    }
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
  // Beende eventuell verwaiste Modals im Speicher kontrolliert mit null
  if (activeModalResolve) {
      activeModalResolve(null);
  }

  return new Promise((resolve) => {
    activeModalResolve = resolve; // Registriere das neue resolve-Callback
    
    const modal = document.getElementById('customModal');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const actionsEl = document.getElementById('modalActions');
    const inputEl = document.getElementById('modalInput');
    const selectEl = document.getElementById('modalSelect');
    const textareaEl = document.getElementById('modalTextarea');
    const eraserBtn = document.getElementById('modalEraserBtn'); // NEU

    titleEl.textContent = title;
    msgEl.textContent = message;
    actionsEl.innerHTML = ''; 

    // Reset visibility
    inputEl.classList.remove('visible');
    selectEl.style.display = 'none';
    inputEl.value = '';
    selectEl.innerHTML = '';
    if (eraserBtn) eraserBtn.style.display = 'none'; // Standardmäßig ausblenden
    if (textareaEl) {
        textareaEl.style.display = 'none';
        textareaEl.value = '';
    }

    // Handle Input/Select/Textarea Logic
    if (inputConfig) {
        if (inputConfig.type === 'textarea') {
            // POST-IT MODUS AKTIVIEREN
            if (textareaEl) {
                textareaEl.style.display = 'block';
                textareaEl.value = inputConfig.defaultValue || '';
                textareaEl.placeholder = inputConfig.placeholder || '';
                
                // Schwebendes Post-It-Farbschema (Bernstein-Glow)
                textareaEl.style.backgroundColor = 'rgba(251, 191, 36, 0.05)';
                textareaEl.style.borderColor = 'rgba(251, 191, 36, 0.3)';
                textareaEl.style.color = 'var(--text-main)';
                
                // Einblenden und Klick-Event für den Radiergummi registrieren
                if (eraserBtn) {
                    eraserBtn.style.display = 'block';
                    eraserBtn.onclick = (e) => {
                        e.stopPropagation();
                        textareaEl.value = ''; // Inhalt leeren
                        textareaEl.focus();    // Fokus zurücksetzen
                    };
                }
                
                setTimeout(() => textareaEl.focus(), 100);
            }
        } else if (inputConfig.type === 'select') {
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
            if (inputConfig.type === 'textarea') {
                valueToReturn = textareaEl ? textareaEl.value : ''; // Wert aus der Textarea lesen
            } else if (inputConfig.type === 'select') {
                valueToReturn = selectEl.value;
            } else {
                valueToReturn = inputEl.value;
            }
        }
        
        modal.classList.add('hidden');
        activeModalResolve = null; // Lösche die Referenz vor dem Auflösen
        resolve(valueToReturn);
      };
      actionsEl.appendChild(btn);
    });

    // Handle Enter key for Input (excluding textarea to allow line breaks)
    if (inputConfig && inputConfig.type !== 'select' && inputConfig.type !== 'textarea') {
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                 const confirmBtn = buttons.find(b => b.value === true);
                 if (confirmBtn) {
                     modal.classList.add('hidden');
                     activeModalResolve = null; // Lösche die Referenz vor dem Auflösen
                     resolve(inputEl.value);
                 }
            }
        };
    }

    modal.classList.remove('hidden');
  });
}

// --- DEFENSIRE NETZWERK-VALIDIERUNG (SSRF-SCHUTZ) ---
function isSafeUrlToFetch(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().trim();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')) return false;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function fetchTitleFromUrl(url) {
  if (!isSafeUrlToFetch(url)) {
    console.warn("[AppSec-Guard] Fetch aborted - disallowed IP/Host target destination:", url);
    return url;
  }
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
  
  // --- CONFIG-WEICHE FÜR STERNE START ---
  const enableRatings = settings.enableRatings !== false; // Default: true (aktiviert)
  const container = document.getElementById('linksContainer');
  if (container) {
      if (enableRatings) {
          container.classList.remove('ratings-disabled');
      } else {
          container.classList.add('ratings-disabled');
      }
  }
  // --- CONFIG-WEICHE FÜR STERNE END ---
  
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
      const iconRight = `<span class="icon" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 6px;"><svg class="icon-svg" style="width: 12px; height: 12px; stroke-width: 2.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      const iconDown = `<span class="icon" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 6px;"><svg class="icon-svg" style="width: 12px; height: 12px; stroke-width: 2.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      
      toggleBtn.innerHTML = sessionsDefaultCollapsed 
        ? `${iconRight} Expand All` 
        : `${iconDown} Collapse All`;
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

// --- RATE-LIMITING & VALIDIERUNG FÜR FEEDBACK PIPELINE (APPSEC-GUARD) ---
function validateAndRateLimitFeedback(type, message, email) {
    // 1. Client-side rate-limiting (Max. 1 message per 60 seconds)
    const lastSent = localStorage.getItem('last_feedback_timestamp');
    const now = Date.now();
    if (lastSent && (now - parseInt(lastSent, 10) < 60000)) {
        const remaining = Math.ceil((60000 - (now - parseInt(lastSent, 10))) / 1000);
        return { valid: false, error: `Please wait ${remaining}s before sending another message.` };
    }

    // 2. Structural data types verification
    const allowedTypes = ['Question', 'Bug', 'Feature'];
    if (!allowedTypes.includes(type)) {
        return { valid: false, error: "Invalid feedback type." };
    }

    if (!message || typeof message !== 'string' || message.trim().length < 5) {
        return { valid: false, error: "Message must be at least 5 characters long." };
    }

    if (message.length > 5000) {
        return { valid: false, error: "Message exceeds maximum length of 5000 characters." };
    }

    // 3. Syntax checks for optional email field
    if (email && email !== "Anonymous") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email) || email.length > 254) {
            return { valid: false, error: "Invalid email format." };
        }
    }

    return { valid: true };
}

// --- ROBUSTER IMPORT-VALIDATOR (ZERO-TRUST SCHEMA) ---
function sanitizeAndValidateImportedLinks(rawList) {
    if (!Array.isArray(rawList)) return [];

    const validatedList = [];

    rawList.forEach(rawLink => {
        if (!rawLink || typeof rawLink !== 'object') return;

        // 1. Minimum schema criteria
        if (!rawLink.url || typeof rawLink.url !== 'string') return;
        if (!rawLink.title || typeof rawLink.title !== 'string') return;

        // 2. Protocol check (Strict http, https and extension internal only)
        let cleanUrl;
        try {
            const parsed = new URL(rawLink.url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'chrome-extension:') {
                return; // Discard dangerous protocols like javascript: or data:
            }
            cleanUrl = parsed.href;
        } catch (e) {
            return; // Discard invalid URLs
        }

        // 3. Rebuild object strictly to avoid prototype pollution
        const safeLink = {
            url: cleanUrl,
            title: rawLink.title.substring(0, 500), // Prevent buffer overflow/DoS
            timestamp: (typeof rawLink.timestamp === 'string') ? rawLink.timestamp : new Date().toISOString(),
            dateGroup: (typeof rawLink.dateGroup === 'string') ? rawLink.dateGroup : new Date().toLocaleDateString('en-US'),
            category: (typeof rawLink.category === 'string') ? rawLink.category.substring(0, 50) : 'Other',
            favicon: (typeof rawLink.favicon === 'string' && rawLink.favicon.startsWith('http')) ? rawLink.favicon : '',
            sessionId: (typeof rawLink.sessionId === 'string') ? rawLink.sessionId.replace(/[^\w-]/g, '') : `imported-session-${Date.now()}`,
            sessionLabel: (typeof rawLink.sessionLabel === 'string') ? rawLink.sessionLabel.substring(0, 100) : 'Restored Session',
            uniqueId: (typeof rawLink.uniqueId === 'string') ? rawLink.uniqueId.replace(/[^\w-]/g, '') : `link-${Math.random().toString(36).substr(2, 9)}`,
            isPinned: !!rawLink.isPinned,
            isLocked: !!rawLink.isLocked,
            rating: (typeof rawLink.rating === 'number' && rawLink.rating >= 0 && rawLink.rating <= 3) ? rawLink.rating : 0,
            openCount: (typeof rawLink.openCount === 'number' && rawLink.openCount > 0) ? Math.min(rawLink.openCount, 99999) : 0
        };

        // 4. Safely attach optional metadata fields
        if (typeof rawLink.sessionColor === 'string' && ['none', 'blue', 'green', 'yellow', 'red'].includes(rawLink.sessionColor)) {
            safeLink.sessionColor = rawLink.sessionColor;
        }
        if (typeof rawLink.sessionNote === 'string') {
            safeLink.sessionNote = rawLink.sessionNote.substring(0, 2000);
        }
        if (typeof rawLink.note === 'string') {
            safeLink.note = rawLink.note.substring(0, 2000);
        }
        if (typeof rawLink.groupTitle === 'string') {
            safeLink.groupTitle = rawLink.groupTitle.substring(0, 100);
        }
        if (typeof rawLink.groupColor === 'string') {
            safeLink.groupColor = rawLink.groupColor.substring(0, 30);
        }
        if (typeof rawLink.groupOriginalId === 'number') {
            safeLink.groupOriginalId = rawLink.groupOriginalId;
        }

        validatedList.push(safeLink);
    });

    return validatedList;
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
  
  // ZUSTAND A: Die Datenbank ist tatsächlich komplett leer
  if (allLinks.length === 0) {
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
  
  // ZUSTAND B: Daten sind vorhanden, aber der aktive Filter liefert 0 Ergebnisse
  if (filteredLinks.length === 0) {
    container.innerHTML = `
        <div class="empty-state" style="border-style: solid;">
           <div style="opacity:0.3; margin-bottom:15px; transform: scale(2); display:inline-block;">
             <svg class="icon-svg" style="width:24px; height:24px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
           </div>
           <h3 style="margin-bottom:8px; color:var(--text-strong); font-size:16px;">No search results found</h3>
           <p style="max-width:360px; margin:0 auto; font-size:13px; color:var(--text-muted); line-height:1.6;">
             No sessions match your active filters or search query.<br>
             <button id="resetFiltersBtn" class="btn btn-primary btn-sm" style="margin-top:12px; border-radius:20px;">Clear Search & Filters</button>
           </p>
        </div>
    `;
    const sessionCountEl = document.getElementById('sessionCount');
    if (sessionCountEl) sessionCountEl.textContent = '0';
    
    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        const searchInput = document.getElementById('searchInput');
        const catFilter = document.getElementById('categoryFilter');
        const winFilter = document.getElementById('windowFilter');
        if (searchInput) searchInput.value = '';
        if (catFilter) catFilter.value = '';
        if (winFilter) winFilter.value = '';
        applyFilters();
    });
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
    const isLocked = session.links[0].isLocked || false;
    const sessionColor = session.links[0]?.sessionColor || 'none';
    const sessionNoteText = session.links[0]?.sessionNote || "";
    sessionSection.className = `session-section ${isPinned ? 'pinned' : ''} ${isLocked ? 'is-locked-panel' : ''} ${sessionColor !== 'none' ? `color-${sessionColor}` : ''}`; 
    
    sessionSection.addEventListener('click', () => {
      sessionSection.classList.add('active');
    });
    
    sessionSection.addEventListener('mouseleave', () => {
      sessionSection.classList.remove('active');
    });
    
    const sessionHeader = document.createElement('div');
    sessionHeader.className = 'session-header';
    sessionHeader.dataset.sessionId = sessionId;
    
    sessionHeader.addEventListener('dragenter', handleHeaderDragEnter);
    sessionHeader.addEventListener('dragover', handleHeaderDragOver);
    sessionHeader.addEventListener('dragleave', handleHeaderDragLeave);
    sessionHeader.addEventListener('drop', handleHeaderDrop);
    
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
    masterCheckbox.title = isLocked ? 'Session is locked' : 'Select all';
    if (isLocked) {
        masterCheckbox.disabled = true; // Sperre die Master-Checkbox
    }
    
    const dateBadge = document.createElement('span');
    dateBadge.className = 'session-date-badge';
    dateBadge.textContent = session.dateGroup;

    topRow.appendChild(collapseIndicator);
    topRow.appendChild(masterCheckbox);
    topRow.appendChild(dateBadge);

    if (sessionNoteText) {
        const noteIndicator = document.createElement('span');
        noteIndicator.className = 'session-note-header-indicator';
        noteIndicator.style.cssText = 'color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;';
        noteIndicator.innerHTML = ICONS.note;
        noteIndicator.title = sessionNoteText; // Show full note preview on hover
        topRow.appendChild(noteIndicator);
    }

    const headerText = document.createElement('h2');
    headerText.className = 'session-title';
    const labelWithoutEmoji = session.label.replace(/^📅\s*/, '').replace(/\s*\(\d+\s+Tabs\)$/, '');
    headerText.textContent = labelWithoutEmoji;
    headerText.dataset.sessionId = sessionId;
    headerText.title = labelWithoutEmoji; // FIX: Show full title on hover
    
    headerText.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isLocked) return; // Gesperrte Titel können nicht editiert werden
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
    
    // --- APPEND LEFT SIDE ELEMENTS ---
    sessionLeft.appendChild(topRow);
    sessionLeft.appendChild(headerText);
    sessionLeft.appendChild(subText);

    if (sessionNoteText) {
        const notePreview = document.createElement('div');
        notePreview.className = 'session-note-preview-capsule';
        
        notePreview.style.cssText = `
            font-size: 11px !important;
            line-height: 1.5 !important;
            color: var(--text-muted) !important;
            font-style: italic !important;
            opacity: 0.8 !important;
            margin: 8px 12px 6px 20px !important;
            padding-left: 10px !important;
            border-left: 2px solid var(--primary) !important;
            background-color: transparent !important; /* No heavy gray box background */
            max-height: 55px !important; /* Strictly limit height to prevent link displacement */
            overflow-y: auto !important; /* Enable thin scrollbar for long notes */
            white-space: pre-wrap !important;
            word-break: break-word !important;
        `;
        
        notePreview.textContent = sessionNoteText;
        notePreview.title = "Global Session Note (Scroll to read)";
        sessionLeft.insertBefore(notePreview, subText);
    }

    // --- RIGHT SIDE BUTTONS ---
    const sessionActions = document.createElement('div');
    sessionActions.className = 'session-actions';
    
    // Sort Select Control
    const sortSelect = document.createElement('select');
    sortSelect.className = 'session-sort-select';
    sortSelect.dataset.sessionId = sessionId;
    sortSelect.title = 'Sort links';
    
    const sortOptions = [
      { value: 'date', text: 'Date' },
      { value: 'rating', text: 'Rating' },
      { value: 'alphabetical', text: 'A-Z' },
      { value: 'opens', text: 'Most Opened' }
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

    // COLOR PICKER ROW
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display: flex; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border-color); justify-content: space-between; align-items: center; box-sizing: border-box;';
    
    const colors = [
        { name: 'none', value: 'transparent', border: 'var(--text-muted)', label: 'Default' },
        { name: 'blue', value: '#3b82f6', border: 'transparent', label: 'Blue' },
        { name: 'green', value: '#10b981', border: 'transparent', label: 'Green' },
        { name: 'yellow', value: '#f59e0b', border: 'transparent', label: 'Yellow' },
        { name: 'red', value: '#ef4444', border: 'transparent', label: 'Red' }
    ];

    colors.forEach(col => {
        const dot = document.createElement('button');
        dot.className = 'color-dot-btn';
        dot.title = col.label;
        dot.style.cssText = `
            width: 14px; height: 14px; border-radius: 50%; border: 1px solid ${col.border}; 
            background-color: ${col.value}; cursor: pointer; padding: 0; transition: transform 0.1s ease;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.2); box-sizing: border-box; outline: none;
        `;
        if (sessionColor === col.name) {
            dot.style.transform = 'scale(1.3)';
            dot.style.border = '2px solid var(--primary)';
        }
        
        dot.addEventListener('mouseenter', () => { dot.style.transform = 'scale(1.3)'; });
        dot.addEventListener('mouseleave', () => { if (sessionColor !== col.name) dot.style.transform = 'scale(1)'; });

        dot.onclick = async (e) => {
            e.stopPropagation();
            await setSessionColor(sessionId, col.name);
            await loadLinks();
        };
        colorRow.appendChild(dot);
    });

    dropdownMenu.appendChild(colorRow);

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

    // Edit Session Note action inside dropdown
    const noteSessionBtn = document.createElement('button');
    noteSessionBtn.className = 'session-dropdown-item';
    noteSessionBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; color: var(--primary);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> <span>Edit Session Note</span>';
    noteSessionBtn.dataset.sessionId = sessionId;
    noteSessionBtn.title = 'Add, edit, or clear notes for this entire session';
    if (isLocked) {
        noteSessionBtn.disabled = true;
        noteSessionBtn.style.opacity = '0.4';
        noteSessionBtn.style.cursor = 'not-allowed';
        noteSessionBtn.title = "Session is locked";
    }

    noteSessionBtn.onclick = async (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        
        const currentNote = session.links[0]?.sessionNote || "";
        
        // Trigger the expanded yellow Post-it textarea modal
        const newNote = await showCustomModal(
            "Session Notes", 
            "Add, edit, or clear global notes for this entire session:", 
            [
                { text: "Cancel", value: null, class: "btn-modal-cancel" },
                { text: "Save Note", value: true, class: "btn-modal-confirm" }
            ],
            { type: 'textarea', defaultValue: currentNote, placeholder: "Type your session notes or tasks here..." }
        );
        
        if (newNote !== null) {
            await setSessionNote(sessionId, newNote.trim());
            await loadLinks(); // UI Refresh
        }
    };

    // Delete action inside dropdown
    const deleteSessionBtn = document.createElement('button');
    deleteSessionBtn.className = 'session-dropdown-item btn-session btn-delete';
    deleteSessionBtn.innerHTML = `${ICONS.trash} Delete Session`;
    deleteSessionBtn.dataset.sessionId = sessionId;
    deleteSessionBtn.title = 'Delete Session';
    if (isLocked) {
        deleteSessionBtn.disabled = true;
        deleteSessionBtn.style.opacity = '0.4';
        deleteSessionBtn.style.cursor = 'not-allowed';
        deleteSessionBtn.title = "Session is locked";
    }

    dropdownMenu.appendChild(replaceSessionBtn);
    dropdownMenu.appendChild(downloadSessionBtn);
    dropdownMenu.appendChild(bumpSessionBtn);
    dropdownMenu.appendChild(pinSessionBtn);
    dropdownMenu.appendChild(noteSessionBtn);
    dropdownMenu.appendChild(deleteSessionBtn);

    dropdownDiv.appendChild(dropdownToggleBtn);
    dropdownDiv.appendChild(dropdownMenu);
    
    const lockSessionBtn = document.createElement('button');
    lockSessionBtn.className = `btn-session btn-lock ${isLocked ? 'active' : ''}`;
    
    // Dynamic physical lock toggle (Zero-Emoji-Sovereignty conforming SVGs)
    if (isLocked) {
        // Locked/Closed State
        lockSessionBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    } else {
        // Unlocked/Open State (Subtle unlatched shackle path)
        lockSessionBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';
    }
    
    lockSessionBtn.dataset.sessionId = sessionId;
    lockSessionBtn.dataset.action = 'toggleLock';
    lockSessionBtn.title = isLocked ? 'Unlock Session' : 'Lock/Freeze Session';

    sessionActions.appendChild(lockSessionBtn);
    sessionActions.appendChild(sortSelect);
    sessionActions.appendChild(restoreSessionBtn);
    sessionActions.appendChild(dropdownDiv);
    
    sessionHeader.appendChild(sessionLeft);
    sessionHeader.appendChild(sessionActions);
    sessionSection.appendChild(sessionHeader);
    
    const linksList = document.createElement('div');
    // Weiche: Nur bei mehr als 4 Links wird die Kachel scrollbar (verhindert Dropdown-Clipping)
    linksList.className = `links-list ${session.links.length > 4 ? 'has-scrollbar' : ''}`;
    linksList.dataset.sessionId = sessionId;
    
    if (isCollapsed) {
      linksList.style.display = 'none';
    }

    const safeSessionId = escapeHTML(sessionId);
    const placeholderText = isLocked ? 'Session is locked...' : 'Paste URL to add...';
    const disabledAttr = isLocked ? 'disabled' : '';
    const btnDisabledAttr = isLocked ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';

    const addLinkArea = document.createElement('div');
    addLinkArea.className = 'add-link-area';
    addLinkArea.innerHTML = `
        <input type="text" class="add-link-input" placeholder="${placeholderText}" data-session-id="${safeSessionId}" ${disabledAttr}>
        <button class="btn btn-primary btn-sm btn-add-link" data-session-id="${safeSessionId}" ${btnDisabledAttr}>Add Link</button>
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
  const bar = document.getElementById('global-selection-bar');
  const countText = document.getElementById('global-selection-count');
  
  if (!bar || !countText) return;

  if (selectedLinks.size > 0) {
      countText.textContent = `${selectedLinks.size} link${selectedLinks.size === 1 ? '' : 's'} selected`;
      bar.classList.remove('hidden');
      
      // Track associated session ID context for the actions (e.g. Move/Delete operations)
      const firstSelectedKey = Array.from(selectedLinks)[0];
      const matchedLink = filteredLinks.find(l => getLinkKey(l) === firstSelectedKey);
      const activeSessionId = matchedLink ? (matchedLink.sessionId || `${matchedLink.dateGroup}-${matchedLink.timestamp}`) : null;
      
      // Map the events of the global buttons to the existing operational logic
      document.getElementById('global-open-btn').onclick = () => {
          const btn = document.createElement('button');
          btn.dataset.sessionId = activeSessionId;
          btn.dataset.action = 'openSelected';
          // Trigger the existing handler logic in saved-links.js
          const event = { target: btn, stopImmediatePropagation: () => {} };
          triggerGlobalAction(event, 'openSelected', activeSessionId);
      };
      
      document.getElementById('global-move-btn').onclick = () => {
          const btn = document.createElement('button');
          btn.dataset.sessionId = activeSessionId;
          btn.dataset.action = 'moveSelected';
          const event = { target: btn, stopImmediatePropagation: () => {} };
          triggerGlobalAction(event, 'moveSelected', activeSessionId);
      };
      
      document.getElementById('global-delete-btn').onclick = () => {
          const btn = document.createElement('button');
          btn.dataset.sessionId = activeSessionId;
          btn.dataset.action = 'deleteSelected';
          const event = { target: btn, stopImmediatePropagation: () => {} };
          triggerGlobalAction(event, 'deleteSelected', activeSessionId);
      };
  } else {
      bar.classList.add('hidden');
  }
}

async function triggerGlobalAction(fakeEvent, actionName, sessionId) {
  // Re-route dynamically to the existing central click handler
  if (actionName === 'openSelected') {
      const sessionLinks = filteredLinks.filter(link => {
          const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
          return linkSessionId === sessionId;
      });
      const selectedInSession = sessionLinks.filter(link => selectedLinks.has(getLinkKey(link)));
      
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
              if (targetLink) targetLink.openCount = (targetLink.openCount || 0) + 1;
              await chrome.tabs.create({ url: sLink.url, active: false });
          }
          await saveLinks(allLinks);
          await loadLinks();
      }
  } 
  else if (actionName === 'moveSelected') {
      const sessionLinks = filteredLinks.filter(link => {
          const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
          return linkSessionId === sessionId;
      });
      const selectedInSession = sessionLinks.filter(link => selectedLinks.has(getLinkKey(link)));
      if (selectedInSession.length === 0) return;
      
      const sessionOptions = [{ value: 'NEW_SESSION_AUTO', text: 'Create New Session' }];
      const processedSessionIds = new Set();
      allLinks.forEach(link => {
          const sId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
          if (sId !== sessionId && !processedSessionIds.has(sId)) {
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
              const targetLinkSample = allLinks.find(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === targetValue);
              if (targetLinkSample) {
                  targetLabel = targetLinkSample.sessionLabel;
                  targetPinned = targetLinkSample.isPinned;
              }
          }
          allLinks.forEach(link => {
              const linkKey = getLinkKey(link);
              if (selectedLinks.has(linkKey)) {
                  const sId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
                  if (sId === sessionId) {
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
  }
  else if (actionName === 'deleteSelected') {
      const selectedInSession = allLinks.filter(link => selectedLinks.has(getLinkKey(link)));
      if (selectedInSession.length === 0) return;

      const isLocked = selectedInSession.some(link => link.isLocked);
      if (isLocked) return;

      const settings = await getSettings();
      if (settings.confirmBeforeClose !== false) {
          const confirmed = await showCustomModal("Delete Selected", `Really delete ${selectedInSession.length} selected link(s)?\nThis cannot be undone.`, [{ text: "Cancel", value: false, class: "btn-modal-cancel" }, { text: "Delete All", value: true, class: "btn-modal-danger" }]);
          if (!confirmed) return;
      }
      allLinks = await getLinks();
      allLinks = allLinks.filter(link => !selectedLinks.has(getLinkKey(link)));
      selectedInSession.forEach(link => selectedLinks.delete(getLinkKey(link)));
      await saveLinks(allLinks);
      await loadLinks();
  }
}

function createLinkElement(link) {
  let hostname = "Unknown";
  try { hostname = new URL(link.url).hostname.replace('www.',''); } catch(e) { hostname = "Invalid URL"; }

  const div = document.createElement('div');
  div.className = 'link-item';

  const linkKey = getLinkKey(link);
  const isSelected = selectedLinks.has(linkKey);
  if (isSelected) div.classList.add('selected');
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'link-checkbox';
  checkbox.dataset.linkKey = linkKey; 
  if (isSelected) checkbox.checked = true;

  const isSessionLocked = link.isLocked || false;
  if (isSessionLocked) {
      checkbox.disabled = true;
      div.setAttribute('draggable', 'false');
      div.style.cursor = 'default';
  } else {
      div.setAttribute('draggable', 'true');
  }

  const linkInfo = document.createElement('div');
  linkInfo.className = 'link-info';

  const linkHeader = document.createElement('div');
  linkHeader.className = 'link-header';

  // Sicherheits-Weiche: Absolute Extension-Favicons abfangen und auf Vektor-Fallback umleiten
  const isExtensionFavicon = link.favicon && link.favicon.startsWith('chrome-extension://');

  if (link.favicon && !isExtensionFavicon) {
      const img = document.createElement('img');
      img.src = link.favicon;
      img.className = 'favicon';
      img.onerror = () => { img.style.display = 'none'; }; 
      linkHeader.appendChild(img);
  } else {
      const fallbackContainer = document.createElement('div');
      fallbackContainer.style.cssText = 'display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important; width: 14px !important; height: 14px !important;';
      fallbackContainer.innerHTML = ICONS.fallbackFavicon;
      linkHeader.appendChild(fallbackContainer);
  }

  const linkTitle = document.createElement('a');
  linkTitle.href = sanitizeURL(link.url); // Schutz vor javascript: Injektionen
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

  // --- DYNAMISCHER SIGNAL-INDICATOR START ---
  if (link.note && link.note.trim() !== "") {
      const noteIndicator = document.createElement('span');
      noteIndicator.className = 'link-note-indicator';
      noteIndicator.innerHTML = ICONS.note; // Ersetzt das Emoij '📝' durch unseren sauberen SVG-Pfad!
      noteIndicator.title = link.note; // Hover-Vorschau bleibt erhalten
      linkHeader.appendChild(noteIndicator);
  }
  // --- DYNAMISCHER SIGNAL-INDICATOR END ---

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
  
  // 1. Mouseover-Effekt (Sterne füllen sich beim Drüberfahren)
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
  
  // 2. Mouseleave-Effekt (Sterne fallen sauber auf den AKTUELLEN Objekt-Zustand zurück)
  ratingContainer.addEventListener('mouseleave', () => {
    const currentRating = link.rating || 0; // Dynamischer Lese-Zugriff
    ratingContainer.querySelectorAll('.star').forEach(s => {
      const val = parseInt(s.dataset.value, 10);
      s.textContent = val <= currentRating ? '★' : '☆';
      s.classList.remove('hovered');
    });
  });
  
  // 3. Klick-Interaktion (Optimistisches Update mit dynamischer Zustandsberechnung)
  ratingContainer.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const star = e.target.closest('.star');
    if (!star) return;
    const clickedValue = parseInt(star.dataset.value, 10);
    
    const currentRating = link.rating || 0; // Dynamischer Lese-Zugriff
    const newRating = currentRating === clickedValue ? 0 : clickedValue;
    
    // Optimistic UI Update: Lokalen Objektzustand und DOM sofort synchron umschalten
    link.rating = newRating; 
    ratingContainer.querySelectorAll('.star').forEach(s => {
      const val = parseInt(s.dataset.value, 10);
      s.textContent = val <= newRating ? '★' : '☆';
    });
    ratingContainer.className = `link-rating-container ${newRating > 0 ? 'rated' : 'unrated'}`;
    
    try {
      // Synchronisations-Lock setzen und persistent speichern
      ignoreNextStorageChange = true;
      await setRating(linkKey, newRating);
    } catch (err) {
      console.error("Failed to set rating:", err);
      ignoreNextStorageChange = false;
      await loadLinks(); // Rollback bei unerwartetem Fehler
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

  // Edit Note button inside dropdown
  const noteItemBtn = createBtn(ICONS.tag, 'btn-link-note', 'Add/Edit Note', { url: link.url, timestamp: link.timestamp });
  noteItemBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" style="width: 13px; height: 13px; color: var(--primary);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> <span>Edit Note</span>';
  noteItemBtn.className = 'link-dropdown-item btn-link-note';
  if (isSessionLocked) {
      noteItemBtn.disabled = true;
      noteItemBtn.style.opacity = '0.4';
      noteItemBtn.style.cursor = 'not-allowed';
      noteItemBtn.title = "Session is locked";
  }

  // NEUER BUTTON: Rename Title
  const renameItemBtn = createBtn('', 'btn-link-rename', 'Rename Title', { url: link.url, timestamp: link.timestamp });
  renameItemBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" style="width: 13px; height: 13px; color: var(--primary);"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke-linecap="round" stroke-linejoin="round"></path></svg> <span>Rename Title</span>';
  renameItemBtn.className = 'link-dropdown-item btn-link-rename';
  if (isSessionLocked) {
      renameItemBtn.disabled = true;
      renameItemBtn.style.opacity = '0.4';
      renameItemBtn.style.cursor = 'not-allowed';
      renameItemBtn.title = "Session is locked";
  }

  // Whitelist item inside dropdown
  const whitelistItemBtn = createBtn(ICONS.shield, 'btn-link-whitelist', 'Add to Whitelist', { url: link.url });
  whitelistItemBtn.innerHTML = `${ICONS.shield} <span>Whitelist</span>`;
  whitelistItemBtn.className = 'link-dropdown-item btn-link-whitelist';

  // Edit Category item inside dropdown
  const categoryItemBtn = createBtn(ICONS.tag, 'btn-link-category', 'Edit Category', { action: 'category', url: link.url });
  categoryItemBtn.innerHTML = `${ICONS.tag} <span>Edit Category</span>`;
  categoryItemBtn.className = 'link-dropdown-item btn-link-category';

  dropdownMenu.appendChild(renameItemBtn);
  dropdownMenu.appendChild(noteItemBtn);
  dropdownMenu.appendChild(whitelistItemBtn);
  dropdownMenu.appendChild(categoryItemBtn);

  dropdownDiv.appendChild(dropdownToggleBtn);
  dropdownDiv.appendChild(dropdownMenu);

  linkActions.appendChild(createBtn(ICONS.link, 'btn-link-open', 'Open Tab', { action: 'open', url: link.url }));
  
  if (isSessionLocked) {
      // Premium Polish: If the session is frozen, swap out the disabled trash icon 
      // with a static padlock symbol to visually explain why deletion is disabled.
      const lockIconHtml = '<svg class="icon-svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; opacity: 0.4;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
      const lockIndicatorBtn = createBtn(lockIconHtml, 'btn-link-locked', 'This session is locked/frozen', {});
      lockIndicatorBtn.style.cursor = 'default';
      lockIndicatorBtn.style.pointerEvents = 'none';
      linkActions.appendChild(lockIndicatorBtn);
  } else {
      // Otherwise, render the standard active delete button
      const trashBtn = createBtn(ICONS.trash, 'btn-link-delete', 'Delete', { action: 'delete', url: link.url, timestamp: link.timestamp });
      linkActions.appendChild(trashBtn);
  }
  
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

document.getElementById('goToSettingsBtn')?.addEventListener('click', () => {
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
  if (e.target.closest('[data-action="toggleLock"]')) {
    e.stopPropagation();
    const btn = e.target.closest('[data-action="toggleLock"]');
    const sessionId = btn.dataset.sessionId;
    await toggleLockSession(sessionId);
    await loadLinks();
    return;
  }
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
        // --- KACHEL-STABILITÄT-SYNCHRONISATION START ---
        // Erbt den Erstellungszeitstempel der Kachel, um ein Springen der Karte zu verhindern!
        timestamp: sessionSample ? sessionSample.timestamp : timestamp, 
        // --- KACHEL-STABILITÄT-SYNCHRONISATION END ---
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
            await showCustomModal("Whitelisted", `Domain "${domain}" added to Whitelist!`, [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
        }
    } catch (error) { 
        console.error(error); 
        await showCustomModal("Error", 'Could not parse URL for whitelist.', [{ text: "OK", value: true, class: "btn-modal-confirm" }]);
    }
    return;
  }
  if (e.target.closest('.btn-link-rename')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-rename');
    const url = btn.dataset.url;
    const timestamp = btn.dataset.timestamp;
    
    const initialLinks = await getLinks();
    const linkToUpdate = initialLinks.find(l => l.url === url && l.timestamp === timestamp);
    
    if (linkToUpdate) {
      const newTitle = await showCustomModal(
          "Rename Link Title", 
          "Enter a custom title for this saved link:", 
          [
              { text: "Cancel", value: null, class: "btn-modal-cancel" },
              { text: "Rename", value: true, class: "btn-modal-confirm" }
          ],
          { defaultValue: linkToUpdate.title || linkToUpdate.url, placeholder: "e.g., LeanTabs Setup Guide..." }
      );
      
      if (newTitle !== null && newTitle.trim()) {
        const freshLinks = await getLinks();
        let updated = false;
        freshLinks.forEach(l => {
          if (l.url === url && l.timestamp === timestamp) {
              l.title = newTitle.trim();
              updated = true;
          }
        });
        if (updated) {
          // Optimistic UI: Titel direkt im DOM-Element anpassen ohne Neuladen
          const linkItem = btn.closest('.link-item');
          const linkTitleEl = linkItem ? linkItem.querySelector('.link-title') : null;
          if (linkTitleEl) {
            linkTitleEl.textContent = newTitle.trim();
            linkTitleEl.title = newTitle.trim();
          }
          
          ignoreNextStorageChange = true; // Blockiert das globale Storage-onChanged-Flackern
          await saveLinks(freshLinks);
        }
      }
    }
    return;
  }
  if (e.target.closest('.btn-link-note')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-note');
    const url = btn.dataset.url;
    const timestamp = btn.dataset.timestamp;
    
    const initialLinks = await getLinks();
    const linkToUpdate = initialLinks.find(l => l.url === url && l.timestamp === timestamp);
    
    if (linkToUpdate) {
      if (linkToUpdate.isLocked) {
          return; // Safety guard: do not edit notes of locked links
      }
      const currentNote = linkToUpdate.note || "";
      
      // Wir nutzen das erweiterte showCustomModal im 'textarea' Post-It-Modus!
      const newNote = await showCustomModal(
          "Link Notes", 
          "Add, edit, or delete notes for this link:", 
          [
              { text: "Cancel", value: null, class: "btn-modal-cancel" },
              { text: "Save Note", value: true, class: "btn-modal-confirm" }
          ],
          { type: 'textarea', defaultValue: currentNote, placeholder: "Type your notes here... (Supports multiple lines)" }
      );
      
      if (newNote !== null) {
        const freshLinks = await getLinks();
        let updated = false;
        freshLinks.forEach(l => {
          if (l.url === url && l.timestamp === timestamp) {
              l.note = newNote.trim();
              updated = true;
          }
        });
        if (updated) {
          // Optimistic UI: Notizen-Icon dynamisch und flackerfrei im DOM anpassen
          const linkItem = btn.closest('.link-item');
          const linkHeader = linkItem ? linkItem.querySelector('.link-header') : null;
          
          if (linkHeader) {
            let noteIndicator = linkHeader.querySelector('.link-note-indicator');
            
            if (newNote.trim() !== "") {
              // Wenn eine neue Notiz existiert, erstelle oder aktualisiere das Icon
              if (!noteIndicator) {
                noteIndicator = document.createElement('span');
                noteIndicator.className = 'link-note-indicator';
                noteIndicator.innerHTML = ICONS.note;
                linkHeader.appendChild(noteIndicator);
              }
              noteIndicator.title = newNote.trim();
            } else {
              // Wenn die Notiz gelöscht wurde, entferne das Icon aus der Zeile
              if (noteIndicator) {
                noteIndicator.remove();
              }
            }
          }
          
          ignoreNextStorageChange = true; // Blockiert das globale Storage-onChanged-Flackern
          await saveLinks(freshLinks);
        }
      }
    }
    return;
  }
  if (e.target.closest('.btn-link-delete')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-link-delete');
    const url = btn.dataset.url;
    const timestamp = btn.dataset.timestamp;

    // Safety check: is parent session locked?
    allLinks = await getLinks();
    const targetLink = allLinks.find(link => link.url === url && link.timestamp === timestamp);
    if (targetLink && targetLink.isLocked) {
        return; // Do not delete locked links
    }

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
    sessionOptions.push({ value: 'NEW_SESSION_AUTO', text: 'Create New Session' });
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

    // Safety check: is parent session locked?
    const isLocked = selectedInSession.some(link => link.isLocked);
    if (isLocked) {
        return; // Do not delete locked links
    }
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
    
    // --- CONTEXTUAL RESTORE ENGINE START (Absolute UX-Sovereignty) ---
    const MAX_SAFE_TABS = 15;
    const isMassiveRestore = sessionLinks.length > MAX_SAFE_TABS;

    // Wir analysieren die Fensterstruktur der Sitzung vorab
    const linksByWindow = {};
    sessionLinks.forEach(link => {
        const wId = link.windowId || 'default';
        if (!linksByWindow[wId]) linksByWindow[wId] = [];
        linksByWindow[wId].push(link.url);
    });
    const windowIds = Object.keys(linksByWindow);
    const isMultiWindow = windowIds.length > 1;

    if (isReplace) {
        // FALL A: REPLACE (Das gelbe Blitz-Symbol) — Ersetzen ist immer fenstergebunden
        let warningText = '';
        if (isMassiveRestore) {
            warningText += `\n\n[WARNING] Opening ${sessionLinks.length} tabs simultaneously might temporarily slow down your browser!`;
        }

        const choice = await showCustomModal(
            "Replace Workspace",
            `You are about to replace your active workspace with this session (${sessionLinks.length} tabs).\n\nHow would you like to handle your currently open tabs?${warningText}`,
            [
                { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                { text: "Replace (Discard Current)", value: "discard_replace", class: "btn-modal-danger" },
                { text: "Save Current & Replace", value: "save_replace", class: "btn-modal-confirm" }
            ]
        );

        if (choice && choice !== "cancel") {
            await executeRestoreAction(choice, sessionLinks, linksByWindow, windowIds);
        }
    } else {
        // FALL B: RESTORE (Das blaue Pfeil-Symbol) — Interaktive, kontextsensitive Weiche!
        let title = isMultiWindow ? "Restore Multi-Window Session" : "Restore Session";
        let msg = isMultiWindow
            ? `This session was originally saved across ${windowIds.length} separate windows.\n\nHow do you want to restore them?`
            : `How do you want to restore these ${sessionLinks.length} link(s)?`;

        if (isMassiveRestore) {
            msg += `\n\n[WARNING] Opening ${sessionLinks.length} tabs simultaneously might temporarily slow down your browser!`;
        }

        let buttons = [];
        if (isMultiWindow) {
            // Auswahl bei echten Multi-Window Backups
            buttons = [
                { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                { text: "Merge into Current Window", value: "current_window", class: "btn-modal-secondary" },
                { text: "Restore Window Structure", value: "restore_structure", class: "btn-modal-confirm" }
            ];
        } else {
            // Auswahl bei Standard- oder einzelnen Workspace-Kacheln (Die ultimative Opera-Weiche!)
            buttons = [
                { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                { text: "Open in Current Window", value: "current_window", class: "btn-modal-secondary" },
                { text: "Open in New Window", value: "new_window", class: "btn-modal-confirm" }
            ];
        }

        const choice = await showCustomModal(title, msg, buttons);
        if (choice && choice !== 'cancel') {
            await executeRestoreAction(choice, sessionLinks, linksByWindow, windowIds);
        }
    }
    return;
  }
  if (e.target.closest('.btn-session.btn-delete')) {
    e.stopImmediatePropagation();
    const btn = e.target.closest('.btn-session.btn-delete');
    const sessionId = btn.dataset.sessionId;

    // Safety check: is session locked?
    allLinks = await getLinks();
    const sessionLinks = allLinks.filter(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      return linkSessionId === sessionId;
    });
    const isLocked = sessionLinks.some(link => link.isLocked);
    if (isLocked) {
        return; // Do not delete locked session
    }

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

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedApplyFilters = debounce(applyFilters, 150);

const searchInputEl = document.getElementById('searchInput');
if (searchInputEl) {
  searchInputEl.addEventListener('input', debouncedApplyFilters);
}

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
  const confirmed = await showCustomModal(
    "Delete All Unlocked Sessions", 
    `Are you sure you want to delete ALL ${allLinks.length} saved links?\n\nThis will clear your library. Locked/frozen sessions will remain protected. This action cannot be undone.`, 
    [
      { text: "Cancel", value: false, class: "btn-modal-cancel" },
      { text: "Yes, Delete All", value: true, class: "btn-modal-danger" }
    ]
  );
  
  if (confirmed) {
    allLinks = await getLinks();
    const lockedLinks = allLinks.filter(link => link.isLocked);
    await saveLinks(lockedLinks);
    await loadLinks();
  }
});

document.getElementById('toggleAllBtn').addEventListener('click', () => {
  const btn = document.getElementById('toggleAllBtn');
  const isCollapsing = btn.textContent.includes('Collapse');
  const newDisplay = isCollapsing ? 'none' : 'block';
  
  const iconRight = `<span class="icon" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 6px;"><svg class="icon-svg" style="width: 12px; height: 12px; stroke-width: 2.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  const iconDown = `<span class="icon" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 6px;"><svg class="icon-svg" style="width: 12px; height: 12px; stroke-width: 2.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  
  const newHtml = isCollapsing 
    ? `${iconRight} Expand All` 
    : `${iconDown} Collapse All`;

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
let draggedSelection = null; // Will hold array of keys of selected links being dragged

function handleDragStart(e) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput.value.trim() !== '' || document.getElementById('categoryFilter').value !== '' || document.getElementById('windowFilter').value !== '') {
      e.preventDefault();
      return;
  }
  dragSourceEl = this;
  dragSourceKey = this.querySelector('.link-checkbox').dataset.linkKey;
  dragSessionId = this.closest('.links-list').dataset.sessionId;
  
  // --- MULTI-DRAG CAPTURE START ---
  if (selectedLinks.has(dragSourceKey)) {
      draggedSelection = Array.from(selectedLinks);
      
      // Optional: Visual indicator inside drag feedback
      if (e.dataTransfer.setDragImage) {
          const badge = document.createElement('div');
          badge.style.cssText = 'position: absolute; top: -1000px; padding: 6px 12px; background: var(--primary); color: white; font-size: 11px; font-weight: bold; border-radius: 99px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);';
          badge.textContent = `Moving ${selectedLinks.size} link${selectedLinks.size === 1 ? '' : 's'}...`;
          document.body.appendChild(badge);
          e.dataTransfer.setDragImage(badge, 10, 10);
          setTimeout(() => badge.remove(), 10);
      }
  } else {
      draggedSelection = null; // Standard Single-Drag Fallback
  }
  // --------------------------------
  
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML); 
  this.classList.add('dragging');

  // --- NEU: AKTIVIERE DRAG-SHIELD IM CONTAINER ---
  document.getElementById('linksContainer')?.classList.add('dragging-active');
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault(); 
  e.dataTransfer.dropEffect = 'move';
  return false;
}

// --- UPGRADED DRAG ENTER (CROSS-CARD & LOCK AWARE) ---
function handleDragEnter(e) {
  const targetSession = this.closest('.links-list').dataset.sessionId;
  
  // Sicherheits-Check: Holen des Sperr-Zustands der Ziel-Session
  const targetSessionLink = allLinks.find(l => {
      const sId = l.sessionId || `${l.dateGroup}-${l.timestamp}`;
      return sId === targetSession;
  });
  const isTargetLocked = targetSessionLink?.isLocked || false;

  // Erlaube Ziehen über Grenzen hinweg, aber sperre ge-lock-te Kacheln
  if (this !== dragSourceEl && !isTargetLocked) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

// --- UPGRADED DROP TRIGGER (CROSS-CARD & STORAGE ATOMIC) ---
async function handleDrop(e) {
  e.stopPropagation(); 
  const targetSession = this.closest('.links-list').dataset.sessionId;
  
  // 1. Frischen Datenbankzustand abfragen
  const freshLinks = await getLinks();
  
  const targetSessionLink = freshLinks.find(l => {
      const sId = l.sessionId || `${l.dateGroup}-${l.timestamp}`;
      return sId === targetSession;
  });
  const isTargetLocked = targetSessionLink?.isLocked || false;
  if (isTargetLocked) {
      return false; 
  }

  const targetKey = this.querySelector('.link-checkbox').dataset.linkKey;
  const targetIndex = freshLinks.findIndex(l => getLinkKey(l) === targetKey);

  if (targetIndex > -1) {
      if (draggedSelection && draggedSelection.length > 0) {
          if (draggedSelection.includes(targetKey)) {
              return false;
          }

          const itemsToMove = [];
          // Modifikationen auf freshLinks statt allLinks ausführen
          const remainingLinks = freshLinks.filter(l => {
              const key = getLinkKey(l);
              if (draggedSelection.includes(key)) {
                  l.sessionId = targetSession;
                  l.sessionLabel = targetSessionLink ? targetSessionLink.sessionLabel : "Restored Session";
                  l.isPinned = targetSessionLink ? (targetSessionLink.isPinned || false) : false;
                  l.timestamp = targetSessionLink ? targetSessionLink.timestamp : l.timestamp;
                  l.dateGroup = targetSessionLink ? targetSessionLink.dateGroup : l.dateGroup;
                  
                  itemsToMove.push(l);
                  return false; 
              }
              return true;
          });

          let adjustedTargetIndex = remainingLinks.findIndex(l => getLinkKey(l) === targetKey);
          if (adjustedTargetIndex === -1) adjustedTargetIndex = remainingLinks.length;

          remainingLinks.splice(adjustedTargetIndex, 0, ...itemsToMove);
          
          // Zuweisung an die globale Referenz kurz vor dem Speichern
          allLinks = remainingLinks;
          selectedLinks.clear(); 
      } 
      else if (dragSourceEl && dragSourceKey && dragSourceEl !== this) {
          const sourceIndex = freshLinks.findIndex(l => getLinkKey(l) === dragSourceKey);
          if (sourceIndex > -1) {
              const [movedItem] = freshLinks.splice(sourceIndex, 1);
              if (dragSessionId !== targetSession) {
                  movedItem.sessionId = targetSession;
                  movedItem.sessionLabel = targetSessionLink ? targetSessionLink.sessionLabel : "Restored Session";
                  movedItem.isPinned = targetSessionLink ? (targetSessionLink.isPinned || false) : false;
                  movedItem.timestamp = targetSessionLink ? targetSessionLink.timestamp : movedItem.timestamp;
                  movedItem.dateGroup = targetSessionLink ? targetSessionLink.dateGroup : movedItem.dateGroup;
              }
              let adjustedTargetIndex = freshLinks.findIndex(l => getLinkKey(l) === targetKey);
              if (adjustedTargetIndex === -1) adjustedTargetIndex = freshLinks.length;
              freshLinks.splice(adjustedTargetIndex, 0, movedItem);
              
              // Zuweisung an die globale Referenz kurz vor dem Speichern
              allLinks = freshLinks;
          }
      }
      
      sessionSortStates[targetSession] = 'date';
      await saveLinks(allLinks);
      await loadLinks(); 
  }
  return false;
}

function handleDragEnd(e) {
  // --- NEU: DEAKTIVIERE DRAG-SHIELD ---
  document.getElementById('linksContainer')?.classList.remove('dragging-active');

  this.classList.remove('dragging');
  document.querySelectorAll('.link-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  document.querySelectorAll('.session-header').forEach(header => {
    header.classList.remove('drag-over-header');
  });
  if (dragExpandTimeout) {
    clearTimeout(dragExpandTimeout);
    dragExpandTimeout = null;
  }
  
  // Reset selection drag states
  draggedSelection = null; 
}

function handleHeaderDragEnter(e) {
  e.preventDefault();
  const header = this;
  const targetSessionId = header.dataset.sessionId;
  
  // Check if target is locked
  const targetLink = allLinks.find(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === targetSessionId);
  if (targetLink?.isLocked) return;

  header.classList.add('drag-over-header');
  
  // If target session is collapsed, start the 700ms auto-expand timer
  const isCollapsed = collapsedSessions.has(`collapsed-${targetSessionId}`) || 
                      (!collapsedSessions.has(`expanded-${targetSessionId}`) && sessionsDefaultCollapsed);
  
  if (isCollapsed) {
      if (dragExpandTimeout) clearTimeout(dragExpandTimeout);
      dragExpandTimeout = setTimeout(() => {
          toggleSessionCollapse(targetSessionId);
          header.classList.remove('drag-over-header');
      }, 700);
  }
}

function handleHeaderDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleHeaderDragLeave(e) {
  // Guard: Prevent premature cleanup when hovering over text children
  if (e.currentTarget.contains(e.relatedTarget)) return;

  this.classList.remove('drag-over-header');
  if (dragExpandTimeout) {
      clearTimeout(dragExpandTimeout);
      dragExpandTimeout = null;
  }
}

async function handleHeaderDrop(e) {
  e.stopPropagation();
  this.classList.remove('drag-over-header');
  if (dragExpandTimeout) {
      clearTimeout(dragExpandTimeout);
      dragExpandTimeout = null;
  }

  const targetSessionId = this.dataset.sessionId;
  
  // 1. Frischen Datenbankzustand abfragen
  const freshLinks = await getLinks();
  
  // Safety Check: Is target session locked?
  const targetLinkSample = freshLinks.find(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === targetSessionId);
  if (targetLinkSample?.isLocked) return false;

  if (draggedSelection && draggedSelection.length > 0) {
      // --- MULTI-DROP ON COLLAPSED HEADER WITH TIMESTAMP SYNC ---
      const itemsToMove = [];
      const remainingLinks = freshLinks.filter(l => {
          const key = getLinkKey(l);
          if (draggedSelection.includes(key)) {
              l.sessionId = targetSessionId;
              l.sessionLabel = targetLinkSample ? targetLinkSample.sessionLabel : "Restored Session";
              l.isPinned = targetLinkSample ? (targetLinkSample.isPinned || false) : false;
              
              // SYNC TIMESTAMPS: Freeze sorting position completely!
              l.timestamp = targetLinkSample ? targetLinkSample.timestamp : l.timestamp;
              l.dateGroup = targetLinkSample ? targetLinkSample.dateGroup : l.dateGroup;
              
              itemsToMove.push(l);
              return false;
          }
          return true;
      });

      let insertIndex = remainingLinks.length;
      for (let i = remainingLinks.length - 1; i >= 0; i--) {
          const sId = remainingLinks[i].sessionId || `${remainingLinks[i].dateGroup}-${remainingLinks[i].timestamp}`;
          if (sId === targetSessionId) {
              insertIndex = i + 1;
              break;
          }
      }

      remainingLinks.splice(insertIndex, 0, ...itemsToMove);
      allLinks = remainingLinks;
      selectedLinks.clear();
      sessionSortStates[targetSessionId] = 'date';
      
      await saveLinks(allLinks);
      await loadLinks();
  } 
  else if (dragSourceEl && dragSourceKey && dragSessionId !== targetSessionId) {
      // --- STANDARD SINGLE-DROP FALLBACK WITH TIMESTAMP SYNC ---
      const sourceIndex = freshLinks.findIndex(l => getLinkKey(l) === dragSourceKey);
      if (sourceIndex > -1) {
          const [movedItem] = freshLinks.splice(sourceIndex, 1);
          movedItem.sessionId = targetSessionId;
          movedItem.sessionLabel = targetLinkSample ? targetLinkSample.sessionLabel : "Restored Session";
          movedItem.isPinned = targetLinkSample ? (targetLinkSample.isPinned || false) : false;

          // SYNC TIMESTAMPS
          movedItem.timestamp = targetLinkSample ? targetLinkSample.timestamp : movedItem.timestamp;
          movedItem.dateGroup = targetLinkSample ? targetLinkSample.dateGroup : movedItem.dateGroup;

          let insertIndex = freshLinks.length;
          for (let i = freshLinks.length - 1; i >= 0; i--) {
              const sId = freshLinks[i].sessionId || `${freshLinks[i].dateGroup}-${freshLinks[i].timestamp}`;
              if (sId === targetSessionId) {
                  insertIndex = i + 1;
                  break;
              }
          }

          freshLinks.splice(insertIndex, 0, movedItem);
          allLinks = freshLinks;
          sessionSortStates[targetSessionId] = 'date';
          
          await saveLinks(allLinks);
          await loadLinks();
      }
  }
  return false;
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

// --- HELPER: SHOW UNDO TOAST FOR DELETED ELEMENTS (SELF-HEALING) ---
function showLpUndoToast(message) {
  let toast = document.getElementById('lp-undo-toast');
  
  // DYNAMISCHE SELBTHEILUNG: Falls der Toast fehlt, erzeuge ihn direkt im body
  if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lp-undo-toast';
      toast.className = 'lp-undo-toast hidden';
      
      // SEMANTISCHES SVG ICON (Filigraner Mülleimer)
      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = 'display: flex !important; align-items: center !important; justify-content: center !important; color: var(--primary) !important; flex-shrink: 0 !important;';
      iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
      
      const textSpan = document.createElement('span');
      textSpan.id = 'lp-undo-text';
      textSpan.style.fontSize = '13px';
      textSpan.style.fontWeight = '600'; // Etwas dickerer Schriftschnitt für bessere Lesbarkeit
      
      const btnEl = document.createElement('button');
      btnEl.id = 'lp-undo-btn';
      btnEl.style.cssText = 'all: unset !important; cursor: pointer !important; font-weight: 700 !important; color: var(--primary) !important; font-size: 13px !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; margin-left: 16px;';
      btnEl.textContent = 'Undo';
      
      toast.appendChild(iconContainer); // Icon zuerst einfügen!
      toast.appendChild(textSpan);
      toast.appendChild(btnEl);
      document.body.appendChild(toast);
  }

  const text = document.getElementById('lp-undo-text');
  const btn = document.getElementById('lp-undo-btn');
  
  if (!text || !btn) return;

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
        const sortedBackup = [...lpActiveUndoData.data].sort((a, b) => a.index - b.index);
        sortedBackup.forEach(item => {
            const insertIndex = Math.min(item.index, currentLinks.length);
            currentLinks.splice(insertIndex, 0, item.data);
        });
      }
      
      await saveLinks(currentLinks);
      lpActiveUndoData = null;
      toast.classList.add('hidden');
      await loadLinks(); // UI Update
    }
  };

  lpUndoTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    lpActiveUndoData = null;
  }, 6000); // 6 Sekunden Einblendzeit
}

// =============================================================================
// --- VIEW SWITCHER & SETTINGS UNIFICATION LOGIC (ZERO-REGRESSION) ---
// =============================================================================

// 1. NAVIGATION CONTROL (With Hash-Aware Initiation)
function initViewNavigation() {
    const btnLinks = document.getElementById('nav-links-btn');
    const btnSettings = document.getElementById('nav-settings-btn');
    const viewLinks = document.getElementById('linksViewContainer');
    const viewSettings = document.getElementById('settingsViewContainer');

    if (!btnLinks || !btnSettings || !viewLinks || !viewSettings) return;

    const switchView = (targetView) => {
        if (targetView === 'settings') {
            viewLinks.classList.add('hidden');
            viewSettings.classList.remove('hidden');
            btnLinks.classList.remove('active');
            btnSettings.classList.add('active');
            loadSettingsViewData();
        } else {
            viewSettings.classList.add('hidden');
            viewLinks.classList.remove('hidden');
            btnSettings.classList.remove('active');
            btnLinks.classList.add('active');
            loadLinks(); 
        }
    };

    btnLinks.addEventListener('click', () => { window.location.hash = 'links'; switchView('links'); });
    btnSettings.addEventListener('click', () => { window.location.hash = 'settings'; switchView('settings'); });

    // --- DEFENSIRE INITIALISIERUNG ANHAND DES HASHES ---
    const handleHash = () => {
        const currentHash = window.location.hash;
        if (currentHash === '#settings') {
            switchView('settings');
        } else {
            switchView('links');
            
            // Focus search input safely after paint
            setTimeout(() => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 50);
        }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
}

// 2. UNIFIED SETTINGS CONTROLLER (Adapted from options.js)
let settingsWhitelist = [];
let localSettingsObj = {};

function updateSettingsSaveStatus(message, type = 'success') {
    const status = document.getElementById('saveStatus');
    if (!status) return;
    status.textContent = message;
    status.style.color = type === 'success' ? 'var(--success)' : 'var(--danger)';
    setTimeout(() => { status.textContent = ''; }, 3000);
}

async function loadSettingsViewData() {
    try {
        settingsWhitelist = await getWhitelist();
        const rawSettings = await getSettings();
        localSettingsObj = { 
            keepLastTabs: 1, 
            autoBackup: true, 
            confirmBeforeClose: true, 
            deleteAfterRestore: false,
            cleanAllWorkspaces: false,
            sessionsDefaultCollapsed: false,
            restoreWindowStructure: true,
            smartImport: true,
            ...rawSettings
        };
        const backups = await getBackups();
        
        renderWhitelistUI();
        syncSettingsToForm();
        renderBackupsUI(backups);
    } catch (e) {
        console.error("Failed to load settings data:", e);
    }
}

function renderWhitelistUI() {
    const container = document.getElementById('whitelistContainer');
    if (!container) return;
    if (settingsWhitelist.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding:15px; font-size:12px;">No protected domains. Add some!</p>';
        return;
    }
    const ICONS_SHIELD = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ICONS_TRASH = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    container.innerHTML = settingsWhitelist.map((domain, index) => {
        const safeDomain = escapeHTML(domain); // Maskiere Domain gegen XSS
        return `
            <div class="whitelist-item">
              <span style="display:flex; align-items:center; gap:8px;">${ICONS_SHIELD} ${safeDomain}</span>
              <button class="btn-icon-danger btn-delete-whitelist" data-index="${index}" title="Delete Domain">
                ${ICONS_TRASH}
              </button>
            </div>
        `;
    }).join('');
}

function syncSettingsToForm() {
    const keepInput = document.getElementById('keepTabsInput');
    if (keepInput) keepInput.value = localSettingsObj.keepLastTabs;

    const mappings = [
        { id: 'autoBackupCheck', key: 'autoBackup' },
        { id: 'confirmCheck', key: 'confirmBeforeClose' },
        { id: 'deleteAfterRestoreCheck', key: 'deleteAfterRestore' },
        { id: 'cleanAllWorkspacesCheck', key: 'cleanAllWorkspaces' },
        { id: 'sessionsDefaultCollapsedCheck', key: 'sessionsDefaultCollapsed' },
        { id: 'smartImportCheck', key: 'smartImport' },
        { id: 'enableRatingsCheck', key: 'enableRatings' }
    ];

    mappings.forEach(m => {
        const el = document.getElementById(m.id);
        if (el) el.checked = localSettingsObj[m.key] || false;
    });

    // Dark Mode Specific
    const dmCheck = document.getElementById('darkModeCheck');
    if (dmCheck) {
        const currentTheme = localStorage.getItem('theme') || 'light';
        dmCheck.checked = (currentTheme === 'dark');
    }
}

function renderBackupsUI(backups) {
    const container = document.getElementById('backupContainer');
    if (!container) return;
    if (backups.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding:15px; font-size:12px;">No automatic backups available yet.</p>';
        return;
    }
    const sortedBackups = [...backups].reverse();
    const ICONS_BOX = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';
    const ICONS_RESTORE = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ICONS_DOWNLOAD = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ICONS_TRASH = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    container.innerHTML = sortedBackups.map((backup, displayIndex) => {
        const originalIndex = backups.length - 1 - displayIndex;
        const displayTitle = backup.label ? `Auto-Backup: ${backup.label}` : `Backup #${backups.length - displayIndex}`;
        
        const safeTitle = escapeHTML(displayTitle); // Maskiere Backup-Label
        const safeTime = escapeHTML(backup.readableTime); // Maskiere Zeitstempel
        const safeCount = parseInt(backup.count, 10) || 0;
        const safeClosed = parseInt(backup.tabsClosed, 10) || 0;

        return `
          <div class="backup-item">
            <div style="display:flex; flex-direction:column; overflow:hidden; text-align: left;">
              <strong style="color:var(--primary); display:flex; align-items:center; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeTitle}">
                ${ICONS_BOX} ${safeTitle}
              </strong>
              <span style="font-size:11px; color:var(--text-muted); margin-left: 22px;">${safeTime}</span>
              <span style="font-size:11px; color:var(--text-muted); margin-left: 22px;">${safeCount} links saved, ${safeClosed} closed</span>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button class="btn btn-secondary btn-sm" data-backup-index="${originalIndex}" title="Restore">${ICONS_RESTORE}</button>
              <button class="btn btn-secondary btn-sm" data-download-backup-index="${originalIndex}" title="Download JSON">${ICONS_DOWNLOAD}</button>
              <button class="btn btn-danger btn-sm" data-delete-backup-index="${originalIndex}" title="Delete">${ICONS_TRASH}</button>
            </div>
          </div>
        `;
    }).join('');
}

function initSettingsLogic() {
    const viewContainer = document.getElementById('settingsViewContainer');
    if (!viewContainer) return;

    // A. ADD WHITELIST DOMAIN
    const addWhitelistDomain = async () => {
        const input = document.getElementById('whitelistInput');
        if (!input) return;
        const domain = input.value.trim();
        if (!domain) {
            updateSettingsSaveStatus('Please enter a domain!', 'error');
            return;
        }
        let cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        if (!cleanDomain.includes('.')) {
            updateSettingsSaveStatus('Invalid domain! Example: gmail.com', 'error');
            return;
        }

        if (!settingsWhitelist.includes(cleanDomain)) {
            settingsWhitelist.push(cleanDomain);
            await saveWhitelist(settingsWhitelist);
            renderWhitelistUI();
            input.value = '';
            updateSettingsSaveStatus('Domain added!');
        } else {
            updateSettingsSaveStatus('Domain already exists!', 'error');
        }
    };

    document.getElementById('addWhitelistBtn')?.addEventListener('click', addWhitelistDomain);
    document.getElementById('whitelistInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addWhitelistDomain();
    });

    // B. DELETE WHITELIST DOMAIN
    document.getElementById('whitelistContainer')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-delete-whitelist');
        if (btn) {
            const index = parseInt(btn.dataset.index);
            settingsWhitelist.splice(index, 1);
            await saveWhitelist(settingsWhitelist);
            renderWhitelistUI();
            updateSettingsSaveStatus('Domain removed!');
        }
    });

    // C. THEME TOGGLE SYNC
    document.getElementById('darkModeCheck')?.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    });

    // D. SAVE BUTTON
    document.getElementById('saveBtn')?.addEventListener('click', async () => {
        try {
            let keepTabs = parseInt(document.getElementById('keepTabsInput').value);
            if (isNaN(keepTabs) || keepTabs < 1) keepTabs = 1;
            if (keepTabs > 20) keepTabs = 20;

            localSettingsObj.keepLastTabs = keepTabs;
            localSettingsObj.autoBackup = document.getElementById('autoBackupCheck').checked;
            localSettingsObj.confirmBeforeClose = document.getElementById('confirmCheck').checked;
            localSettingsObj.deleteAfterRestore = document.getElementById('deleteAfterRestoreCheck').checked;
            localSettingsObj.cleanAllWorkspaces = document.getElementById('cleanAllWorkspacesCheck').checked;
            localSettingsObj.sessionsDefaultCollapsed = document.getElementById('sessionsDefaultCollapsedCheck').checked;
            localSettingsObj.smartImport = document.getElementById('smartImportCheck').checked;
            localSettingsObj.enableRatings = document.getElementById('enableRatingsCheck').checked;

            await saveSettings(localSettingsObj);
            updateSettingsSaveStatus("Settings saved!", "success");
        } catch (err) {
            updateSettingsSaveStatus("Error saving!", "error");
        }
    });

    // E. BACKUP ACCORDION CLICK ACTIONS
    document.getElementById('backupContainer')?.addEventListener('click', async (e) => {
        const restoreBtn = e.target.closest('[data-backup-index]');
        const downloadBtn = e.target.closest('[data-download-backup-index]');
        const deleteBtn = e.target.closest('[data-delete-backup-index]');

        if (restoreBtn) {
            const index = parseInt(restoreBtn.dataset.backupIndex);
            const backups = await getBackups();
            const currentLinks = await getLinks();
            const backup = backups[index];

            const choice = await showCustomModal(
                "Restore Backup?",
                `Restore ${backup.count} links from ${backup.readableTime}?\nThis will append them to your dashboard list.`,
                [
                    { text: "Cancel", value: false, class: "btn-modal-cancel" },
                    { text: "Restore Backup", value: true, class: "btn-modal-confirm" }
                ]
            );

            if (choice) {
                const timestamp = new Date().toISOString();
                
                // --- STRUKTURTREUES BACKUP-MAPPING START (Kachel-Erhalt) ---
                const importTimestampSuffix = Date.now();
                const sessionIdMap = {}; // Maps old sessionID -> new unique restored sessionID

                const restoredLinks = backup.data.links.map(link => {
                    const oldSessionId = link.sessionId || 'unknown';
                    
                    // Erzeuge eine neue, kollisionsfreie Session-ID unter Beibehaltung der Trennung!
                    if (!sessionIdMap[oldSessionId]) {
                        sessionIdMap[oldSessionId] = `${oldSessionId}-restored-${importTimestampSuffix}`;
                    }

                    // Säubere das Label von alten Tab-Zählern und hänge ein edles (Restored) an
                    const cleanLabel = (link.sessionLabel || "Restored Session")
                        .replace(/^📅\s*/, '')
                        .replace(/\s*\(\d+\s+Tabs\)$/, '');
                    
                    const finalLabel = cleanLabel.includes('(Restored)') ? cleanLabel : `${cleanLabel} (Restored)`;

                    return {
                        ...link,
                        originalTimestamp: link.timestamp,
                        sessionId: sessionIdMap[oldSessionId], // Erhält die Kachel-Trennung!
                        sessionLabel: finalLabel,               // Erhält den Namen!
                        uniqueId: `${link.url}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                        restoredAt: timestamp,
                        timestamp: timestamp
                    };
                });
                // --- STRUKTURTREUES BACKUP-MAPPING ENDE ---

                // Robust: Fetch fresh state after the async showCustomModal to prevent concurrent action overrides
                const freshCurrentLinks = await getLinks();
                const allLinks = [...restoredLinks, ...freshCurrentLinks];
                await saveLinks(allLinks);
                updateSettingsSaveStatus('Backup restored!', 'success');
                loadSettingsViewData();
            }
        }

        if (downloadBtn) {
            const index = parseInt(downloadBtn.dataset.downloadBackupIndex);
            const backups = await getBackups();
            const backup = backups[index];
            const timestamp = new Date(backup.timestamp).toISOString().slice(0, 10);
            const dataStr = JSON.stringify(backup.data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leantabs-backup-${timestamp}.json`;
            a.click();
            URL.revokeObjectURL(url);
            updateSettingsSaveStatus('Downloaded!', 'success');
        }

        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.deleteBackupIndex);
            const backupList = await getBackups();

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
                await saveBackups(backupList);
                loadSettingsViewData();
                updateSettingsSaveStatus('Backup deleted!', 'success');
            }
        }
    });

    // F. DATA SYSTEM ACTIONS (FULL BACKUP / SMART IMPORT)
    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
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
        updateSettingsSaveStatus('Export complete!', 'success');
    });

    const fileInput = document.getElementById('importFileInput');
    document.getElementById('importDataBtn')?.addEventListener('click', () => {
        fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON format');
            }

            if (typeof data !== 'object' || data === null) {
                throw new Error('Imported file is not a valid JSON object.');
            }

            // A. CONFIG IMPORT LOGIC (Settings & Whitelist)
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
                        localSettingsObj = data.settings;
                        await saveSettings(data.settings);
                    }
                    if (data.whitelist) {
                        settingsWhitelist = data.whitelist;
                        await saveWhitelist(data.whitelist);
                    }
                    updateSettingsSaveStatus("Settings & Whitelist restored!");
                }
            }

            // B. LINKS IMPORT LOGIC (Duplicate checking + re-indexing)
            let rawLinks = [];
            if (data.links && Array.isArray(data.links)) {
                rawLinks = data.links;
            } else if (data.savedLinks && Array.isArray(data.savedLinks)) {
                rawLinks = data.savedLinks;
            } else if (Array.isArray(data)) {
                rawLinks = data;
            }

            // --- SCHEMAKONTROLLE & SANITIZING (APPSEC-GUARD) ---
            const linksToImport = sanitizeAndValidateImportedLinks(rawLinks);

            if (linksToImport.length === 0) {
                if (data.settings || data.whitelist) {
                    loadSettingsViewData();
                    return;
                }
                updateSettingsSaveStatus('No valid links found!', 'error');
                return;
            }

            const currentLinks = await getLinks();
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
                const useSmartImport = (localSettingsObj.smartImport !== false);
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
                            `Found ${linksToImport.length} links.\n${duplicateLinks.length} duplicates.\n${cleanLinks.length} unique.\n\nProceed?`,
                            [
                                { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                                { text: "Import All", value: "all", class: "btn-modal-secondary" },
                                { text: `Import ${cleanLinks.length} Unique`, value: "filter", class: "btn-modal-confirm" }
                            ]
                        );
                        if (choice === 'filter') finalImportList = cleanLinks;
                        else if (choice === 'all') finalImportList = linksToImport;
                        if (choice !== 'cancel') shouldImport = true;
                    } else {
                        const confirmUnique = await showCustomModal(
                            "Confirm Import",
                            `Import ${linksToImport.length} links?`,
                            [
                                { text: "Cancel", value: "cancel", class: "btn-modal-cancel" },
                                { text: "Import", value: "all", class: "btn-modal-confirm" }
                            ]
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
                    const importTimestampSuffix = Date.now();
                    const sessionIdMap = {};
                    preparedLinks = finalImportList.map(link => {
                        const oldSessionId = link.sessionId || 'unknown';
                        if (!sessionIdMap[oldSessionId]) {
                            sessionIdMap[oldSessionId] = `${oldSessionId}-imported-${importTimestampSuffix}`;
                        }
                        return {
                            ...link,
                            sessionId: sessionIdMap[oldSessionId],
                            uniqueId: `${link.url}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                            importedAt: timestamp
                        };
                    });
                    updateSettingsSaveStatus(`Restored ${preparedLinks.length} links & sessions!`, 'success');
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
                    updateSettingsSaveStatus(`Imported ${preparedLinks.length} links!`, 'success');
                }

                const freshCurrentLinks = await getLinks();
                const allLinks = [...preparedLinks, ...freshCurrentLinks];
                await saveLinks(allLinks);
            } else if (shouldImport && finalImportList.length === 0) {
                updateSettingsSaveStatus('No links selected to import.', 'error');
            }

            loadSettingsViewData();
        } catch (err) {
            updateSettingsSaveStatus('Import error!', 'error');
            console.error("Import error:", err);
        }
        e.target.value = '';
    });

    // --- NEUE EVENT-LISTENER FÜR SHORTCUTS ---
    document.getElementById('shortcutsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    checkShortcuts(); // Führe Diagnose beim Laden der Settings aus
}

// --- HELPER: CHECK BROWSER SHORTCUTS DIAGNOSTIC ---
function checkShortcuts() {
  if (chrome.commands && chrome.commands.getAll) {
    chrome.commands.getAll((commands) => {
      const missingShortcuts = commands.filter(cmd => !cmd.shortcut);
      if (missingShortcuts.length > 0) {
        const tipDesc = document.querySelector('.tip-desc');
        if (tipDesc) {
          tipDesc.innerHTML = `Note: If these shortcuts aren't working, your browser might not have assigned them automatically. You can check and configure them in your browser's <a href="#" id="shortcutsLink" style="color:var(--primary); text-decoration:underline; font-weight:bold; cursor:pointer;">extension settings</a>.`;
          document.getElementById('shortcutsLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
          });
        }
      }
    });
  }
}

// --- SIDEBAR THEME TOGGLE LOGIC (Synchronized SVGs) ---
function initSidebarThemeToggle() {
    const themeBtn = document.getElementById('sidebarThemeToggleBtn');
    const themeText = document.getElementById('sidebarThemeText');
    const dmCheck = document.getElementById('darkModeCheck');
    
    if (themeBtn && themeText) {
        // EXAKT dieselben SVG-Pfade wie im Popup zur Wahrung der visuellen Konsistenz
        const sunIcon = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>';
        const moonIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

        const updateThemeLabel = (isDark) => {
            // Tauscht das innere HTML (SVG) und den Text dynamisch aus
            themeBtn.innerHTML = (isDark ? sunIcon : moonIcon) + ` <span id="sidebarThemeText">${isDark ? "Light Mode" : "Dark Mode"}</span>`;
            themeBtn.title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
        };
        
        const currentTheme = localStorage.getItem('theme') || 'light';
        updateThemeLabel(currentTheme === 'dark');

        themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeLabel(newTheme === 'dark');
            
            if (dmCheck) {
                dmCheck.checked = (newTheme === 'dark');
            }
            
            const saveStatus = document.getElementById('saveStatus');
            if (saveStatus) {
                saveStatus.textContent = "Theme updated!";
                saveStatus.style.color = "var(--success)";
                setTimeout(() => saveStatus.textContent = "", 1500);
            }
        });

        // Sync check changes to sidebar button text
        if (dmCheck) {
            dmCheck.addEventListener('change', (e) => {
                updateThemeLabel(e.target.checked);
            });
        }
    }
}

// --- HELPER: SUBMIT FEEDBACK TO GOOGLE APPS SCRIPT WEBHOOK ---
// Uses text/plain to completely bypass CORS preflight requests for high speed
async function submitFeedback(formData) {
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbz8HslKS6wgyOqrpVtE33WyYVHRO9iBNEmj6mRe5Jb_b3Gk6vLjCidYKCpVz8RbJsuZ/exec";

  const payload = {
    type: formData.type || 'Question',
    message: formData.message,
    email: formData.email || 'Anonymous',
    version: chrome.runtime?.getManifest()?.version || '1.1.5',
    os: window.navigator.platform,
    browser: "Chromium" // Einheitliche Plattform-Kennung
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      redirect: "follow", // Wichtig: Apps Script nutzt 302-Weiterleitungen
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return data.status === "success";
  } catch (error) {
    console.error("[LeanTabs] Feedback submission failed:", error);
    return false;
  }
}

// --- DIRECT FEEDBACK PIPELINE (LEANPROMPTS PARITY) ---
function initFeedbackModal() {
    const feedbackModal = document.getElementById('feedbackModal');
    const cancelBtn = document.getElementById('feedbackCancelBtn');
    const closeBtn = document.getElementById('feedbackCloseBtn');
    const sendBtn = document.getElementById('feedbackSendBtn');
    const messageInput = document.getElementById('feedbackMessage');
    const emailInput = document.getElementById('feedbackEmail');
    const statusEl = document.getElementById('feedbackStatus');
    const typeButtons = document.querySelectorAll('.feedback-type-btn');

    let activeFeedbackType = 'Question';
    const placeholders = {
        'Question': "Got a question or stuck on something? Type it here and I'll jump in to help!",
        'Bug': "Oops, did something break? Tell me what happened so I can squish that bug for you!",
        'Feature': "Have a brilliant idea for a new feature? I'd love to hear how I can make LeanTabs even more powerful for you!"
    };

    // Binde das Öffnen an das "Feedback & Support"-Link-Ereignis im Footer der Sidebar
    const supportLink = document.getElementById('nav-support-btn'); // Direkt über die unmissverständliche ID!
    if (supportLink) {
        supportLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            feedbackModal?.classList.remove('hidden');
            messageInput?.focus();
        });
    }

    // Typen-Switcher Logik (Mit dynamischem Platzhalter-Wechsel)
    typeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            typeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFeedbackType = btn.dataset.type;
            if (messageInput) {
                messageInput.placeholder = placeholders[activeFeedbackType];
            }
        });
    });

    const cleanup = () => {
        feedbackModal?.classList.add('hidden');
        if (messageInput) messageInput.value = '';
        if (emailInput) emailInput.value = '';
        if (statusEl) statusEl.style.display = 'none';
        // Zurücksetzen auf Standard-Tab 'Question'
        typeButtons.forEach(b => b.classList.remove('active'));
        typeButtons[0]?.classList.add('active');
        activeFeedbackType = 'Question';
        if (messageInput) messageInput.placeholder = placeholders['Question'];
    };

    cancelBtn?.addEventListener('click', cleanup);
    closeBtn?.addEventListener('click', cleanup);

    // --- VIRALE SOCIAL MEDIA SHARING PIPELINE (Inklusive & Webstore-Targeting) ---
    const shareX = document.getElementById('shareXBtn');
    const shareLinkedin = document.getElementById('shareLinkedinBtn');

    const textX = "My browser just lost 4GB of RAM-clutter. If you use any Chromium-based browser (Chrome, Edge, Brave, Opera, Vivaldi, Arc...) daily, you know the pain of 50 open tabs. I found the perfect local-first cure: LeanTabs. It instantly converts open tabs into organized session links. 100% private. Free. Reclaim your focus!\nhttps://chromewebstore.google.com/detail/leantabs-smart-tab-manage/pkihcnafoidoclfhhiaikgcnpanfddko";
    
    const textLinkedin = "If you use any Chromium-based browser (Chrome, Edge, Brave, Opera, Vivaldi, Arc...) daily, you know the pain: 50 open tabs eating your RAM, slowing your computer, and cluttering your focus.\n\nI just found the perfect local-first cure: LeanTabs.\n\nIt’s a browser extension that instantly converts open tabs into organized lists of links. No cloud, 100% private, and completely free. Reclaim your RAM and own your data!\n\nCheck out the extension here:\nhttps://chromewebstore.google.com/detail/leantabs-smart-tab-manage/pkihcnafoidoclfhhiaikgcnpanfddko";

    shareX?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(textX)}`, '_blank');
    });

    shareLinkedin?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(textLinkedin)}`, '_blank');
    });
    
    // Close modal when clicking outside content
    feedbackModal?.addEventListener('click', (e) => {
        if (e.target === feedbackModal) {
            cleanup();
        }
    });

    sendBtn?.addEventListener('click', async () => {
        const message = messageInput?.value.trim();
        const email = emailInput?.value.trim() || "Anonymous";
        
        // --- APPSEC-GUARD VALIDATION ---
        const validation = validateAndRateLimitFeedback(activeFeedbackType, message, email);
        if (!validation.valid) {
            if (statusEl) {
                statusEl.textContent = validation.error;
                statusEl.style.color = "var(--danger)";
                statusEl.style.display = "block";
            }
            return;
        }

        if (statusEl) {
            statusEl.textContent = "Sending message...";
            statusEl.style.color = "var(--primary)";
            statusEl.style.display = "block";
        }

        const success = await submitFeedback({
            type: activeFeedbackType,
            message: message,
            email: email
        });

        if (success) {
            // Set rate-limit timestamp upon successful execution
            localStorage.setItem('last_feedback_timestamp', Date.now().toString());
            if (statusEl) {
                statusEl.textContent = "Thank you! Message sent.";
                statusEl.style.color = "var(--success)";
            }
            setTimeout(cleanup, 2000);
        } else {
            if (statusEl) {
                statusEl.textContent = "Server busy. Please try again later.";
                statusEl.style.color = "var(--danger)";
            }
        }
    });

    // BROWSER-ADAPTIVE WEBSTORE BEWERTUNG
    const rateBtn = document.getElementById('feedbackRateBtn');
    if (rateBtn) {
        rateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ua = window.navigator.userAgent;
            const isOpera = ua.includes("Opera") || ua.includes("OPR/");
            
            const CHROME_URL = 'https://chromewebstore.google.com/detail/leantabs-smart-tab-manage/pkihcnafoidoclfhhiaikgcnpanfddko';
            const OPERA_URL = 'https://addons.opera.com/de/extensions/details/leantabs-smart-tab-workspace-manager/';
            
            chrome.tabs.create({ url: isOpera ? OPERA_URL : CHROME_URL });
        });
    }
}

// Robust, isolated system-tab checker inside saved-links.js
const isSystemTab = (url) => {
    if (!url) return true;
    if (url.startsWith(chrome.runtime.getURL(''))) return true;
    return url.startsWith('chrome://') ||
           url.startsWith('edge://') ||
           url.startsWith('opera://') ||
           url.startsWith('vivaldi://') ||
           url.startsWith('brave://') ||
           url.startsWith('about:') ||
           url === 'about:blank';
};

// --- HELPER: EXECUTE CONTEXTUAL RESTORE ACTION WITH NATIVE GROUP SERIALIZATION ---
async function executeRestoreAction(action, sessionLinks, linksByWindow, windowIds) {
    // 1. Inkrementiere den Open-Count im Speicher
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
    let oldTabsIds = [];

    // 2. Vorbereitung für den "Replace"-Modus & Auto-Save
    if (action === 'replace' || action === 'discard_replace' || action === 'save_replace') {
        const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
        const activeTab = currentWindowTabs.find(t => t.active);
        let targetWindowTabs = currentWindowTabs;
        if (activeTab && activeTab.workspaceId !== undefined) {
            targetWindowTabs = currentWindowTabs.filter(t => t.workspaceId === activeTab.workspaceId);
        }
        oldTabsIds = targetWindowTabs.map(t => t.id);

        if (action === 'save_replace') {
            try {
                const tabsToSave = targetWindowTabs.filter(tab => !isSystemTab(tab.url) && !tab.pinned);

                if (tabsToSave.length > 0) {
                    const timestamp = new Date().toISOString();
                    const dateGroup = new Date().toLocaleDateString('en-US');
                    const backupSessionId = `replace-recovery-${Date.now()}`;
                    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                    const savedStates = tabsToSave.map(tab => {
                        let domain = "Other";
                        try { domain = new URL(tab.url).hostname.replace(/^www\./, ''); } catch(e){}
                        return {
                            url: tab.url,
                            title: tab.title || tab.url,
                            timestamp: timestamp,
                            dateGroup: dateGroup,
                            category: extractDomain(tab.url),
                            favicon: (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome-extension://')) ? tab.favIconUrl : `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                            sessionId: backupSessionId,
                            sessionLabel: `Auto-Save (before Replace - ${timeStr})`,
                            uniqueId: `${tab.url}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`
                        };
                    });

                    // Fresh state read to prevent concurrency issues (Double-Read Pattern)
                    const freshLinks = await getLinks();
                    await saveLinks([...savedStates, ...freshLinks]);
                }
            } catch (err) {
                console.error("Defensive auto-save failed, replacing tabs anyway:", err);
            }
        }
    }

    // 3. Physikalische Ausführung der gewählten Aktion
    if (action === 'restore_structure') {
        // FENSTERSTRUKTUR WIEDERHERSTELLEN: Jedes ursprüngliche Fenster wird separat geöffnet
        for (const wId of windowIds) {
            const urls = linksByWindow[wId];
            if (urls.length > 0) {
                try {
                    const newWindow = await chrome.windows.create({ url: urls });
                    
                    // Native Gruppen-Bündelung im neu erzeugten Fenster
                    if (newWindow && newWindow.id) {
                        const tabsInNewWindow = await chrome.tabs.query({ windowId: newWindow.id });
                        const windowTabsByGroup = {};
                        const windowGroupMetadata = {};

                        for (const tab of tabsInNewWindow) {
                            const matchedLink = sessionLinks.find(l => normalizeUrlForComparison(l.url) === normalizeUrlForComparison(tab.url));
                            if (matchedLink && matchedLink.groupOriginalId !== undefined && matchedLink.groupOriginalId !== null && matchedLink.groupTitle) {
                                const gId = matchedLink.groupOriginalId;
                                if (!windowTabsByGroup[gId]) {
                                    windowTabsByGroup[gId] = [];
                                    windowGroupMetadata[gId] = { title: matchedLink.groupTitle, color: matchedLink.groupColor };
                                }
                                windowTabsByGroup[gId].push(tab.id);
                            }
                        }

                        for (const [gId, tabIds] of Object.entries(windowTabsByGroup)) {
                            if (tabIds.length > 0) {
                                try {
                                    const newGroupId = await chrome.tabs.group({ tabIds });
                                    const meta = windowGroupMetadata[gId];
                                    if (meta && chrome.tabGroups) {
                                        await chrome.tabGroups.update(newGroupId, { title: meta.title, color: meta.color });
                                    }
                                } catch (e) { /* ignore */ }
                            }
                        }
                    }
                } catch (e) {
                    // Fallback auf aktives Fenster bei Browser-Sperren
                    for (const url of urls) await chrome.tabs.create({ url, active: false });
                }
            }
        }
    } 
    else if (action === 'new_window') {
        // IN NEUEM FENSTER ÖFFNEN: Alle Links in einem einzigen neuen Fenster öffnen
        try {
            const urls = sessionLinks.map(l => l.url);
            const newWindow = await chrome.windows.create({ url: urls });
            
            if (newWindow && newWindow.id) {
                const tabsInNewWindow = await chrome.tabs.query({ windowId: newWindow.id });
                const windowTabsByGroup = {};
                const windowGroupMetadata = {};

                for (const tab of tabsInNewWindow) {
                    const matchedLink = sessionLinks.find(l => normalizeUrlForComparison(l.url) === normalizeUrlForComparison(tab.url));
                    if (matchedLink && matchedLink.groupOriginalId !== undefined && matchedLink.groupOriginalId !== null && matchedLink.groupTitle) {
                        const gId = matchedLink.groupOriginalId;
                        if (!windowTabsByGroup[gId]) {
                            windowTabsByGroup[gId] = [];
                            windowGroupMetadata[gId] = { title: matchedLink.groupTitle, color: matchedLink.groupColor };
                        }
                        windowTabsByGroup[gId].push(tab.id);
                    }
                }

                for (const [gId, tabIds] of Object.entries(windowTabsByGroup)) {
                    if (tabIds.length > 0) {
                        try {
                            const newGroupId = await chrome.tabs.group({ tabIds });
                            const meta = windowGroupMetadata[gId];
                            if (meta && chrome.tabGroups) {
                                await chrome.tabGroups.update(newGroupId, { title: meta.title, color: meta.color });
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            }
        } catch (e) {
            for (const link of sessionLinks) await chrome.tabs.create({ url: link.url, active: false });
        }
    } 
    else {
        // STANDARD APPEND & REPLACE: In aktuellem Fenster/Workspace öffnen
        const createdTabsByGroup = {};
        const groupMetadata = {};

        for (const link of sessionLinks) {
            try {
                const createdTab = await chrome.tabs.create({ url: link.url, active: false });
                
                if (link.groupOriginalId !== undefined && link.groupOriginalId !== null && link.groupTitle) {
                    const gId = link.groupOriginalId;
                    if (!createdTabsByGroup[gId]) {
                        createdTabsByGroup[gId] = [];
                        groupMetadata[gId] = { title: link.groupTitle, color: link.groupColor };
                    }
                    createdTabsByGroup[gId].push(createdTab.id);
                }
            } catch (tabCreateError) {
                console.error("Failed to restore single tab:", tabCreateError);
            }
        }

        for (const [gId, tabIds] of Object.entries(createdTabsByGroup)) {
            if (tabIds.length > 0) {
                try {
                    const newGroupId = await chrome.tabs.group({ tabIds });
                    const meta = groupMetadata[gId];
                    if (meta && chrome.tabGroups) {
                        await chrome.tabGroups.update(newGroupId, { title: meta.title, color: meta.color });
                    }
                } catch (groupError) {
                    console.log("Tab grouping failed on restored window:", groupError.message);
                }
            }
        }
    }

    // 4. Alte Tabs bei "Replace" schließen
    if ((action === 'replace' || action === 'discard_replace' || action === 'save_replace') && oldTabsIds.length > 0) {
        await chrome.tabs.remove(oldTabsIds);
    }

    // 5. Auto-Delete nach Restore (falls in Settings aktiv)
    if (settings.deleteAfterRestore && sessionLinks.length > 0) {
        // Wir holen die Session ID des ersten Links für die Löschung
        const sId = sessionLinks[0].sessionId || `${sessionLinks[0].dateGroup}-${sessionLinks[0].timestamp}`;
        await deleteSession(sId);
    }
    
    await loadLinks(); // UI Update
}

// 3. INITIALIZE BOTH VIEW ROUTER & SETTINGS LOGIC
initViewNavigation();
initSettingsLogic();
initSidebarThemeToggle();
initFeedbackModal();

// --- END OF saved-links.js ---