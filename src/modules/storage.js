/**
 * Storage module for LeanTabs.
 * Handles all reads and writes to chrome.storage.local.
 */

let storageWriteQueue = Promise.resolve();

/**
 * Retrieves the saved links from local storage.
 * @returns {Promise<Array>} A promise that resolves to the array of saved links.
 */
export async function getLinks() {
  const data = await chrome.storage.local.get(['savedLinks']);
  return data.savedLinks || [];
}

/**
 * Saves the links to local storage.
 * @param {Array} links - The array of links to save.
 * @returns {Promise<void>}
 */
export async function saveLinks(links) {
  return new Promise((resolve, reject) => {
    storageWriteQueue = storageWriteQueue.then(async () => {
      try {
        await chrome.storage.local.set({ savedLinks: links });
        resolve();
      } catch (err) {
        console.error("LeanTabs Persistent Write Failure:", err);
        reject(err);
      }
    });
  });
}

/**
 * Retrieves the settings from local storage.
 * @returns {Promise<Object>} A promise that resolves to the settings object.
 */
export async function getSettings() {
  const data = await chrome.storage.local.get(['settings']);
  return data.settings || {};
}

/**
 * Saves the settings to local storage.
 * @param {Object} settings - The settings object to save.
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/**
 * Retrieves the whitelist from local storage.
 * @returns {Promise<Array>} A promise that resolves to the whitelist array.
 */
export async function getWhitelist() {
  const data = await chrome.storage.local.get(['whitelist']);
  return data.whitelist || [];
}

/**
 * Saves the whitelist to local storage.
 * @param {Array} whitelist - The whitelist array to save.
 * @returns {Promise<void>}
 */
export async function saveWhitelist(whitelist) {
  await chrome.storage.local.set({ whitelist });
}

/**
 * Retrieves the backups from local storage.
 * @returns {Promise<Array>} A promise that resolves to the backups array.
 */
export async function getBackups() {
  const data = await chrome.storage.local.get(['backups']);
  return data.backups || [];
}

/**
 * Saves the backups to local storage.
 * @param {Array} backups - The backups array to save.
 * @returns {Promise<void>}
 */
export async function saveBackups(backups) {
  return new Promise((resolve, reject) => {
    storageWriteQueue = storageWriteQueue.then(async () => {
      try {
        await chrome.storage.local.set({ backups });
        resolve();
      } catch (err) {
        console.error("LeanTabs Backup Write Failure:", err);
        reject(err);
      }
    });
  });
}
