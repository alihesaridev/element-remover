# Element Remover Chrome Extension

A Chrome extension that allows you to remove elements from web pages by CSS selectors.

## Features

- **One-click removal**: Click the extension icon to instantly remove matching elements
- **Iframe support**: Removes elements from the main page and all accessible iframes
- **Selector management**: Right-click the icon → "Manage Selectors" to add/edit selectors
- **Permanent storage**: Selectors are synced across all your Chrome instances
- **Multiple selectors**: Add, edit, and remove multiple selectors

## Installation

1. **Load Extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top right)
   - Click "Load unpacked"
   - Select the folder containing this extension

## Usage

### Quick Removal
- **Click the extension icon** on any page to instantly remove all elements matching your saved selectors

### Managing Selectors
1. **Right-click the extension icon** in the toolbar
2. Select **"Manage Selectors"** from the context menu
3. The popup will open showing your saved selectors
4. To add a new selector, click "Add Selector"
5. To edit a selector, modify the text in the input field
6. To remove a selector from the list, click the "Remove" button next to it
7. Click "Remove Elements Now" to test removal from the current page

## Selector Format

You can use any valid CSS selector:
- Class: `.class-name`
- ID: `#element-id`
- Tag: `div`
- Combined: `div.class-name#id`
- Multiple classes: `.class1.class2`
- Attribute: `[data-attribute="value"]`

### Iframe-Specific Selectors

For elements inside specific iframes, use the format:
- `iframe#id selector` - Target an iframe by ID, then apply selector inside it
- `iframe.class selector` - Target an iframe by class, then apply selector inside it
- Example: `iframe#my-iframe .advertisement` - Removes `.advertisement` elements inside `iframe#my-iframe`

**Note**: Regular selectors (without iframe prefix) will be applied to all accessible frames automatically.

## Files

- `manifest.json` - Extension configuration
- `popup.html` - Popup interface
- `popup.js` - Popup logic and selector management
- `content.js` - Content script that removes elements
- `background.js` - Background service worker for icon click handling

## Notes

- Selectors are synced across all your Chrome instances
- The extension works on all websites (except `chrome://` pages)
- Elements are removed immediately when you click the icon
- **Iframe support**: The extension automatically searches and removes elements from same-origin iframes
- **Cross-origin web iframes**: Supported via script injection into all frames
- **Chrome Extension iframes**: Cannot access `chrome-extension://` pages from other extensions due to Chrome security restrictions. This is a fundamental limitation that cannot be bypassed.
- Selector format: Use proper CSS selector syntax (e.g., `.class-name` for classes, `#id` for IDs)

## Limitations

- **Chrome Extension Pages**: The extension cannot access or inject scripts into `chrome-extension://` pages from other extensions. This is a Chrome security restriction that prevents cross-extension access.
- **Chrome Internal Pages**: Cannot work on `chrome://` pages (e.g., `chrome://extensions/`)
- **Cross-origin iframes**: Regular cross-origin web iframes are supported, but `chrome-extension://` iframes from other extensions are not accessible

