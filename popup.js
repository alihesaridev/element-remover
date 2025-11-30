// Load selectors from storage
function loadSelectors() {
  chrome.storage.sync.get(['selectors'], (result) => {
    const selectors = result.selectors || [];
    displaySelectors(selectors);
  });
}

// Display selectors in the popup
function displaySelectors(selectors) {
  const list = document.getElementById('selectorList');
  
  if (selectors.length === 0) {
    list.innerHTML = '<div class="empty-state">No selectors added. Click "Add Selector" to add one.</div>';
    return;
  }
  
  list.innerHTML = '';
  selectors.forEach((selector, index) => {
    const item = document.createElement('div');
    item.className = 'selector-item';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'selector-input';
    input.value = selector;
    input.placeholder = 'e.g., .class-name or iframe#id .selector';
    
    input.addEventListener('change', () => {
      selectors[index] = input.value;
      saveSelectors(selectors);
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      selectors.splice(index, 1);
      saveSelectors(selectors);
      displaySelectors(selectors);
    });
    
    item.appendChild(input);
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

// Save selectors to storage
function saveSelectors(selectors) {
  chrome.storage.sync.set({ selectors: selectors });
}

// Add new selector
document.getElementById('addSelector').addEventListener('click', () => {
  chrome.storage.sync.get(['selectors'], (result) => {
    const selectors = result.selectors || [];
    selectors.push('');
    saveSelectors(selectors);
    displaySelectors(selectors);
  });
});

// Remove elements now
document.getElementById('removeNow').addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    
    // Get selectors and inject removal function directly into ALL frames
    const result = await chrome.storage.sync.get(['selectors']);
    const selectors = result.selectors || [];
    
    // Parse selectors to separate iframe-specific ones
    const parsedSelectors = parseSelectors(selectors);
    
    // Inject into ALL frames (including iframes) - this is key for cross-origin iframes
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: removeElementsDirectly,
      args: [parsedSelectors]
    });
    
    // Retry multiple times to catch dynamically added iframes and content
    // More aggressive retries for nested iframes that load later
    const retryDelays = [500, 1000, 2000, 3000, 5000, 7000, 10000];
    retryDelays.forEach((delay, index) => {
      setTimeout(async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: removeElementsDirectly,
            args: [parsedSelectors]
          });
        } catch (e) {
          // Ignore retry errors
        }
      }, delay);
    });
    
    // Show feedback
    const btn = document.getElementById('removeNow');
    const originalText = btn.textContent;
    btn.textContent = 'Removed!';
    btn.style.background = '#4CAF50';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '#2196F3';
    }, 1000);
  } catch (error) {
    console.error('Error removing elements:', error);
    alert('Error: Could not remove elements. Make sure you are on a web page (not chrome:// pages).');
  }
});

// Parse selectors to handle iframe-specific syntax
// Format: "iframe#id selector" or "iframe.selector selector"
function parseSelectors(selectors) {
  return selectors.map(selector => {
    // Check if selector specifies an iframe
    const iframeMatch = selector.match(/^iframe([#.][^\s]+)\s+(.+)$/);
    if (iframeMatch) {
      return {
        type: 'iframe',
        iframeSelector: `iframe${iframeMatch[1]}`,
        elementSelector: iframeMatch[2]
      };
    }
    // Regular selector - applies to current document
    return {
      type: 'normal',
      selector: selector
    };
  });
}

// Function to remove elements - runs in page/iframe context
function removeElementsDirectly(parsedSelectors) {
  // Check if we're in an iframe or main document
  const isInIframe = window !== window.top;
  const currentDoc = document;
  let total = 0;
  
  // Separate normal and iframe selectors (define early for retry logic)
  const normalSelectors = parsedSelectors.filter(s => s.type === 'normal');
  const iframeSelectors = parsedSelectors.filter(s => s.type === 'iframe');
  
  // Process selectors
  if (isInIframe) {
    try {
      const url = window.location.href;
      const docReady = currentDoc.readyState;
      const hasBody = !!currentDoc.body;
      
      // Try to identify which iframe we're in
      let iframeInfo = '';
      try {
        const frameElement = window.frameElement;
        if (frameElement) {
          const frameId = frameElement.id || 'no id';
          const frameSrc = frameElement.src || frameElement.getAttribute('src') || 'no src';
          iframeInfo = ` (iframe id: ${frameId}, src: ${frameSrc.substring(0, 50)})`;
        }
      } catch (e) {
        // Can't access frameElement (cross-origin)
      }
      
      // Always try to remove elements immediately (even if about:blank, content might be there)
      // Apply iframe-specific selectors
      
      // Function to recursively search nested iframes
      function searchNestedIframes(doc, depth = 0) {
        let nestedTotal = 0;
        try {
          const nestedIframes = doc.querySelectorAll('iframe');
          nestedIframes.forEach((nestedIframe) => {
            try {
              const nestedDoc = nestedIframe.contentDocument || nestedIframe.contentWindow?.document;
              if (nestedDoc && nestedDoc.readyState !== 'loading') {
                // Try selectors in nested iframe
                iframeSelectors.forEach(sel => {
                  const removed = removeFromDocument(nestedDoc, sel.elementSelector);
                  nestedTotal += removed;
                });
                normalSelectors.forEach(sel => {
                  const removed = removeFromDocument(nestedDoc, sel.selector);
                  nestedTotal += removed;
                });
                // Recursively search deeper
                nestedTotal += searchNestedIframes(nestedDoc, depth + 1);
              }
            } catch (e) {
              // Cross-origin nested iframe - will be handled by allFrames injection
            }
          });
        } catch (e) {
          // Error accessing nested iframes
        }
        return nestedTotal;
      }
      
      iframeSelectors.forEach(sel => {
        const removed = removeFromDocument(currentDoc, sel.elementSelector);
        total += removed;
        // Search nested iframes
        total += searchNestedIframes(currentDoc);
      });
      
      // Apply normal selectors
      normalSelectors.forEach(sel => {
        const removed = removeFromDocument(currentDoc, sel.selector);
        total += removed;
        // Search nested iframes
        total += searchNestedIframes(currentDoc);
      });
      
      // If document is still loading or about:blank, set up retries and watchers
      if (docReady === 'loading' || !hasBody) {
        // Retry after document loads
        if (docReady === 'loading') {
          currentDoc.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
              iframeSelectors.forEach(sel => {
                removeFromDocument(currentDoc, sel.elementSelector);
              });
              normalSelectors.forEach(sel => {
                removeFromDocument(currentDoc, sel.selector);
              });
            }, 500);
          });
        }
      }
      
      // Watch for dynamically added elements (even if about:blank, content can be added)
      if (hasBody && (iframeSelectors.length > 0 || normalSelectors.length > 0)) {
        let lastCheck = 0;
        const observer = new MutationObserver(() => {
          // Throttle checks to avoid spam
          const now = Date.now();
          if (now - lastCheck < 500) return; // Only check every 500ms
          lastCheck = now;
          
          let found = 0;
          iframeSelectors.forEach(sel => {
            found += removeFromDocument(currentDoc, sel.elementSelector);
          });
          normalSelectors.forEach(sel => {
            found += removeFromDocument(currentDoc, sel.selector);
          });
          // Also check nested iframes
          searchNestedIframes(currentDoc);
        });
        
        try {
          observer.observe(currentDoc.body, {
            childList: true,
            subtree: true
          });
          
          // Stop observing after 30 seconds
          setTimeout(() => observer.disconnect(), 30000);
        } catch (e) {
          // Observer failed, ignore
        }
      }
      
      // Also retry periodically for about:blank iframes (they might load content later)
      if (url === 'about:blank' && hasBody) {
        const retryInterval = setInterval(() => {
          iframeSelectors.forEach(sel => {
            removeFromDocument(currentDoc, sel.elementSelector);
          });
          normalSelectors.forEach(sel => {
            removeFromDocument(currentDoc, sel.selector);
          });
        }, 2000);
        
        // Stop retrying after 30 seconds
        setTimeout(() => clearInterval(retryInterval), 30000);
      }
    } catch (e) {
      // Cannot access URL (cross-origin), still try to apply selectors
      iframeSelectors.forEach(sel => {
        total += removeFromDocument(currentDoc, sel.elementSelector);
      });
      normalSelectors.forEach(sel => {
        total += removeFromDocument(currentDoc, sel.selector);
      });
    }
  } else {
    // Watch for new iframes being added to the page
    const iframeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // New iframe detected - will be handled by retry mechanism
          }
        });
      });
    });
    
    try {
      iframeObserver.observe(currentDoc.body || currentDoc.documentElement, {
        childList: true,
        subtree: true
      });
      
      // Stop observing after 30 seconds
      setTimeout(() => iframeObserver.disconnect(), 30000);
    } catch (e) {
      // Observer failed
    }
  }
  
  // Try to get the iframe element that contains this frame (if we're in an iframe)
  let frameElement = null;
  try {
    frameElement = window.frameElement;
  } catch (e) {
    // Cross-origin - cannot access frameElement
  }
  
  function removeFromDocument(doc, selectorStr) {
    let removed = 0;
    if (!selectorStr || !selectorStr.trim()) {
      return 0;
    }
    
    try {
      // First, check if the document is ready
      if (!doc || !doc.querySelectorAll) {
        return 0;
      }
      
      // Try the exact selector first
      let elements = doc.querySelectorAll(selectorStr);
      
      // If no elements found, try alternative formats
      if (elements.length === 0) {
        // Try with space between classes (descendant selector)
        const withSpace = selectorStr.replace(/\.([^\s.]+)\.([^\s.]+)/g, '.$1 .$2');
        if (withSpace !== selectorStr) {
          elements = doc.querySelectorAll(withSpace);
        }
      }
      
      elements.forEach(el => {
        el.remove();
        removed++;
      });
    } catch (e) {
      console.error(`[Element Remover] Error with selector "${selectorStr}":`, e);
    }
    return removed;
  }
  
  if (isInIframe) {
    // We're inside an iframe (injected via allFrames: true)
    // For iframe-specific selectors, apply the element selector
    // The allFrames injection ensures we're in all iframes, including nested ones
    
    // Wait for document to be ready (in case iframe is still loading)
    function tryRemoveWhenReady() {
      if (currentDoc.readyState === 'loading') {
        currentDoc.addEventListener('DOMContentLoaded', () => {
          setTimeout(tryRemoveWhenReady, 100);
        });
        return;
      }
      
      // Apply iframe-specific selectors
      iframeSelectors.forEach(sel => {
        // Apply the element selector - this will work in the right iframe
        const removed = removeFromDocument(currentDoc, sel.elementSelector);
        total += removed;
        
        // Also try to find and remove from nested iframes within this iframe
        function searchNestedIframes(doc, depth = 0) {
          let nestedRemoved = 0;
          try {
            const nestedIframes = doc.querySelectorAll('iframe');
            nestedIframes.forEach(nestedIframe => {
              try {
                const nestedDoc = nestedIframe.contentDocument || nestedIframe.contentWindow?.document;
                if (nestedDoc && nestedDoc.readyState !== 'loading') {
                  const found = removeFromDocument(nestedDoc, sel.elementSelector);
                  nestedRemoved += found;
                  // Recursively search deeper
                  nestedRemoved += searchNestedIframes(nestedDoc, depth + 1);
                }
              } catch (e) {
                // Cross-origin nested iframe
              }
            });
          } catch (e) {
            // Error accessing nested iframes
          }
          return nestedRemoved;
        }
        
        total += searchNestedIframes(currentDoc);
      });
      
      // Also apply normal selectors to this iframe
      normalSelectors.forEach(sel => {
        total += removeFromDocument(currentDoc, sel.selector);
      });
      
      // Watch for dynamically added elements (only if document has body)
      if ((iframeSelectors.length > 0 || normalSelectors.length > 0) && currentDoc.body) {
        const observer = new MutationObserver(() => {
          iframeSelectors.forEach(sel => {
            removeFromDocument(currentDoc, sel.elementSelector);
          });
          normalSelectors.forEach(sel => {
            removeFromDocument(currentDoc, sel.selector);
          });
        });
        
        try {
          observer.observe(currentDoc.body, {
            childList: true,
            subtree: true
          });
          
          // Stop observing after 10 seconds
          setTimeout(() => observer.disconnect(), 10000);
        } catch (e) {
          // Observer failed, ignore
        }
      }
    }
    
    tryRemoveWhenReady();
  } else {
    // We're in the main document
    // We're in the main document
    
    // Apply normal selectors to main document
    normalSelectors.forEach(sel => {
      total += removeFromDocument(currentDoc, sel.selector);
    });
    
    // Process iframe-specific selectors - RECURSIVELY search nested iframes
    iframeSelectors.forEach(sel => {
      function searchInIframeRecursively(iframe, processed = new Set(), depth = 0) {
        if (processed.has(iframe)) return 0;
        processed.add(iframe);
        
        let removed = 0;
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            // Try to find elements in this iframe
            const found = removeFromDocument(iframeDoc, sel.elementSelector);
            removed += found;
            
            // Recursively search nested iframes inside this iframe
            const nestedIframes = iframeDoc.querySelectorAll('iframe');
            nestedIframes.forEach(nestedIframe => {
              removed += searchInIframeRecursively(nestedIframe, processed, depth + 1);
            });
          }
          } catch (e) {
            // Cross-origin iframe - will be handled by allFrames injection
          }
        return removed;
      }
      
      try {
        const iframes = currentDoc.querySelectorAll(sel.iframeSelector);
        iframes.forEach(iframe => {
          total += searchInIframeRecursively(iframe);
        });
      } catch (e) {
        console.error(`[Element Remover] Error finding iframe ${sel.iframeSelector}:`, e);
      }
    });
    
    // Recursively process all iframes for normal selectors
    function processAllIframes(doc, processed = new Set()) {
      let removed = 0;
      const iframes = doc.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        if (processed.has(iframe)) return;
        processed.add(iframe);
        
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            normalSelectors.forEach(sel => {
              removed += removeFromDocument(iframeDoc, sel.selector);
            });
            removed += processAllIframes(iframeDoc, processed);
          }
        } catch (e) {
          // Cross-origin iframe - will be handled by allFrames injection
        }
      });
      return removed;
    }
    
    total += processAllIframes(currentDoc);
  }
  
  
  return total;
}

// Initialize on load
loadSelectors();


