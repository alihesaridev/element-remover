// Create context menu for managing selectors
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'manageSelectors',
    title: 'Manage Selectors',
    contexts: ['action']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'manageSelectors') {
    // Open popup in a new window
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 450,
      height: 600
    });
  }
});

// Note: chrome.action.onClicked doesn't fire when default_popup is set
// Removal is handled via the popup's "Remove Elements Now" button
// Or we can add a keyboard shortcut later

// Function to inject directly - removes elements using provided selectors
function removeElementsDirectly(selectors) {
  // This function runs in the page context
  function removeFromDocument(doc) {
    let removed = 0;
    selectors.forEach(selector => {
      if (!selector || selector.trim() === '') return;
      try {
        const elements = doc.querySelectorAll(selector);
        elements.forEach(el => {
          el.remove();
          removed++;
        });
      } catch (e) {
        console.error('[Element Remover] Error with selector:', selector, e);
      }
    });
    return removed;
  }
  
  function processIframes(doc, processed = new Set()) {
    let total = removeFromDocument(doc);
    const iframes = doc.querySelectorAll('iframe');
    
    iframes.forEach(iframe => {
      if (processed.has(iframe)) return;
      processed.add(iframe);
      
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          total += processIframes(iframeDoc, processed);
        }
      } catch (e) {
        // Cross-origin iframe - cannot access
      }
    });
    
    return total;
  }
  
  const total = processIframes(document);
}

