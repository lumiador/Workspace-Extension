# Firefox Workspaces Extension

A Firefox extension that mimics Microsoft Edge's Workspaces feature - create named workspaces that open as dedicated browser windows, auto-save their tab sets, and sync across devices.

## Features

- **Create Workspaces**: Create from current window or empty
- **Auto-Save**: Tab changes are automatically saved
- **Cross-Device Sync**: Uses Firefox Sync (storage.sync)
- **Move Tabs**: Right-click context menu to move tabs between workspaces
- **Pin/Archive**: Keep workspaces organized
- **Dark Theme UI**: Modern, clean popup interface

## Installation (Development)

1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Navigate to `d:\Workspace Extension\firefox-workspaces\` and select `manifest.json`

The extension icon will appear in your toolbar.

## Usage

1. **Create a workspace**: Click the extension icon → "+ New" → enter a name → Create
2. **Open a workspace**: Click on any workspace in the list
3. **Auto-save**: When you add/close/move tabs in a workspace window, changes save automatically
4. **Move tabs**: Right-click any tab → "Move to Workspace" → select destination
5. **Settings**: Click "Settings" in the popup footer

## Cross-Device Sync

For sync to work:
1. Sign in to your Firefox Account
2. Go to Firefox Settings → Sync
3. Enable "Add-ons" in sync options

Note: Sync may take a few minutes between devices.

## Files

```
firefox-workspaces/
├── manifest.json          # Extension manifest (MV2)
├── background.js          # Background script
├── shared/
│   ├── constants.js       # Storage keys, limits
│   ├── utils.js           # Helper functions
│   └── storage.js         # Storage layer
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
└── icons/
    └── icon-*.png
```

## License

Personal use
