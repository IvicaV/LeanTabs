/**
 * Ratings module for LeanTabs.
 * Adds rating field (1-3 stars) to link objects and stores them in chrome.storage.local.
 */

import { getLinks, saveLinks } from './storage.js';

/**
 * Helper to check if a link matches a given link ID (handles uniqueId and url-timestamp keys).
 * @param {Object} link - The link object.
 * @param {string} linkId - The link ID to match.
 * @returns {boolean} True if the link matches.
 */
function isMatchingLink(link, linkId) {
  if (link.uniqueId === linkId) return true;
  
  const key1 = `${link.url}-${link.originalTimestamp || link.timestamp}`;
  const key2 = `${link.url}-${link.timestamp}`;
  return key1 === linkId || key2 === linkId;
}

/**
 * Gets the rating of a link by its ID.
 * @param {string} linkId - The ID of the link.
 * @returns {Promise<number|null>} A promise that resolves to the rating (1-3) or null if not rated or not found.
 */
export async function getRating(linkId) {
  const allLinks = await getLinks();
  const link = allLinks.find(l => isMatchingLink(l, linkId));
  return link && link.rating !== undefined ? link.rating : null;
}

/**
 * Sets the rating (1-3 stars) of a link by its ID.
 * Stores ratings alongside links in chrome.storage.local.
 * @param {string} linkId - The ID of the link.
 * @param {number} rating - The rating value (must be 1, 2, or 3).
 * @returns {Promise<void>}
 */
export async function setRating(linkId, rating) {
  if (rating !== 0 && rating !== 1 && rating !== 2 && rating !== 3) {
    throw new Error('Rating must be between 0 and 3 stars');
  }
  
  const allLinks = await getLinks();
  const link = allLinks.find(l => isMatchingLink(l, linkId));
  if (link) {
    link.rating = rating;
    await saveLinks(allLinks);
  } else {
    throw new Error(`Link with ID ${linkId} not found`);
  }
}
