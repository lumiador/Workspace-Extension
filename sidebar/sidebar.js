/**
 * Sidebar script for Firefox Workspaces
 * Refactored to use DOM API
 */

// State
let workspaces = [];
let windowBindings = {};
let selectedColor = '#3B82F6';
let selectedEmoji = WORKSPACE_EMOJIS[0];
let currentWindowId = null;

// DOM elements
const elements = {};

/**
 * Initialize sidebar
 */
async function init() {
    cacheElements();
    renderEmojiPicker(elements.emojiPicker, selectedEmoji, (emoji) => {
        selectedEmoji = emoji;
    });
    setupEventListeners();

    const currentWindow = await browser.windows.getCurrent();
    currentWindowId = currentWindow.id;

    await refreshWorkspaces();

    // Auto-refresh when storage changes
    browser.storage.onChanged.addListener(() => refreshWorkspaces());
}

function cacheElements() {
    elements.btnNew = document.getElementById('btn-new');
    elements.createPanel = document.getElementById('create-panel');
    elements.inputName = document.getElementById('input-name');
    elements.fromCurrent = document.getElementById('from-current');
    elements.btnCancel = document.getElementById('btn-cancel');
    elements.btnCreate = document.getElementById('btn-create');
    elements.workspaceList = document.getElementById('workspace-list');
    elements.linkSettings = document.getElementById('link-settings');
    elements.colorBtns = document.querySelectorAll('.color-btn');
    elements.emojiPicker = document.getElementById('emoji-picker');
    elements.currentWorkspaceIndicator = document.getElementById('current-workspace-indicator');
    if (elements.currentWorkspaceIndicator) {
        elements.currentWsIcon = elements.currentWorkspaceIndicator.querySelector('.current-ws-icon');
        elements.currentWsName = elements.currentWorkspaceIndicator.querySelector('.current-ws-name');
    }
}

function setupEventListeners() {
    elements.btnNew.addEventListener('click', toggleCreatePanel);
    elements.btnCancel.addEventListener('click', hideCreatePanel);
    elements.btnCreate.addEventListener('click', createWorkspace);

    elements.inputName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createWorkspace();
        if (e.key === 'Escape') hideCreatePanel();
    });

    elements.colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.colorBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = btn.dataset.color;
        });
    });

    elements.linkSettings.addEventListener('click', (e) => {
        e.preventDefault();
        browser.runtime.openOptionsPage();
    });
}

function renderEmojiPicker(container, currentEmoji, onSelect) {
    if (!container) return;

    container.textContent = '';
    WORKSPACE_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `emoji-btn${emoji === currentEmoji ? ' selected' : ''}`;
        btn.textContent = emoji;
        btn.title = emoji;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            onSelect(emoji);
        });
        container.appendChild(btn);
    });
}

function toggleCreatePanel() {
    const isHidden = elements.createPanel.classList.contains('hidden');
    if (isHidden) {
        selectedEmoji = getRandomEmoji();
        renderEmojiPicker(elements.emojiPicker, selectedEmoji, (emoji) => {
            selectedEmoji = emoji;
        });
        elements.createPanel.classList.remove('hidden');
        elements.inputName.value = '';
        elements.inputName.focus();
    } else {
        hideCreatePanel();
    }
}

function hideCreatePanel() {
    elements.createPanel.classList.add('hidden');
}

async function createWorkspace() {
    const name = elements.inputName.value.trim();
    const fromCurrentWindow = elements.fromCurrent.checked;

    await browser.runtime.sendMessage({
        action: 'createWorkspace',
        data: {
            name,
            color: selectedColor,
            emoji: selectedEmoji,
            fromCurrentWindow,
            windowId: currentWindowId
        }
    });

    hideCreatePanel();
    await refreshWorkspaces();
}

async function refreshWorkspaces() {
    const response = await browser.runtime.sendMessage({ action: 'getWorkspaces' });
    workspaces = response.workspaces || [];
    windowBindings = response.bindings || {};
    renderCurrentWorkspace();
    renderWorkspaces();
}

function renderCurrentWorkspace() {
    if (!elements.currentWorkspaceIndicator) return;

    const currentWorkspaceId = windowBindings[currentWindowId];

    if (!currentWorkspaceId) {
        elements.currentWorkspaceIndicator.classList.add('hidden');
        return;
    }

    const currentWorkspace = workspaces.find(ws => ws.id === currentWorkspaceId);

    if (!currentWorkspace) {
        elements.currentWorkspaceIndicator.classList.add('hidden');
        return;
    }

    // Show indicator
    elements.currentWorkspaceIndicator.classList.remove('hidden');

    // Update icon
    if (elements.currentWsIcon) {
        applyWorkspaceIcon(elements.currentWsIcon, currentWorkspace);
        elements.currentWsIcon.title = '';
    }

    // Update name
    if (elements.currentWsName) {
        elements.currentWsName.textContent = currentWorkspace.name;
    }
}

function renderWorkspaces() {
    const sorted = [...workspaces]
        .sort((a, b) => {
            if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
            return b.updatedAt - a.updatedAt;
        });

    elements.workspaceList.textContent = '';

    if (sorted.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';

        const p1 = document.createElement('p');
        p1.textContent = 'No workspaces yet';

        const p2 = document.createElement('p');
        p2.className = 'hint';
        p2.textContent = 'Click + to create one';

        empty.appendChild(p1);
        empty.appendChild(p2);
        elements.workspaceList.appendChild(empty);
        return;
    }

    const openWorkspaceIds = new Set(Object.values(windowBindings));

    sorted.forEach(ws => {
        const isOpen = openWorkspaceIds.has(ws.id);
        const isCurrent = windowBindings[currentWindowId] === ws.id;

        const card = document.createElement('div');
        card.className = `workspace-card ${isCurrent ? 'active' : ''}`;
        card.dataset.id = ws.id;

        // Icon (emoji)
        const icon = document.createElement('div');
        icon.className = 'ws-icon';
        applyWorkspaceIcon(icon, ws);
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleInlineEmojiPicker(card, ws);
        });
        card.appendChild(icon);

        // Info
        const info = document.createElement('div');
        info.className = 'ws-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'ws-name';
        nameDiv.textContent = ws.name;
        if (ws.pinned) {
            const pin = document.createElement('span');
            pin.className = 'pinned-icon';
            pin.textContent = ' 📌';
            nameDiv.appendChild(pin);
        }
        info.appendChild(nameDiv);

        const meta = document.createElement('div');
        meta.className = 'ws-meta';
        meta.textContent = `${ws.tabCount || 0} tabs`;
        if (isOpen) {
            meta.textContent += ' • Open';
        }
        info.appendChild(meta);
        card.appendChild(info);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'ws-actions';

        const renameBtn = createBtn('✏️', 'Rename', 'rename');
        const pinBtn = createBtn('📌', ws.pinned ? 'Unpin' : 'Pin', 'pin');
        const deleteBtn = createBtn('🗑️', 'Delete', 'delete', true);

        actions.appendChild(renameBtn);
        actions.appendChild(pinBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(actions);

        elements.workspaceList.appendChild(card);

        card.addEventListener('click', (e) => {
            const btn = e.target.closest('.ws-action-btn');
            if (btn) {
                handleAction(ws.id, btn.dataset.action);
            } else if (!e.target.closest('.emoji-picker-inline')) {
                openWorkspace(ws.id);
            }
        });
    });
}

function toggleInlineEmojiPicker(card, workspace) {
    const existing = card.querySelector('.emoji-picker-inline');
    if (existing) {
        existing.remove();
        return;
    }

    document.querySelectorAll('.emoji-picker-inline').forEach(el => el.remove());

    const picker = document.createElement('div');
    picker.className = 'emoji-picker emoji-picker-inline';
    picker.addEventListener('click', (e) => e.stopPropagation());

    renderEmojiPicker(picker, getWorkspaceEmoji(workspace), async (emoji) => {
        await browser.runtime.sendMessage({
            action: 'setWorkspaceEmoji',
            workspaceId: workspace.id,
            emoji
        });
        await refreshWorkspaces();
    });

    card.appendChild(picker);
}

function createBtn(icon, title, action, isDanger = false) {
    const btn = document.createElement('button');
    btn.className = `ws-action-btn ${isDanger ? 'danger' : ''}`;
    btn.dataset.action = action;
    btn.title = title;
    btn.textContent = icon;
    return btn;
}

async function handleAction(workspaceId, action) {
    switch (action) {
        case 'rename':
            startRename(workspaceId);
            break;
        case 'pin':
            await browser.runtime.sendMessage({ action: 'togglePin', workspaceId });
            await refreshWorkspaces();
            break;
        case 'delete':
            if (confirm('Delete this workspace?')) {
                await browser.runtime.sendMessage({ action: 'deleteWorkspace', workspaceId });
                await refreshWorkspaces();
            }
            break;
    }
}

function startRename(workspaceId) {
    const workspace = workspaces.find(ws => ws.id === workspaceId);
    if (!workspace) return;

    const card = document.querySelector(`[data-id="${workspaceId}"]`);
    const nameEl = card.querySelector('.ws-name');

    nameEl.textContent = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ws-rename-input';
    input.value = workspace.name;
    nameEl.appendChild(input);

    input.focus();
    input.select();

    const finishRename = async (save) => {
        if (save && input.value.trim()) {
            await browser.runtime.sendMessage({
                action: 'renameWorkspace',
                workspaceId,
                name: input.value.trim()
            });
            await refreshWorkspaces();
        } else {
            await refreshWorkspaces();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishRename(true);
        if (e.key === 'Escape') finishRename(false);
    });

    input.addEventListener('blur', () => finishRename(true));
    input.addEventListener('click', e => e.stopPropagation());
}

async function openWorkspace(workspaceId) {
    await browser.runtime.sendMessage({ action: 'openWorkspace', workspaceId });
}

document.addEventListener('DOMContentLoaded', init);
