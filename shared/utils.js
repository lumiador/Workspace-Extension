/**
 * Utility functions for Firefox Workspaces
 */

/**
 * Generate a unique ID for workspaces
 * @returns {string} A unique identifier
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Simple hash function for comparing snapshots
 * @param {string} str - String to hash
 * @returns {string} Hash value
 */
function quickHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
}

/**
 * Create a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
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

/**
 * Check if a URL should be excluded from workspace storage
 * @param {string} url - URL to check
 * @returns {boolean} True if URL should be excluded
 */
function shouldExcludeUrl(url) {
    if (!url) return true;
    return EXCLUDED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

/**
 * Whether the runtime supports creating/restoring tab groups
 * @returns {boolean}
 */
function supportsTabGroups() {
    return typeof browser.tabs?.group === 'function';
}

/**
 * Whether the runtime supports reading/updating tab group metadata
 * @returns {boolean}
 */
function supportsTabGroupMetadata() {
    return typeof browser.tabGroups?.get === 'function'
        && typeof browser.tabGroups?.update === 'function';
}

/**
 * Create a compact tab descriptor from a browser tab
 * @param {object} tab - Browser tab object
 * @returns {object} Compact tab descriptor {u, t, p, g?}
 */
function createTabDescriptor(tab) {
    const descriptor = {
        u: tab.url
    };
    if (tab.title) {
        // Truncate title to save space
        descriptor.t = tab.title.substring(0, 100);
    }
    if (tab.pinned) {
        descriptor.p = 1;
    }
    // Persist native tab group membership (Firefox 138+)
    if (typeof tab.groupId === 'number' && tab.groupId !== -1) {
        descriptor.g = tab.groupId;
    }
    return descriptor;
}

/**
 * Collect compact metadata for the tab groups referenced by the given tabs
 * @param {Array} tabs - Browser tab objects (pre-filter OK)
 * @returns {Promise<object>} Map of groupId -> {n?, c?, x?}
 */
async function collectGroupMetadata(tabs) {
    const groups = {};
    if (!supportsTabGroupMetadata()) return groups;

    const groupIds = [...new Set(
        tabs
            .map(tab => tab.groupId)
            .filter(id => typeof id === 'number' && id !== -1)
    )];

    for (const groupId of groupIds) {
        try {
            const group = await browser.tabGroups.get(groupId);
            const meta = {};
            if (group.title) {
                meta.n = String(group.title).substring(0, 100);
            }
            if (group.color) {
                meta.c = group.color;
            }
            if (group.collapsed) {
                meta.x = 1;
            }
            groups[String(groupId)] = meta;
        } catch (error) {
            console.warn('Failed to read tab group metadata:', groupId, error);
        }
    }

    return groups;
}

/**
 * Format a timestamp for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}

/**
 * Get the next default workspace name
 * @param {Array} existingWorkspaces - Array of existing workspaces
 * @returns {string} Default name like "Workspace 1", "Workspace 2", etc.
 */
function getDefaultWorkspaceName(existingWorkspaces) {
    const existingNumbers = existingWorkspaces
        .map(ws => {
            const match = ws.name.match(/^Workspace (\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    return `Workspace ${maxNumber + 1}`;
}

/**
 * Get a random color from the palette
 * @returns {string} Hex color code
 */
function getRandomColor() {
    return WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)];
}

/**
 * Get a random emoji from the palette
 * @returns {string} Emoji character
 */
function getRandomEmoji() {
    return WORKSPACE_EMOJIS[Math.floor(Math.random() * WORKSPACE_EMOJIS.length)];
}

/**
 * Stable fallback emoji for workspaces that predate the emoji field
 * @param {string} seed - Workspace id or name
 * @returns {string} Emoji character
 */
function getFallbackEmoji(seed = '') {
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % WORKSPACE_EMOJIS.length;
    return WORKSPACE_EMOJIS[index];
}

/**
 * Resolve the emoji to show for a workspace
 * @param {object} workspace - Workspace metadata
 * @returns {string} Emoji character
 */
function getWorkspaceEmoji(workspace = {}) {
    if (workspace.emoji) return workspace.emoji;
    return getFallbackEmoji(workspace.id || workspace.name || '');
}

/**
 * Apply emoji + color styling to a workspace icon element
 * @param {HTMLElement} el - Icon element
 * @param {object} workspace - Workspace metadata
 */
function applyWorkspaceIcon(el, workspace) {
    if (!el) return;
    el.style.backgroundColor = workspace.color || '#3B82F6';
    el.textContent = getWorkspaceEmoji(workspace);
    el.title = 'Change emoji';
}
