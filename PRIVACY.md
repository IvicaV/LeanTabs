# Privacy Policy for LeanTabs

**Last Updated: June 2026**

I take your privacy seriously. This policy explains how LeanTabs handles your data. The core philosophy of LeanTabs is **Local-First**: your intellectual property (your saved sessions, links, and workspace structures) belongs to you and stays on your device.

## 1. Data Storage (Local-First)
LeanTabs is designed to operate locally. All saved links, session groups, whitelists, settings, and automatic backup histories are stored exclusively in your browser's secure local extension storage (`chrome.storage.local`). 
- **No Cloud Sync:** I do not provide a cloud synchronization service.
- **No Access:** I have no technical means to access, read, or store your saved links or sessions. 
- **Encryption:** Your data is as secure as your local browser profile.

## 2. Feedback and Support Function
When you use the optional "Feedback & Support" feature within the extension, certain data is sent to me so I can improve the tool and respond to your requests.

### Data Collected via Feedback:
- **Message Content:** The text you type in the feedback field.
- **Feedback Type:** The category you select (Question, Bug, or Feature).
- **Email Address (Optional):** If you provide your email, I will use it solely to reply to your inquiry. You can send feedback anonymously by leaving this field empty.
- **Technical Metadata:** To debug issues, the form automatically includes your browser type, operating system, and the current version of LeanTabs.

### Processing of Feedback Data:
- I use **Google Apps Script** as a backend to receive and organize your feedback.
- I do not sell, rent, or trade your contact information with third parties.
- Feedback data is deleted once the inquiry is resolved or is no longer needed for development purposes.

## 3. Web Analytics and Tracking
LeanTabs does **not** use any analytics frameworks (like Google Analytics), tracking pixels, or cookies to monitor your behavior. I do not track which websites you visit or what you do inside your browser tabs.

## 4. Permissions Usage
LeanTabs requests specific browser permissions to function:
- **storage / unlimitedStorage:** To save your links, sessions, whitelists, and automatic backups locally on your device.
- **tabs:** To securely query, close, and restore your browser tabs during cleaning and session loading.
- **tabGroups:** To save and recreate your custom, colored browser tab groups.
- **contextMenus:** To provide the "Save selection as link" and "Add to Whitelist" shortcuts.
- **host_permissions (<all_urls>):** To safely resolve website titles (when adding links manually) and fetch website favicons in the background.

## 5. Third-Party Websites
The "Tab Restoration" feature interacts with third-party websites (e.g., when you restore a saved session, opening those URLs as active tabs). When you visit these sites, their respective privacy policies apply. 
- *Note:* The extension only connects to the internet when you manually add a link (to fetch the page title) or to load website icons (favicons) via Google's secure favicon service.

## 6. Your Rights
Since I do not store your data on my servers, you have full control over it. You can delete all your data at any time by:
1. Using the "Delete All" functions within the extension settings.
2. Uninstalling the extension (which permanently clears the browser's local storage for the app).

If you have submitted feedback and wish to have your email address deleted from my support logs, please contact me through the feedback form or via my GitHub profile.

## 7. Data Loss and Liability (Local-First Risk)
LeanTabs is a **local-first** application. All your data is stored exclusively in your browser's local storage. 
- **User Responsibility:** You are solely responsible for regular backups of your data. I strongly recommend using the **Export / Backup** function in the settings regularly.
- **Data Loss Risks:** Uninstalling the extension or clearing your browser's "Site Data" / cache will permanently delete all your saved links, sessions, and settings.
- **No Liability:** I am not responsible for any data loss, whether due to extension uninstallation, browser updates, hardware failure, or accidental deletion of browser data.

## Contact
If you have any questions about this policy, please reach out to me via the support function in the extension or through the official GitHub repository.
