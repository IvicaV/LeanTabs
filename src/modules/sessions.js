/**
 * Sessions module for LeanTabs.
 * Encapsulates session creation, deletion, and updates logic.
 */

import { getLinks, saveLinks } from './storage.js';

/**
 * Deletes all links belonging to a specific session.
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionId) {
  const allLinks = await getLinks();
  const sessionLinks = allLinks.filter(link => {
    const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
    return linkSessionId === sessionId;
  });
  const isLocked = sessionLinks.some(link => link.isLocked);
  if (isLocked) {
    return; // Do not delete locked sessions
  }
  const updatedLinks = allLinks.filter(link => {
    const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
    return linkSessionId !== sessionId;
  });
  await saveLinks(updatedLinks);
}

/**
 * Updates the label of a specific session.
 * @param {string} sessionId - The ID of the session to rename.
 * @param {string} newLabel - The new label for the session.
 * @returns {Promise<void>}
 */
export async function renameSession(sessionId, newLabel) {
  const allLinks = await getLinks();
  allLinks.forEach(link => {
    const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
    if (linkSessionId === sessionId) {
      link.sessionLabel = newLabel;
    }
  });
  await saveLinks(allLinks);
}

/**
 * Toggles the pinned status of a session.
 * @param {string} sessionId - The ID of the session to toggle.
 * @returns {Promise<boolean>} The new pinned status.
 */
export async function togglePinSession(sessionId) {
  const allLinks = await getLinks();
  const sessionLinks = allLinks.filter(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === sessionId);
  if (sessionLinks.length > 0) {
    const newStatus = !(sessionLinks[0].isPinned || false);
    allLinks.forEach(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      if (linkSessionId === sessionId) {
        link.isPinned = newStatus;
      }
    });
    await saveLinks(allLinks);
    return newStatus;
  }
  return false;
}

/**
 * Bumps a session to the top of the list by updating its timestamp and dateGroup to now.
 * @param {string} sessionId - The ID of the session to bump.
 * @returns {Promise<void>}
 */
export async function bumpSession(sessionId) {
  const allLinks = await getLinks();
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
    await saveLinks(allLinks);
  }
}


/**
 * Toggles the locked status for a session. Returns the new status.
 */
export async function toggleLockSession(sessionId) {
  const allLinks = await getLinks();
  const sessionLinks = allLinks.filter(l => (l.sessionId || `${l.dateGroup}-${l.timestamp}`) === sessionId);
  if (sessionLinks.length > 0) {
    const newStatus = !(sessionLinks[0].isLocked || false);
    allLinks.forEach(link => {
      const linkSessionId = link.sessionId || `${link.dateGroup}-${link.timestamp}`;
      if (linkSessionId === sessionId) {
        link.isLocked = newStatus;
      }
    });
    await saveLinks(allLinks);
    return newStatus;
  }
  return false;
}
