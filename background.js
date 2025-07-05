// Background service worker for tab management and calendar integration

console.log('Background script loading...');

// Initialize tracking when extension starts
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension startup detected');
  initializeTabTracking();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  initializeTabTracking();
});

// Also initialize immediately when script loads
initializeTabTracking();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.action, request);
  
  if (request.action === 'getTabs') {
    console.log('Processing getTabs request');
    getAllTabs().then(tabs => {
      console.log('Sending tabs response:', { tabs: tabs });
      sendResponse({ tabs: tabs });
    }).catch(error => {
      console.error('Failed to get tabs:', error);
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
    console.log('Test message received in background script');
    // Also test calendar functionality
    getNextMeetings().then(testMeetings => {
      console.log('Test calendar call result:', testMeetings);
      sendResponse({ 
        success: true, 
        message: 'Background script is working',
        calendarTest: testMeetings
      });
    }).catch(error => {
      console.error('Test calendar call failed:', error);
      sendResponse({ 
        success: true, 
        message: 'Background script is working but calendar failed',
        calendarError: error.message
      });
    });
    return true;
  }
  
  if (request.action === 'getNextMeetings') {
    console.log('getNextMeetings message received in background script');
    console.log('About to call getNextMeetings function...');
    getNextMeetings().then(meetings => {
      console.log('getNextMeetings function completed, sending response:', meetings);
      sendResponse({ meetings });
    }).catch(error => {
      console.error('getNextMeetings function failed:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'getSidebarBookmarks') {
    getSidebarBookmarks().then(bookmarks => {
      sendResponse({ bookmarks });
    }).catch(error => {
      console.error('Failed to get bookmarks:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'createBookmarkTab') {
    createBookmarkTab(request.url, request.title).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Failed to create bookmark tab:', error);
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
  console.log('getNextMeetings called');
  try {
    const token = authToken || await getAuthToken();
    if (!token) {
      console.log('No auth token available');
      return { error: 'Authentication failed' };
    }
    console.log('Auth token obtained');

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
    console.log('Calendar API response:', data);
    const allEvents = data.items || [];
    console.log('All events found:', allEvents.length);
    
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
    
    console.log('Filtered meetings:', meetings.length);
    // Process meetings to extract meeting URLs and platform info
    console.log('Processing meetings for URL extraction...');
    const processedMeetings = meetings.slice(0, 2).map(meeting => {
      console.log('Processing meeting:', meeting.summary);
      const meetingInfo = { ...meeting };
      
      // Extract meeting URL from conferenceData field (primary source)
      if (meeting.conferenceData && meeting.conferenceData.entryPoints) {
        console.log('Conference data found:', meeting.conferenceData);
        const videoEntryPoint = meeting.conferenceData.entryPoints.find(entry => 
          entry.entryPointType === 'video'
        );
        
        if (videoEntryPoint && videoEntryPoint.uri) {
          console.log('Video entry point found:', videoEntryPoint);
          console.log('Video entry point URI:', videoEntryPoint.uri);
          const meetingUrl = extractMeetingUrl(videoEntryPoint.uri);
          if (meetingUrl) {
            meetingInfo.meetingUrl = meetingUrl.url;
            meetingInfo.platform = meetingUrl.platform;
            meetingInfo.platformIcon = meetingUrl.icon;
            console.log('Meeting URL extracted:', meetingUrl);
            console.log('Final meeting URL to be used:', meetingInfo.meetingUrl);
          }
        }
      }
      
      // Fallback: Extract meeting URL from location field if no conferenceData
      if (!meetingInfo.meetingUrl && meeting.location) {
        console.log('No conferenceData, trying location field:', meeting.location);
        const meetingUrl = extractMeetingUrl(meeting.location);
        if (meetingUrl) {
          meetingInfo.meetingUrl = meetingUrl.url;
          meetingInfo.platform = meetingUrl.platform;
          meetingInfo.platformIcon = meetingUrl.icon;
          console.log('Meeting URL extracted from location:', meetingUrl);
          console.log('Final meeting URL to be used:', meetingInfo.meetingUrl);
        }
      }
      
      return meetingInfo;
    });
    
    console.log('Final processed meetings:', processedMeetings);
    return processedMeetings;
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return { error: error.message };
  }
}

// Extract meeting URL and platform info from location field
function extractMeetingUrl(location) {
  if (!location) return null;
  
  console.log('Extracting meeting URL from:', location);
  
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
        console.log(`Found ${platform.name} meeting URL:`, match[0]);
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
    console.log('Found generic meeting URL:', genericMatch[0]);
    return {
      url: genericMatch[0],
      platform: 'Meeting',
      icon: '📹'
    };
  }
  
  console.log('No meeting URL found in location');
  return null;
}



// Get all tabs
async function getAllTabs() {
  try {
    console.log('getAllTabs called');
    const tabs = await chrome.tabs.query({});
    console.log('Raw tabs from chrome.tabs.query:', tabs);
    
    // Filter out bookmark tabs
    const filteredTabs = tabs.filter(tab => !bookmarkTabIds.has(tab.id));
    console.log('Filtered tabs:', filteredTabs);
    
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



 
 