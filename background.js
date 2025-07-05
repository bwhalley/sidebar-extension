// Background service worker for tab management and calendar integration

// Initialize tracking when extension starts
chrome.runtime.onStartup.addListener(() => {
  initializeTabGroupTracking();
});

chrome.runtime.onInstalled.addListener(() => {
  initializeTabGroupTracking();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabs') {
    getTabsWithGroups().then(tabs => {
      sendResponse({ tabs: tabs });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'switchTab') {
    chrome.tabs.update(request.tabId, { active: true });
    sendResponse({ success: true });
  }
  
  if (request.action === 'closeTab') {
    chrome.tabs.remove(request.tabId);
    sendResponse({ success: true });
  }
  
  if (request.action === 'refreshTab') {
    chrome.tabs.reload(request.tabId);
    sendResponse({ success: true });
  }
  
  if (request.action === 'getNextMeetings') {
    getNextMeetings().then(meetings => {
      sendResponse({ meetings });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'getSidebarBookmarks') {
    getSidebarBookmarks().then(bookmarks => {
      sendResponse({ bookmarks });
    });
    return true; // Keep the message channel open for async response
  }
  

  
  if (request.action === 'createBookmarkTab') {
    createBookmarkTab(request.url, request.title).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'moveTab') {
    moveTab(request.tabId, request.targetIndex).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Enhanced tab event listeners for real-time updates
let updateTimeout = null;

// Simplified tracking - use Chrome's IDs directly
let bookmarkTabIds = new Set(); // chromeTabId -> true

// Initialize our tracking system with Chrome's current state
async function initializeTabGroupTracking() {
  try {
    const tabs = await chrome.tabs.query({});
    console.log('Initialized tab tracking');
  } catch (error) {
    console.error('Failed to initialize tab tracking:', error);
  }
}

// Debounced function to update all tabs
function debouncedUpdateTabs() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(async () => {
    const tabs = await getTabsWithGroups();
    chrome.runtime.sendMessage({
      action: 'tabsUpdated',
      tabs: tabs
    });
  }, 100); // Reduced frequency to prevent flickering
}

// Listen for tab updates (title, URL, favicon changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Update immediately for important changes
  if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
    debouncedUpdateTabs();
  }
  // Also update when page loads completely
  else if (changeInfo.status === 'complete') {
    debouncedUpdateTabs();
  }
});

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  debouncedUpdateTabs();
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  unregisterTab(tabId);
  debouncedUpdateTabs();
});

// Listen for new tab creation
chrome.tabs.onCreated.addListener((tab) => {
  debouncedUpdateTabs();
});

// Listen for tab replacement (navigation, etc.)
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  // Check if the removed tab was a bookmark tab
  const wasBookmarkTab = bookmarkTabIds.has(removedTabId);
  
  unregisterTab(removedTabId);
  
  // If it was a bookmark tab, mark the new tab as one too
  if (wasBookmarkTab) {
    bookmarkTabIds.add(addedTabId);
  }
  
  debouncedUpdateTabs();
});

// Listen for tab movement (reordering)
chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  debouncedUpdateTabs();
});

// Listen for tab attachment/detachment (between windows)
chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  debouncedUpdateTabs();
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  debouncedUpdateTabs();
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  debouncedUpdateTabs();
});

// Listen for tab group changes to sync our tracking
chrome.tabGroups.onUpdated.addListener((group) => {
  // Update our tracking when Chrome's group title changes
  setGroupTitle(group.id, group.title || 'Group');
  debouncedUpdateTabs();
});

chrome.tabGroups.onRemoved.addListener((group) => {
  // Remove group from our tracking when Chrome removes it
  groupTitles.delete(group.id);
  debouncedUpdateTabs();
});

// Periodic state reconciliation to catch inconsistencies
setInterval(async () => {
  if (!isGroupingOperation) {
    try {
      await reconcileTabStates();
    } catch (error) {
      console.error('State reconciliation failed:', error);
    }
  }
}, 5000); // Check every 5 seconds

async function reconcileTabStates() {
  try {
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (bookmarkTabIds.has(tab.id)) continue; // Skip bookmark tabs
      
      const ourGroupId = getTabGroupId(tab.id);
      const chromeGroupId = tab.groupId;
      
      // If Chrome says the tab is grouped but we don't track it
      if (chromeGroupId !== -1 && ourGroupId === -1) {
        console.log(`Reconciling: Tab ${tab.id} is grouped in Chrome but not in our tracking`);
        updateTabGroupTracking(tab.id, chromeGroupId);
      }
      // If we track the tab as grouped but Chrome says it's not
      else if (chromeGroupId === -1 && ourGroupId !== -1) {
        console.log(`Reconciling: Tab ${tab.id} is tracked as grouped but not in Chrome`);
        updateTabGroupTracking(tab.id, -1);
      }
    }
  } catch (error) {
    console.error('Failed to reconcile tab states:', error);
  }
}

// Google Calendar integration
let authToken = null;

// Get auth token for Google Calendar
async function getAuthToken() {
  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
    authToken = token;
    return token;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

// Get next 2 meetings from Google Calendar
async function getNextMeetings() {
  try {
    const token = authToken || await getAuthToken();
    if (!token) {
      return { error: 'Authentication failed' };
    }

    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${now.toISOString()}&` +
      `timeMax=${endOfDay.toISOString()}&` +
      `maxResults=10&` + // Get more events to filter from
      `orderBy=startTime&` +
      `singleEvents=true`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const allEvents = data.items || [];
    
    // Filter events to only show meetings with multiple attendees
    const meetings = allEvents.filter(event => {
      // Skip location status events (usually have no attendees or just the user)
      if (event.attendees && event.attendees.length <= 1) {
        return false;
      }
      
      // Skip events that are just location status updates
      if (event.summary && (
        event.summary.toLowerCase().includes('home') ||
        event.summary.toLowerCase().includes('office') ||
        event.summary.toLowerCase().includes('location')
      )) {
        return false;
      }
      
      // Skip events without attendees (personal events)
      if (!event.attendees || event.attendees.length === 0) {
        return false;
      }
      
      // Only include events with 2 or more attendees (actual meetings)
      return event.attendees.length >= 2;
    });
    
    // Process meetings to extract meeting URLs and platform info
    const processedMeetings = meetings.slice(0, 2).map(meeting => {
      const meetingInfo = { ...meeting };
      
      // Extract meeting URL from location field
      if (meeting.location) {
        const meetingUrl = extractMeetingUrl(meeting.location);
        if (meetingUrl) {
          meetingInfo.meetingUrl = meetingUrl.url;
          meetingInfo.platform = meetingUrl.platform;
          meetingInfo.platformIcon = meetingUrl.icon;
        }
      }
      
      return meetingInfo;
    });
    
    return processedMeetings;
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return { error: error.message };
  }
}

// Extract meeting URL and platform info from location field
function extractMeetingUrl(location) {
  if (!location) return null;
  
  // Common meeting platform patterns
  const patterns = [
    {
      name: 'Zoom',
      patterns: [
        /https?:\/\/(?:www\.)?zoom\.us\/j\/(\d+)/i,
        /https?:\/\/(?:www\.)?zoom\.us\/my\/([^\/\s]+)/i,
        /https?:\/\/(?:www\.)?zoom\.us\/meeting\/([^\/\s]+)/i
      ],
      icon: '🔵'
    },
    {
      name: 'Google Meet',
      patterns: [
        /https?:\/\/meet\.google\.com\/([a-z-]+)/i,
        /https?:\/\/hangouts\.google\.com\/([a-z-]+)/i
      ],
      icon: '🟢'
    },
    {
      name: 'Microsoft Teams',
      patterns: [
        /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/([^\/\s]+)/i,
        /https?:\/\/teams\.live\.com\/meet\/([^\/\s]+)/i
      ],
      icon: '🔷'
    },
    {
      name: 'Webex',
      patterns: [
        /https?:\/\/(?:www\.)?webex\.com\/meet\/([^\/\s]+)/i,
        /https?:\/\/(?:www\.)?webex\.com\/webex\/([^\/\s]+)/i
      ],
      icon: '🟠'
    },
    {
      name: 'Discord',
      patterns: [
        /https?:\/\/discord\.gg\/([^\/\s]+)/i,
        /https?:\/\/discord\.com\/invite\/([^\/\s]+)/i
      ],
      icon: '🟣'
    },
    {
      name: 'Slack',
      patterns: [
        /https?:\/\/[^\/]+\.slack\.com\/archives\/([^\/\s]+)/i
      ],
      icon: '🟡'
    },
    {
      name: 'Skype',
      patterns: [
        /https?:\/\/join\.skype\.com\/([^\/\s]+)/i,
        /skype:([^\/\s]+)\?chat/i
      ],
      icon: '🔵'
    },
    {
      name: 'BlueJeans',
      patterns: [
        /https?:\/\/(?:www\.)?bluejeans\.com\/([^\/\s]+)/i
      ],
      icon: '🔵'
    },
    {
      name: 'GoToMeeting',
      patterns: [
        /https?:\/\/global\.gotomeeting\.com\/join\/([^\/\s]+)/i
      ],
      icon: '🟢'
    },
    {
      name: 'Generic Meeting',
      patterns: [
        /https?:\/\/[^\/\s]+/i
      ],
      icon: '📹'
    }
  ];
  
  for (const platform of patterns) {
    for (const pattern of platform.patterns) {
      const match = location.match(pattern);
      if (match) {
        return {
          url: match[0],
          platform: platform.name,
          icon: platform.icon
        };
      }
    }
  }
  
  return null;
}

// Get tabs in a specific group


// Get bookmark tabs (for potential future use)
async function getBookmarkTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(tab => bookmarkTabIds.has(tab.id));
  } catch (error) {
    console.error('Failed to get bookmark tabs:', error);
    return [];
  }
}

// Get all tabs
async function getTabsWithGroups() {
  try {
    const tabs = await chrome.tabs.query({});
    
    // Filter out bookmark tabs
    const filteredTabs = tabs.filter(tab => !bookmarkTabIds.has(tab.id));
    
    return filteredTabs;
  } catch (error) {
    console.error('Failed to get tabs:', error);
    return [];
  }
}

// Get bookmarks from the "Sidebar" folder
async function getSidebarBookmarks() {
  try {
    // Get all bookmarks
    const bookmarks = await chrome.bookmarks.getTree();
    
    // Find the "Sidebar" folder
    let sidebarFolder = null;
    
    function findSidebarFolder(nodes) {
      for (const node of nodes) {
        if (node.title === 'Sidebar' && node.children) {
          sidebarFolder = node;
          return;
        }
        if (node.children) {
          findSidebarFolder(node.children);
        }
      }
    }
    
    findSidebarFolder(bookmarks);
    
    if (!sidebarFolder) {
      return []; // Return empty array if folder doesn't exist
    }
    
    // Extract bookmark URLs from the Sidebar folder
    const sidebarBookmarks = [];
    
    function extractBookmarks(nodes) {
      for (const node of nodes) {
        if (node.url) {
          // This is a bookmark (not a folder)
          sidebarBookmarks.push({
            id: node.id,
            title: node.title,
            url: node.url
          });
        } else if (node.children) {
          // This is a folder, recurse into it
          extractBookmarks(node.children);
        }
      }
    }
    
    extractBookmarks(sidebarFolder.children);
    
    return sidebarBookmarks;
  } catch (error) {
    console.error('Failed to fetch bookmarks:', error);
    return { error: error.message };
  }
}

function unregisterTab(chromeTabId) {
  bookmarkTabIds.delete(chromeTabId);
}



async function createBookmarkTab(url, title) {
  try {
    // Create the tab
    const tab = await chrome.tabs.create({ 
      url: url,
      active: true // Activate it immediately
    });
    
    // Mark it as a bookmark tab so it won't appear in our main tab list
    bookmarkTabIds.add(tab.id);
    
    console.log(`Created bookmark tab: ${title} (${tab.id})`);
    return tab;
  } catch (error) {
    console.error('Failed to create bookmark tab:', error);
    throw error;
  }
}

async function moveTab(tabId, targetIndex) {
  try {
    console.log(`Moving tab ${tabId} to index ${targetIndex}`);
    
    // Get current tab info to validate
    const tab = await chrome.tabs.get(tabId);
    console.log(`Current tab index: ${tab.index}, target index: ${targetIndex}`);
    
    // Safety check: don't move if already at target position
    if (tab.index === targetIndex) {
      console.log(`Tab ${tabId} already at target index ${targetIndex}`);
      return;
    }
    
    // Get all tabs to validate target index
    const allTabs = await chrome.tabs.query({});
    const maxIndex = allTabs.length - 1;
    
    // Clamp target index to valid range
    const clampedIndex = Math.max(0, Math.min(targetIndex, maxIndex));
    
    if (clampedIndex !== targetIndex) {
      console.log(`Adjusted target index from ${targetIndex} to ${clampedIndex} (bounds: 0-${maxIndex})`);
    }
    
    await chrome.tabs.move(tabId, { index: clampedIndex });
    console.log(`Successfully moved tab ${tabId} to index ${clampedIndex}`);
  } catch (error) {
    console.error('Failed to move tab:', error);
    throw error;
  }
}



 
 