/**
 * Background script for Firefox Workspaces
 * Manages workspace state, tab listeners, and sync
 */

// In-memory state
let workspaceIndex = [];
let windowBindings = {};
let settings = {};
let saveTimers = {};

// Badge/indicator configuration
const BADGE_MAX_CHARS = 4;

/**
 * Initialize the extension
 */
async function init() {
    console.log('Firefox Workspaces: Initializing...');

    // Load state
    settings = await Storage.getSettings();
    workspaceIndex = await Storage.getWorkspaceIndex();
    windowBindings = await Storage.getWindowBindings();

    // Clean up stale window bindings
    await cleanupStaleBindings();
    await refreshAllWindowIndicators();

    // Set up listeners
    setupTabListeners();
    setupWindowListeners();
    setupStorageListener();
    setupContextMenu();
    setupMessageListener();

    console.log('Firefox Workspaces: Initialized with', workspaceIndex.length, 'workspaces');
}

/**
 * Clean up bindings for windows that no longer exist
 */
async function cleanupStaleBindings() {
    const windows = await browser.windows.getAll();
    const validWindowIds = new Set(windows.map(w => w.id));

    const newBindings = {};
    for (const [windowId, workspaceId] of Object.entries(windowBindings)) {
        if (validWindowIds.has(parseInt(windowId, 10))) {
            newBindings[windowId] = workspaceId;
        }
    }

    windowBindings = newBindings;
    await Storage.saveWindowBindings(windowBindings);
}

/**
 * Set up tab event listeners
 */
function setupTabListeners() {
    browser.tabs.onCreated.addListener(handleTabChange);
    browser.tabs.onRemoved.addListener(handleTabChange);
    browser.tabs.onMoved.addListener(handleTabChange);
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // Only trigger on URL changes
        if (changeInfo.url) {
            handleTabChange({ windowId: tab.windowId });
        }
    });
    browser.tabs.onAttached.addListener((tabId, attachInfo) => {
        handleTabChange({ windowId: attachInfo.newWindowId });
    });
    browser.tabs.onDetached.addListener((tabId, detachInfo) => {
        handleTabChange({ windowId: detachInfo.oldWindowId });
    });
}

/**
 * Handle tab changes - debounced auto-save
 */
function handleTabChange(info) {
    if (!settings.autoSave) return;

    const windowId = info.windowId || info.id;
    const workspaceId = windowBindings[windowId];

    if (!workspaceId) return;

    // Debounce saves per workspace
    if (saveTimers[workspaceId]) {
        clearTimeout(saveTimers[workspaceId]);
    }

    saveTimers[workspaceId] = setTimeout(() => {
        saveWorkspaceSnapshot(workspaceId, windowId);
    }, TIMING.DEBOUNCE_MS);
}

/**
 * Save current window state as workspace snapshot
 */
async function saveWorkspaceSnapshot(workspaceId, windowId) {
    try {
        const tabs = await browser.tabs.query({ windowId: parseInt(windowId, 10) });

        // Filter and convert tabs
        const tabDescriptors = tabs
            .filter(tab => !shouldExcludeUrl(tab.url))
            .filter(tab => settings.includePinnedTabs || !tab.pinned)
            .map(createTabDescriptor);

        // Check if anything changed
        const newHash = quickHash(JSON.stringify(tabDescriptors));
        const lastHash = await Storage.getLastHash(workspaceId);

        if (newHash === lastHash) {
            console.log('Workspace unchanged, skipping save');
            return;
        }

        // Get current version and increment
        const currentVersion = await Storage.getWorkspaceVersion(workspaceId);
        const newVersion = currentVersion + 1;

        // Save tabs
        await Storage.saveWorkspaceTabs(workspaceId, tabDescriptors, newVersion);
        await Storage.saveLastHash(workspaceId, newHash);

        // Update workspace metadata
        const wsIndex = workspaceIndex.findIndex(ws => ws.id === workspaceId);
        if (wsIndex !== -1) {
            workspaceIndex[wsIndex].updatedAt = Date.now();
            workspaceIndex[wsIndex].tabCount = tabDescriptors.length;
            await Storage.saveWorkspaceIndex(workspaceIndex);
        }

        console.log('Saved workspace:', workspaceId, 'with', tabDescriptors.length, 'tabs');
    } catch (error) {
        console.error('Failed to save workspace:', error);
    }
}

/**
 * Set up window event listeners
 */
function setupWindowListeners() {
    browser.windows.onRemoved.addListener(async (windowId) => {
        // Unbind window when closed
        if (windowBindings[windowId]) {
            delete windowBindings[windowId];
            await Storage.saveWindowBindings(windowBindings);
            await updateWindowIndicators(windowId);
        }
    });

    // Notify content scripts when window bindings change
    browser.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName === 'local' && changes[LOCAL_KEYS.WINDOW_BINDINGS]) {
            // Notify all windows that might have changed
            const windows = await browser.windows.getAll();
            for (const win of windows) {
                await notifyContentScripts(win.id);
                await updateWindowIndicators(win.id);
            }
        }
    });
}

/**
 * Set up storage change listener for sync updates
 */
function setupStorageListener() {
    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        // Refresh workspace index if it changed
        if (changes[STORAGE_KEYS.WORKSPACE_INDEX]) {
            workspaceIndex = changes[STORAGE_KEYS.WORKSPACE_INDEX].newValue || [];
            console.log('Workspace index updated from sync');
            updateContextMenu();
            refreshAllWindowIndicators();
        }
    });
}

/**
 * Set up context menu for moving tabs
 */
// Track menu item IDs to cleanup
let menuIds = [];

/**
 * Set up context menu for moving tabs
 */
function setupContextMenu() {
    browser.menus.create({
        id: 'move-to-workspace',
        title: 'Move to Workspace',
        contexts: ['tab']
    });

    browser.menus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId.startsWith('move-to-ws-')) {
            const targetWorkspaceId = info.menuItemId.replace('move-to-ws-', '');
            await moveTabToWorkspace(tab, targetWorkspaceId);
        }
    });

    // Initial build
    updateContextMenu();
}

/**
 * Update context menu items
 */
async function updateContextMenu() {
    // Remove old items
    for (const id of menuIds) {
        try {
            await browser.menus.remove(id);
        } catch (e) {
            // Ignore if already removed
        }
    }
    menuIds = [];

    // Add new items
    for (const ws of workspaceIndex) {
        const id = `move-to-ws-${ws.id}`;
        await browser.menus.create({
            id: id,
            parentId: 'move-to-workspace',
            title: ws.name
        });
        menuIds.push(id);
    }

    // Refresh to ensure UI updates
    if (browser.menus.refresh) {
        await browser.menus.refresh();
    }
}

/**
 * Move a tab to another workspace
 */
async function moveTabToWorkspace(tab, targetWorkspaceId) {
    // Find if target workspace is open
    const targetWindowId = Object.entries(windowBindings)
        .find(([, wsId]) => wsId === targetWorkspaceId)?.[0];

    if (targetWindowId) {
        // Move tab to open window
        await browser.tabs.move(tab.id, {
            windowId: parseInt(targetWindowId, 10),
            index: -1
        });
    } else {
        // Add to workspace snapshot
        const tabs = await Storage.getWorkspaceTabs(targetWorkspaceId);
        tabs.push(createTabDescriptor(tab));
        const version = await Storage.getWorkspaceVersion(targetWorkspaceId);
        await Storage.saveWorkspaceTabs(targetWorkspaceId, tabs, version + 1);

        // Close the tab from current window
        await browser.tabs.remove(tab.id);
    }
}

/**
 * Set up message listener for popup/options communication
 */
function setupMessageListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        handleMessage(message).then(sendResponse);
        return true; // Keep channel open for async response
    });
}

/**
 * Handle messages from popup/options
 */
async function handleMessage(message) {
    switch (message.action) {
        case 'getWorkspaces':
            return { workspaces: workspaceIndex, bindings: windowBindings };

        case 'createWorkspace':
            return await createWorkspace(message.data);

        case 'openWorkspace':
            return await openWorkspace(message.workspaceId);

        case 'deleteWorkspace':
            return await deleteWorkspace(message.workspaceId);

        case 'renameWorkspace':
            return await renameWorkspace(message.workspaceId, message.name);

        case 'togglePin':
            return await toggleWorkspacePin(message.workspaceId);

        case 'getSettings':
            return { settings };

        case 'saveSettings':
            settings = message.settings;
            await Storage.saveSettings(settings);
            return { success: true };

        case 'getStorageUsage':
            return { usage: await Storage.getSyncStorageUsage() };

        case 'getCurrentWorkspace':
            return await getCurrentWorkspace(message.windowId);

        default:
            return { error: 'Unknown action' };
    }
}

/**
 * Create a new workspace
 */
async function createWorkspace(data) {
    const { name, color, fromCurrentWindow, windowId } = data;

    const workspace = {
        id: generateId(),
        name: name || getDefaultWorkspaceName(workspaceIndex),
        color: color || getRandomColor(),
        pinned: false,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tabCount: 0
    };

    let tabs = [];

    if (fromCurrentWindow && windowId) {
        // Capture tabs from current window
        const browserTabs = await browser.tabs.query({ windowId });
        tabs = browserTabs
            .filter(tab => !shouldExcludeUrl(tab.url))
            .filter(tab => settings.includePinnedTabs || !tab.pinned)
            .map(createTabDescriptor);

        workspace.tabCount = tabs.length;

        // Bind window to this workspace
        windowBindings[windowId] = workspace.id;
        await Storage.saveWindowBindings(windowBindings);

        // Notify content scripts in this window
        notifyContentScripts(windowId);
        await updateWindowIndicators(windowId);
    } else {
        // Create with default tab
        tabs.push({
            u: 'about:newtab',
            t: 'New Tab',
            p: false
        });
        workspace.tabCount = 1;
    }

    // Save workspace
    workspaceIndex.push(workspace);
    await Storage.saveWorkspaceIndex(workspaceIndex);
    await Storage.saveWorkspaceTabs(workspace.id, tabs, 1);

    await Storage.saveWorkspaceTabs(workspace.id, tabs, 1);

    updateContextMenu();

    console.log('Created workspace:', workspace.name);
    return { workspace };
}

/**
 * Open a workspace in a new window
 */
async function openWorkspace(workspaceId) {
    const workspace = workspaceIndex.find(ws => ws.id === workspaceId);
    if (!workspace) {
        return { error: 'Workspace not found' };
    }

    // Check if already open
    const existingWindowId = Object.entries(windowBindings)
        .find(([, wsId]) => wsId === workspaceId)?.[0];

    if (existingWindowId && settings.focusExistingWindow) {
        try {
            await browser.windows.update(parseInt(existingWindowId, 10), { focused: true });
            return { windowId: parseInt(existingWindowId, 10) };
        } catch (e) {
            // Window no longer exists, continue to open new one
        }
    }

    // Get tabs for this workspace
    const tabs = await Storage.getWorkspaceTabs(workspaceId);
    const urls = tabs.map(t => t.u).filter(url => url && !shouldExcludeUrl(url));

    if (urls.length === 0) {
        urls.push('about:newtab');
    }

    // Create window with first tab
    const newWindow = await browser.windows.create({
        url: urls[0],
        focused: true
    });

    // Add remaining tabs in background
    for (let i = 1; i < urls.length; i++) {
        await browser.tabs.create({
            windowId: newWindow.id,
            url: urls[i],
            active: false
        });
    }

    // Restore pinned state
    const windowTabs = await browser.tabs.query({ windowId: newWindow.id });
    for (let i = 0; i < Math.min(windowTabs.length, tabs.length); i++) {
        if (tabs[i].p) {
            await browser.tabs.update(windowTabs[i].id, { pinned: true });
        }
    }

    // Bind window
    windowBindings[newWindow.id] = workspaceId;
    await Storage.saveWindowBindings(windowBindings);

    // Notify content scripts in this window
    notifyContentScripts(newWindow.id);
    await updateWindowIndicators(newWindow.id);

    console.log('Opened workspace:', workspace.name, 'in window', newWindow.id);
    return { windowId: newWindow.id };
}

/**
 * Delete a workspace
 */
async function deleteWorkspace(workspaceId) {
    const index = workspaceIndex.findIndex(ws => ws.id === workspaceId);
    if (index === -1) {
        return { error: 'Workspace not found' };
    }

    workspaceIndex.splice(index, 1);
    await Storage.saveWorkspaceIndex(workspaceIndex);
    await Storage.saveWorkspaceIndex(workspaceIndex);
    await Storage.deleteWorkspaceData(workspaceId);

    updateContextMenu();

    // Remove any bindings
    for (const [windowId, wsId] of Object.entries(windowBindings)) {
        if (wsId === workspaceId) {
            delete windowBindings[windowId];
            await updateWindowIndicators(windowId);
        }
    }
    await Storage.saveWindowBindings(windowBindings);

    return { success: true };
}

/**
 * Rename a workspace
 */
async function renameWorkspace(workspaceId, name) {
    const workspace = workspaceIndex.find(ws => ws.id === workspaceId);
    if (!workspace) {
        return { error: 'Workspace not found' };
    }

    workspace.name = name;
    workspace.updatedAt = Date.now();
    await Storage.saveWorkspaceIndex(workspaceIndex);

    updateContextMenu();
    await refreshAllWindowIndicators();

    return { success: true };
}

/**
 * Toggle workspace pinned state
 */
async function toggleWorkspacePin(workspaceId) {
    const workspace = workspaceIndex.find(ws => ws.id === workspaceId);
    if (!workspace) {
        return { error: 'Workspace not found' };
    }

    workspace.pinned = !workspace.pinned;
    await Storage.saveWorkspaceIndex(workspaceIndex);

    return { pinned: workspace.pinned };
}

/**
 * Get current workspace for a window
 */
async function getCurrentWorkspace(windowId) {
    // If windowId not provided, try to get it from the sender
    if (!windowId) {
        return { workspace: null };
    }

    const workspaceId = windowBindings[windowId];
    if (!workspaceId) {
        return { workspace: null };
    }

    const workspace = workspaceIndex.find(ws => ws.id === workspaceId);
    if (!workspace) {
        return { workspace: null };
    }

    return { workspace };
}

/**
 * Notify all content scripts in a window about workspace updates
 */
async function notifyContentScripts(windowId) {
    try {
        const tabs = await browser.tabs.query({ windowId: parseInt(windowId, 10) });
        for (const tab of tabs) {
            try {
                await browser.tabs.sendMessage(tab.id, { action: 'workspaceUpdated' });
            } catch (e) {
                // Ignore errors (tab might not have content script loaded)
            }
        }
    } catch (e) {
        // Ignore errors
    }
}

/**
 * Update browser action badge/title for a window based on its bound workspace
 */
async function updateWindowIndicators(windowId) {
    const numericId = parseInt(windowId, 10);
    try {
        const workspaceId = windowBindings[windowId] ?? windowBindings[numericId];

        if (workspaceId) {
            const workspace = workspaceIndex.find(ws => ws.id === workspaceId);
            if (workspace) {
                const badgeText = getWorkspaceBadgeText(workspace.name);
                // Badge color
                await browser.browserAction.setBadgeBackgroundColor({
                    color: workspace.color || '#3B82F6',
                    windowId: numericId
                });
                // Badge text
                await browser.browserAction.setBadgeText({
                    text: badgeText,
                    windowId: numericId
                });
                // Browser Action Title (Tooltip)
                await browser.browserAction.setTitle({
                    windowId: numericId,
                    title: `Workspace: ${workspace.name}`
                });
                // Window Title (Firefox-specific titlePreface)
                try {
                    await browser.windows.update(numericId, {
                        titlePreface: `${workspace.name} - `
                    });
                } catch (e) {
                    console.warn(`Could not set titlePreface for window ${numericId}`, e);
                }
                return;
            }
        }

        // Reset if no workspace
        await browser.browserAction.setBadgeText({ text: '', windowId: numericId });
        await browser.browserAction.setTitle({ windowId: numericId, title: 'Workspaces' });
        try {
            await browser.windows.update(numericId, { titlePreface: '' });
        } catch (e) {
            // Ignore errors (window might be closing)
        }
    } catch (error) {
        console.error('Failed to update window indicators:', error);
    }
}

/**
 * Refresh badge/title for all known windows
 */
async function refreshAllWindowIndicators() {
    const windows = await browser.windows.getAll();
    for (const win of windows) {
        await updateWindowIndicators(win.id);
    }
}

/**
 * Create a compact label for the badge from a workspace name
 */
function getWorkspaceBadgeText(name = '') {
    const trimmed = name.trim();
    if (!trimmed) return '';

    const parts = trimmed.split(/\s+/);
    let label;

    if (parts.length === 1) {
        label = parts[0].substring(0, BADGE_MAX_CHARS);
    } else {
        label = parts.slice(0, 2).map(word => word[0]).join('');
    }

    return label.toUpperCase().substring(0, BADGE_MAX_CHARS);
}



// Initialize on load
init();
