// Parse selectors to handle iframe-specific syntax (same as popup.js)
function parseSelectors(selectors) {
  return selectors.map(selector => {
    const iframeMatch = selector.match(/^iframe([#.][^\s]+)\s+(.+)$/);
    if (iframeMatch) {
      return {
        type: 'iframe',
        iframeSelector: `iframe${iframeMatch[1]}`,
        elementSelector: iframeMatch[2]
      };
    }
    return {
      type: 'normal',
      selector: selector
    };
  });
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'removeElements') {
    removeElements().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error removing elements:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
  return true;
});

// Auto-run when content script loads in iframe context
(function() {
  const isInIframe = window !== window.top;
  const url = window.location.href;
  
  // Check if we're in a chrome-extension:// iframe
  if (url.startsWith('chrome-extension://')) {
    // Get selectors and try to remove elements
    chrome.storage.sync.get(['selectors'], (result) => {
      const selectors = result.selectors || ['.sc-gzOgki.ksYuOU'];
      const parsedSelectors = parseSelectors(selectors);
      
      const normalSelectors = parsedSelectors.filter(s => s.type === 'normal');
      const iframeSelectors = parsedSelectors.filter(s => s.type === 'iframe');
      
      function removeFromDoc(doc, selectorStr) {
        try {
          const elements = doc.querySelectorAll(selectorStr);
          elements.forEach(el => el.remove());
          return elements.length;
        } catch (e) {
          return 0;
        }
      }
      
      // Apply selectors
      iframeSelectors.forEach(sel => {
        removeFromDoc(document, sel.elementSelector);
      });
      normalSelectors.forEach(sel => {
        removeFromDoc(document, sel.selector);
      });
      
      // Watch for dynamically added elements
      if (document.body) {
        const observer = new MutationObserver(() => {
          iframeSelectors.forEach(sel => {
            removeFromDoc(document, sel.elementSelector);
          });
          normalSelectors.forEach(sel => {
            removeFromDoc(document, sel.selector);
          });
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        setTimeout(() => observer.disconnect(), 30000);
      }
    });
  }
})();

// Function to remove elements from a document (main or iframe)
function removeElementsFromDocument(doc, selectors) {
  let totalRemoved = 0;
  
  selectors.forEach(selector => {
    if (!selector || selector.trim() === '') return;
    
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(element => {
        element.remove();
        totalRemoved++;
      });
    } catch (error) {
      console.error(`Error removing elements with selector "${selector}":`, error);
    }
  });
  
  return totalRemoved;
}

// Function to recursively process iframes
function processIframes(doc, selectors, processedFrames = new Set()) {
  let totalRemoved = 0;
  
  // Remove elements from current document
  totalRemoved += removeElementsFromDocument(doc, selectors);
  
  // Find all iframes in the current document
  const iframes = doc.querySelectorAll('iframe');
  
  iframes.forEach(iframe => {
    // Skip if we've already processed this iframe
    if (processedFrames.has(iframe)) {
      return;
    }
    processedFrames.add(iframe);
    
    try {
      // Try to access iframe content (only works for same-origin iframes)
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (iframeDoc) {
        // Recursively process this iframe
        const removed = processIframes(iframeDoc, selectors, processedFrames);
        totalRemoved += removed;
      } else {
        // Cross-origin iframe - try to inject script
        try {
          const iframeWindow = iframe.contentWindow;
          if (iframeWindow) {
            // Inject removal script into iframe
            const script = iframeWindow.document.createElement('script');
            script.textContent = `
              (function() {
                const selectors = ${JSON.stringify(selectors)};
                selectors.forEach(selector => {
                  if (!selector || selector.trim() === '') return;
                  try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                  } catch(e) {}
                });
              })();
            `;
            iframeWindow.document.documentElement.appendChild(script);
            script.remove();
          }
        } catch (e) {
          // Cross-origin iframe - cannot access
        }
      }
    } catch (error) {
      // Cross-origin iframe or other error
    }
  });
  
  return totalRemoved;
}

// Main function to remove elements based on stored selectors
async function removeElements() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['selectors'], (result) => {
      try {
        const selectors = result.selectors || [];
        const totalRemoved = processIframes(document, selectors);
        resolve(totalRemoved);
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Auto-remove on page load (optional - can be disabled)
// removeElements();

