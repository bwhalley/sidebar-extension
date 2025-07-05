// Background service worker for tab management and calendar integration

// Initialize tracking when extension starts
chrome.runtime.onStartup.addListener(() => {
  initializeTabTracking();
});

chrome.runtime.onInstalled.addListener(() => {
  initializeTabTracking();
});

// Also initialize immediately when script loads
initializeTabTracking();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabs') {
    getAllTabs().then(tabs => {
      sendResponse({ tabs: tabs });
    }).catch(error => {
      sendResponse({ error: error.message });
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
  
  if (request.action === 'test') {
    getNextMeetings().then(testMeetings => {
      sendResponse({ 
        success: true, 
        message: 'Background script is working',
        calendarTest: testMeetings
      });
    }).catch(error => {
      sendResponse({ 
        success: true, 
        message: 'Background script is working but calendar failed',
        calendarError: error.message
      });
    });
    return true;
  }
  
  if (request.action === 'getNextMeetings') {
    getNextMeetings().then(meetings => {
      sendResponse({ meetings });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'getSidebarBookmarks') {
    getSidebarBookmarks().then(bookmarks => {
      sendResponse({ bookmarks });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'createBookmarkTab') {
    createBookmarkTab(request.url, request.title).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ error: error.message });
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
async function initializeTabTracking() {
  try {
    const tabs = await chrome.tabs.query({});
  } catch (error) {
  }
}

// Debounced function to update all tabs
function debouncedUpdateTabs() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(async () => {
    const tabs = await getAllTabs();
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



// Google Calendar integration
let authToken = null;

// Get auth token for Google Calendar, with refresh logic
async function getAuthToken(interactive = false) {
  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
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
    return null;
  }
}

// Helper to remove cached token
function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
}

// Get next 2 meetings from Google Calendar, with token refresh on 401
async function getNextMeetings() {
  let token = authToken || await getAuthToken(false); // Try silent first
  if (!token) {
    // Try interactive if silent failed
    token = await getAuthToken(true);
    if (!token) {
      return { error: 'Authentication failed' };
    }
  }

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${now.toISOString()}&` +
    `timeMax=${endOfDay.toISOString()}&` +
    `maxResults=10&` + // Get more events to filter from
    `orderBy=startTime&` +
    `singleEvents=true&` +
    `fields=items(id,summary,start,end,attendees,location,htmlLink,conferenceData)`;

  let response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // If unauthorized, remove cached token and retry once
  if (response.status === 401) {
    await removeCachedToken(token);
    token = await getAuthToken(false); // Try silent refresh
    if (!token) {
      token = await getAuthToken(true); // Prompt user if needed
    }
    if (!token) {
      return { error: 'Authentication failed after refresh' };
    }
    response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  if (!response.ok) {
    return { error: `HTTP error! status: ${response.status}` };
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
    
    // Extract meeting URL from conferenceData field (primary source)
    if (meeting.conferenceData && meeting.conferenceData.entryPoints) {
      const videoEntryPoint = meeting.conferenceData.entryPoints.find(entry => 
        entry.entryPointType === 'video'
      );
      
      if (videoEntryPoint && videoEntryPoint.uri) {
        const meetingUrl = extractMeetingUrl(videoEntryPoint.uri);
        if (meetingUrl) {
          meetingInfo.meetingUrl = meetingUrl.url;
          meetingInfo.platform = meetingUrl.platform;
          meetingInfo.platformIcon = meetingUrl.icon;
        }
      }
    }
    
    // Fallback: Extract meeting URL from location field if no conferenceData
    if (!meetingInfo.meetingUrl && meeting.location) {
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
}

// Extract meeting URL and platform info from location field
function extractMeetingUrl(location) {
  if (!location) return null;
  
  // Common meeting platform patterns - match the full URL
  const patterns = [
    {
      name: 'Zoom',
      patterns: [
        /https?:\/\/(?:www\.)?zoom\.us\/j\/\d+/i,
        /https?:\/\/(?:www\.)?zoom\.us\/my\/[^\/\s]+/i,
        /https?:\/\/(?:www\.)?zoom\.us\/meeting\/[^\/\s]+/i,
        /https?:\/\/(?:www\.)?[a-zA-Z0-9.-]*zoom\.us\/j\/\d+/i,
        /https?:\/\/(?:www\.)?[a-zA-Z0-9.-]*zoom\.us\/my\/[^\/\s]+/i,
        /https?:\/\/(?:www\.)?[a-zA-Z0-9.-]*zoom\.us\/meeting\/[^\/\s]+/i
      ],
      icon: '🔵'
    },
    {
      name: 'Google Meet',
      patterns: [
        /https?:\/\/meet\.google\.com\/[a-z-]+/i,
        /https?:\/\/hangouts\.google\.com\/[a-z-]+/i
      ],
      icon: '🟢'
    },
    {
      name: 'Microsoft Teams',
      patterns: [
        /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\/\s]+/i,
        /https?:\/\/teams\.live\.com\/meet\/[^\/\s]+/i
      ],
      icon: '🔷'
    },
    {
      name: 'Webex',
      patterns: [
        /https?:\/\/(?:www\.)?webex\.com\/meet\/[^\/\s]+/i,
        /https?:\/\/(?:www\.)?webex\.com\/webex\/[^\/\s]+/i
      ],
      icon: '🟠'
    },
    {
      name: 'Discord',
      patterns: [
        /https?:\/\/discord\.gg\/[^\/\s]+/i,
        /https?:\/\/discord\.com\/invite\/[^\/\s]+/i
      ],
      icon: '🟣'
    },
    {
      name: 'Slack',
      patterns: [
        /https?:\/\/[^\/]+\.slack\.com\/archives\/[^\/\s]+/i
      ],
      icon: '🟡'
    },
    {
      name: 'Skype',
      patterns: [
        /https?:\/\/join\.skype\.com\/[^\/\s]+/i,
        /skype:[^\/\s]+\?chat/i
      ],
      icon: '🔵'
    },
    {
      name: 'BlueJeans',
      patterns: [
        /https?:\/\/(?:www\.)?bluejeans\.com\/[^\/\s]+/i
      ],
      icon: '🔵'
    },
    {
      name: 'GoToMeeting',
      patterns: [
        /https?:\/\/global\.gotomeeting\.com\/join\/[^\/\s]+/i
      ],
      icon: '🟢'
    }
  ];
  
  // Try specific platform patterns first
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
  
  // If no specific platform found, check for any meeting-like URL
  const genericMeetingPattern = /https?:\/\/(?:meet|zoom|teams|webex|bluejeans|gotomeeting|hangouts|discord|slack|skype)\.[^\/\s]+/i;
  const genericMatch = location.match(genericMeetingPattern);
  if (genericMatch) {
    return {
      url: genericMatch[0],
      platform: 'Meeting',
      icon: '📹'
    };
  }
  
  return null;
}



// Get all tabs
async function getAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    
    // Filter out bookmark tabs
    const filteredTabs = tabs.filter(tab => !bookmarkTabIds.has(tab.id));
    
    return filteredTabs;
  } catch (error) {
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
    
    return tab;
  } catch (error) {
    throw error;
  }
}

async function moveTab(tabId, targetIndex) {
  try {
    // Get current tab info to validate
    const tab = await chrome.tabs.get(tabId);
    
    // Safety check: don't move if already at target position
    if (tab.index === targetIndex) {
      return;
    }
    
    // Get all tabs to validate target index
    const allTabs = await chrome.tabs.query({});
    const maxIndex = allTabs.length - 1;
    
    // Clamp target index to valid range
    const clampedIndex = Math.max(0, Math.min(targetIndex, maxIndex));
    
    if (clampedIndex !== targetIndex) {
    }
    
    await chrome.tabs.move(tabId, { index: clampedIndex });
  } catch (error) {
    throw error;
  }
}



 
 