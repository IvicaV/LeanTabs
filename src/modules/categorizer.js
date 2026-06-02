/**
 * Categorizer module for LeanTabs.
 * Provides pure, side-effect-free functions for auto-categorizing domains.
 */

/**
 * Extracts a category name (domain label) from a URL.
 * Maps common hostnames to reader-friendly category names,
 * and formats fallback hostnames by capitalising the first letter.
 * 
 * @param {string} url - The URL to extract the domain from.
 * @returns {string} The resolved category label.
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const domainMap = {
      'youtube.com': 'YouTube',
      'github.com': 'GitHub',
      'stackoverflow.com': 'Stack Overflow',
      'reddit.com': 'Reddit',
      'twitter.com': 'Twitter',
      'linkedin.com': 'LinkedIn',
      'facebook.com': 'Facebook',
      'amazon.de': 'Amazon',
      'amazon.com': 'Amazon',
      'wikipedia.org': 'Wikipedia',
      'google.com': 'Google',
      'gmail.com': 'Gmail',
      'docs.google.com': 'Google Docs',
      'drive.google.com': 'Google Drive'
    };
    if (domainMap[hostname]) return domainMap[hostname];
    const withoutWww = hostname.replace(/^www\./, '');
    if (domainMap[withoutWww]) return domainMap[withoutWww];
    const parts = withoutWww.split('.');
    if (parts.length >= 2) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return 'Other';
  } catch {
    return 'Other';
  }
}
