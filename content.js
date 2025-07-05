// Content script that injects the tab drawer
class TabDrawer {
  constructor() {
    this.drawer = null;
    this.isResizing = false;
    this.startX = 0;
    this.startWidth = 0;
    this.minWidth = 200;
    this.maxWidth = 400;
    this.defaultWidth = 250;
    this.lastTabStructure = '';
    
    this.init();
  }

  init() {
    // Prevent multiple initializations
    if (this.initialized) {
      return;
    }
    
    // Create and inject the drawer
    this.createDrawer();
    this.loadTabs();
    this.loadCalendar();
    this.loadBookmarks();
    this.setupEventListeners();
    
    // Listen for tab updates from background
    this.messageListener = (request, sender, sendResponse) => {
      if (request.action === 'tabsUpdated') {
        this.updateTabs(request.tabs);
      }
    };
    chrome.runtime.onMessage.addListener(this.messageListener);
    
    // Periodic refresh to ensure sync (every 500ms to prevent flickering)
    this.updateInterval = setInterval(() => {
      this.loadTabs();
    }, 250);
    
    this.initialized = true;
  }

  cleanup() {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.initialized = false;
  }

  createDrawer() {
    // Create drawer container
    this.drawer = document.createElement('div');
    this.drawer.id = 'tab-drawer';
    this.drawer.innerHTML = `
      <div class="drawer-header">
        <h3>Sidebar</h3>
        <button class="close-btn" id="drawer-close">×</button>
      </div>
      <div class="calendar-section" id="calendar-section">
        <div class="calendar-header">
          <h4>📅 Calendar</h4>
        </div>
        <div class="calendar-content" id="calendar-content">
          <div class="loading">Loading calendar...</div>
        </div>
      </div>
      <div class="bookmarks-section" id="bookmarks-section">
        <div class="bookmarks-header">
          <h4>🔖 Bookmarks</h4>
        </div>
        <div class="bookmarks-content" id="bookmarks-content">
          <div class="loading">Loading bookmarks...</div>
        </div>
      </div>
      <div class="drawer-content" id="drawer-content">
        <div class="loading">Loading tabs...</div>
      </div>
      <div class="drawer-resizer" id="drawer-resizer"></div>
    `;
    
    // Ensure body exists and add to page
    if (document.body) {
      document.body.appendChild(this.drawer);
    } else {
      // Fallback: wait for body to be available
      const observer = new MutationObserver((mutations, obs) => {
        if (document.body) {
          document.body.appendChild(this.drawer);
          obs.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
    
    // Set initial width and body margin
    this.drawer.style.width = `${this.defaultWidth}px`;
    document.body.style.marginLeft = `${this.defaultWidth}px`;
  }

  async loadTabs() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
      this.updateTabs(response.tabs);
    } catch (error) {
      console.error('Failed to load tabs:', error);
      // If extension context is invalidated, try to reinitialize
      if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated, attempting to reinitialize...');
        this.cleanup();
        setTimeout(() => {
          this.init();
        }, 1000);
      }
    }
  }

  async loadCalendar() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getNextMeetings' });
      this.updateCalendar(response.meetings);
    } catch (error) {
      console.error('Failed to load calendar:', error);
      // If extension context is invalidated, don't retry calendar
      if (error.message.includes('Extension context invalidated')) {
        return;
      }
    }
  }

  async loadBookmarks() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSidebarBookmarks' });
      this.updateBookmarks(response.bookmarks);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      // If extension context is invalidated, don't retry bookmarks
      if (error.message.includes('Extension context invalidated')) {
        return;
      }
    }
  }

  updateTabs(tabs) {
    const content = document.getElementById('drawer-content');
    if (!content) return;

    // Build a string representing the current tab order
    const structure = tabs.map(tab => tab.id).join('|');

    if (this.lastTabStructure === structure) {
      // Only update tab properties (title, favicon, active state)
      const currentTabs = Array.from(content.querySelectorAll('.tab-item'));
      this.updateExistingTabs(tabs, currentTabs);
    } else {
      // Order changed, rebuild
      this.rebuildTabList(tabs, content);
      this.lastTabStructure = structure;
    }
  }



  // Helper function to compare arrays
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // Update existing tabs (faster than rebuilding)
  updateExistingTabs(tabs, currentTabs) {
    tabs.forEach((tab, index) => {
      if (currentTabs[index]) {
        const tabElement = currentTabs[index];
        const titleElement = tabElement.querySelector('.tab-title');
        const urlElement = tabElement.querySelector('.tab-url');
        const faviconElement = tabElement.querySelector('.tab-favicon');
        
        let hasChanges = false;
        
        // Update active state
        const wasActive = tabElement.classList.contains('active');
        const isActive = tab.active;
        if (wasActive !== isActive) {
          tabElement.classList.toggle('active', isActive);
          hasChanges = true;
        }
        
        // Update title if changed
        if (titleElement.textContent !== this.truncateTitle(tab.title)) {
          titleElement.textContent = this.truncateTitle(tab.title);
          titleElement.title = tab.title;
          hasChanges = true;
        }
        
        // Update URL if changed
        const newUrl = this.truncateUrl(tab.url);
        if (urlElement.textContent !== newUrl) {
          urlElement.textContent = newUrl;
          urlElement.title = tab.url;
          hasChanges = true;
        }
        
        // Update favicon if changed
        const faviconUrl = tab.favIconUrl || this.getDefaultFavicon(tab.url);
        if (faviconElement.src !== faviconUrl) {
          faviconElement.src = faviconUrl;
          hasChanges = true;
        }
        
        // Add visual feedback for changes
        if (hasChanges) {
          tabElement.classList.add('updating');
          setTimeout(() => {
            tabElement.classList.remove('updating');
          }, 500);
        }
      }
    });
  }

  // Rebuild the entire tab list
  rebuildTabList(tabs, content) {
    content.innerHTML = '';
    
    // Add all tabs in order
    tabs.forEach(tab => {
      const tabElement = this.createTabElement(tab);
      content.appendChild(tabElement);
    });
  }

  updateCalendar(meetings) {
    const content = document.getElementById('calendar-content');
    if (!content) return;

    if (meetings.error) {
      content.innerHTML = `
        <div class="calendar-error">
          <div class="error-message">${meetings.error}</div>
          <button class="retry-btn" data-action="retry-calendar">Retry</button>
        </div>
      `;
      
      // Add event listener for retry button
      const retryBtn = content.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.loadCalendar();
        });
      }
      return;
    }

    if (!meetings || meetings.length === 0) {
      content.innerHTML = '<div class="no-meetings">No meetings scheduled for today</div>';
      return;
    }

    content.innerHTML = '';
    
    meetings.forEach(meeting => {
      const meetingElement = this.createMeetingElement(meeting);
      content.appendChild(meetingElement);
    });
  }

  updateBookmarks(bookmarks) {
    const content = document.getElementById('bookmarks-content');
    if (!content) return;

    if (bookmarks.error) {
      content.innerHTML = `
        <div class="bookmarks-error">
          <div class="error-message">${bookmarks.error}</div>
          <button class="retry-btn" data-action="retry-bookmarks">Retry</button>
        </div>
      `;
      
      // Add event listener for retry button
      const retryBtn = content.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.loadBookmarks();
        });
      }
      return;
    }

    if (!bookmarks || bookmarks.length === 0) {
      content.innerHTML = '<div class="no-bookmarks">No bookmarks in Sidebar folder</div>';
      return;
    }

    content.innerHTML = '';
    
    bookmarks.forEach(bookmark => {
      const bookmarkElement = this.createBookmarkElement(bookmark);
      content.appendChild(bookmarkElement);
    });
  }

  createTabElement(tab) {
    const tabDiv = document.createElement('div');
    tabDiv.className = `tab-item ${tab.active ? 'active' : ''}`;
    tabDiv.dataset.tabId = tab.id;
    tabDiv.draggable = true;
    
    // Get favicon URL
    const faviconUrl = tab.favIconUrl || this.getDefaultFavicon(tab.url);
    
    tabDiv.innerHTML = `
      <div class="tab-content">
        <img class="tab-favicon" src="${faviconUrl}" alt="favicon">
        <div class="tab-info">
          <div class="tab-title" title="${tab.title}">${this.truncateTitle(tab.title)}</div>
          <div class="tab-url" title="${tab.url}">${this.truncateUrl(tab.url)}</div>
        </div>
        <button class="tab-refresh" data-tab-id="${tab.id}" title="Refresh">↻</button>
        <button class="tab-close" data-tab-id="${tab.id}">×</button>
      </div>
    `;
    
    // Add click handlers
    tabDiv.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close') && !e.target.classList.contains('tab-refresh')) {
        this.switchToTab(tab.id);
      }
    });
    
    const refreshBtn = tabDiv.querySelector('.tab-refresh');
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.refreshTab(tab.id);
    });
    
    const closeBtn = tabDiv.querySelector('.tab-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });
    
    // Add error handler for favicon
    const faviconElement = tabDiv.querySelector('.tab-favicon');
    faviconElement.addEventListener('error', () => {
      faviconElement.style.display = 'none';
    });
    
    // Add drag and drop handlers
    this.setupTabDragAndDrop(tabDiv, tab);
    
    return tabDiv;
  }

  createMeetingElement(meeting) {
    const meetingDiv = document.createElement('div');
    meetingDiv.className = 'meeting-item';
    
    const startTime = new Date(meeting.start.dateTime || meeting.start.date);
    const endTime = new Date(meeting.end.dateTime || meeting.end.date);
    
    const timeString = startTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    
    const duration = Math.round((endTime - startTime) / (1000 * 60)); // minutes
    const attendeeCount = meeting.attendees ? meeting.attendees.length : 0;
    
    // Check if meeting has a platform URL
    const hasMeetingUrl = meeting.meetingUrl && meeting.platform;
    
    meetingDiv.innerHTML = `
      <div class="meeting-content">
        <div class="meeting-time">${timeString}</div>
        <div class="meeting-info">
          <div class="meeting-title" title="${meeting.summary}">${this.truncateTitle(meeting.summary)}</div>
          <div class="meeting-duration">${duration} min • ${attendeeCount} people</div>
        </div>
        ${hasMeetingUrl ? `<div class="meeting-platform" title="Join ${meeting.platform} meeting">${meeting.platformIcon}</div>` : ''}
      </div>
    `;
    
    // Add click handlers
    if (hasMeetingUrl) {
      // If there's a meeting URL, clicking the platform icon opens the meeting
      const platformIcon = meetingDiv.querySelector('.meeting-platform');
      platformIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(meeting.meetingUrl, '_blank');
      });
      
      // Clicking the rest of the meeting opens Google Calendar
      meetingDiv.addEventListener('click', (e) => {
        if (!e.target.classList.contains('meeting-platform')) {
          if (meeting.htmlLink) {
            window.open(meeting.htmlLink, '_blank');
          }
        }
      });
    } else {
      // If no meeting URL, clicking anywhere opens Google Calendar
      meetingDiv.addEventListener('click', () => {
        if (meeting.htmlLink) {
          window.open(meeting.htmlLink, '_blank');
        }
      });
    }
    
    return meetingDiv;
  }

  createBookmarkElement(bookmark) {
    const bookmarkDiv = document.createElement('div');
    bookmarkDiv.className = 'bookmark-item';
    
    // Get favicon URL
    const faviconUrl = this.getDefaultFavicon(bookmark.url);
    
    bookmarkDiv.innerHTML = `
      <div class="bookmark-content">
        <img class="bookmark-favicon" src="${faviconUrl}" alt="favicon">
        <div class="bookmark-info">
          <div class="bookmark-title" title="${bookmark.title}">${this.truncateTitle(bookmark.title)}</div>
          <div class="bookmark-url" title="${bookmark.url}">${this.truncateUrl(bookmark.url)}</div>
        </div>
      </div>
    `;
    
    // Add error handler for favicon
    const bookmarkFavicon = bookmarkDiv.querySelector('.bookmark-favicon');
    bookmarkFavicon.addEventListener('error', () => {
      bookmarkFavicon.style.display = 'none';
    });
    
    // Add click handler to open bookmark in special background tab
    bookmarkDiv.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'createBookmarkTab',
        url: bookmark.url,
        title: bookmark.title
      });
    });
    
    return bookmarkDiv;
  }

  getDefaultFavicon(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
    } catch {
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ccc"/></svg>';
    }
  }

  truncateTitle(title) {
    return title.length > 30 ? title.substring(0, 30) + '...' : title;
  }

  truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url.length > 25 ? url.substring(0, 25) + '...' : url;
    }
  }

  async switchToTab(tabId) {
    try {
      await chrome.runtime.sendMessage({ action: 'switchTab', tabId });
    } catch (error) {
      console.error('Failed to switch tab:', error);
      // If extension context is invalidated, try to reinitialize
      if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated, attempting to reinitialize...');
        this.cleanup();
        setTimeout(() => {
          this.init();
        }, 1000);
      }
    }
  }

  async closeTab(tabId) {
    try {
      await chrome.runtime.sendMessage({ action: 'closeTab', tabId });
    } catch (error) {
      console.error('Failed to close tab:', error);
      // If extension context is invalidated, try to reinitialize
      if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated, attempting to reinitialize...');
        this.cleanup();
        setTimeout(() => {
          this.init();
        }, 1000);
      }
    }
  }

  async refreshTab(tabId) {
    try {
      await chrome.runtime.sendMessage({ action: 'refreshTab', tabId });
    } catch (error) {
      console.error('Failed to refresh tab:', error);
      // If extension context is invalidated, try to reinitialize
      if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated, attempting to reinitialize...');
        this.cleanup();
        setTimeout(() => {
          this.init();
        }, 1000);
      }
    }
  }

  setupTabDragAndDrop(tabElement, tab) {
    tabElement.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', tab.id.toString());
      e.dataTransfer.effectAllowed = 'move';
      tabElement.classList.add('dragging');
    });

    tabElement.addEventListener('dragend', (e) => {
      tabElement.classList.remove('dragging');
      // Remove all drag-over classes when drag ends
      document.querySelectorAll('.tab-item.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });

    tabElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Remove drag-over from all other tabs
      document.querySelectorAll('.tab-item.drag-over').forEach(el => {
        if (el !== tabElement) {
          el.classList.remove('drag-over');
        }
      });
      
      // Determine insertion position based on mouse position
      const rect = tabElement.getBoundingClientRect();
      const mouseY = e.clientY;
      const tabCenter = rect.top + rect.height / 2;
      
      // Remove any existing position classes
      tabElement.classList.remove('drag-over-before', 'drag-over-after');
      
      // Add drag-over class and position class
      tabElement.classList.add('drag-over');
      if (mouseY < tabCenter) {
        tabElement.classList.add('drag-over-before');
      } else {
        tabElement.classList.add('drag-over-after');
      }
    });

    tabElement.addEventListener('dragleave', (e) => {
      // Only remove drag-over if we're actually leaving the element
      // (not just moving to a child element)
      if (!tabElement.contains(e.relatedTarget)) {
        tabElement.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
      }
    });

    tabElement.addEventListener('drop', async (e) => {
      e.preventDefault();
      tabElement.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
      
      const draggedTabId = parseInt(e.dataTransfer.getData('text/plain'));
      const targetTabId = tab.id;
      
      console.log(`Drop event: dragged=${draggedTabId}, target=${targetTabId}`);
      
      if (draggedTabId && targetTabId && draggedTabId !== targetTabId) {
        // Determine insertion position based on mouse position
        const rect = tabElement.getBoundingClientRect();
        const mouseY = e.clientY;
        const tabCenter = rect.top + rect.height / 2;
        const insertBefore = mouseY < tabCenter;
        
        console.log(`Mouse position: ${mouseY}, tab center: ${tabCenter}, insertBefore: ${insertBefore}`);
        
        await this.handleTabDrop(draggedTabId, targetTabId, insertBefore);
      } else {
        console.log('Invalid drop: same tab or missing data');
      }
    });
  }

  async handleTabDrop(draggedTabId, targetTabId, insertBefore) {
    try {
      console.log(`Handling tab drop: ${draggedTabId} -> ${targetTabId}, insertBefore: ${insertBefore}`);
      
      // Get all tabs to find the target index
      const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
      const tabs = response.tabs;
      
      // Find both the dragged and target tabs
      const draggedTab = tabs.find(tab => tab.id === draggedTabId);
      const targetTab = tabs.find(tab => tab.id === targetTabId);
      
      if (!draggedTab || !targetTab) {
        console.error('Could not find dragged or target tab:', { draggedTabId, targetTabId });
        return;
      }
      
      // Safety check: don't move if it's the same tab
      if (draggedTabId === targetTabId) {
        console.log('Same tab, no move needed');
        return;
      }
      
      // Calculate the correct target index based on insertion position
      let targetIndex = targetTab.index;
      
      // If inserting after, increment the index
      if (!insertBefore) {
        targetIndex = targetTab.index + 1;
      }
      
      // Safety check: if dragging forward, account for the tab being removed
      if (draggedTab.index < targetTab.index && insertBefore) {
        targetIndex = targetTab.index - 1;
      }
      
      // Ensure target index is within bounds
      targetIndex = Math.max(0, Math.min(targetIndex, tabs.length));
      
      console.log(`Moving tab ${draggedTabId} from index ${draggedTab.index} to index ${targetIndex}`);
      
      // Move the dragged tab to the target position
      const moveResponse = await chrome.runtime.sendMessage({
        action: 'moveTab',
        tabId: draggedTabId,
        targetIndex: targetIndex
      });
      
      if (moveResponse && !moveResponse.success) {
        console.error('Move tab failed:', moveResponse.error);
      } else {
        console.log('Tab move successful');
      }
    } catch (error) {
      console.error('Failed to handle tab drop:', error);
    }
  }



  setupEventListeners() {
    // Close button
    const closeBtn = document.getElementById('drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.drawer.classList.toggle('collapsed');
        document.body.classList.toggle('drawer-collapsed');
      });
    }

    // Resizer
    const resizer = document.getElementById('drawer-resizer');
    if (resizer) {
      resizer.addEventListener('mousedown', (e) => {
        this.startResize(e);
      });
    }

    // Global mouse events for resizing
    document.addEventListener('mousemove', (e) => {
      if (this.isResizing) {
        this.resize(e);
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.isResizing) {
        this.stopResize();
      }
    });
  }

  startResize(e) {
    this.isResizing = true;
    this.startX = e.clientX;
    this.startWidth = parseInt(this.drawer.style.width);
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  }

  resize(e) {
    const deltaX = e.clientX - this.startX;
    const newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, this.startWidth + deltaX));
    this.drawer.style.width = `${newWidth}px`;
    document.body.style.marginLeft = `${newWidth}px`;
  }

  stopResize() {
    this.isResizing = false;
    document.body.style.cursor = '';
  }
}

// Multiple initialization strategies to ensure drawer appears on all pages
function initializeDrawer() {
  // Check if drawer already exists to prevent duplicates
  if (document.getElementById('tab-drawer')) {
    return;
  }
  
  try {
    new TabDrawer();
  } catch (error) {
    console.error('Failed to initialize TabDrawer:', error);
  }
}

// Strategy 1: Immediate initialization if document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDrawer);
} else {
  initializeDrawer();
}

// Strategy 2: Fallback for pages that load content dynamically
document.addEventListener('readystatechange', () => {
  if (document.readyState === 'complete' && !document.getElementById('tab-drawer')) {
    setTimeout(initializeDrawer, 100);
  }
});

// Strategy 3: Additional fallback for SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(initializeDrawer, 100);
  }
}).observe(document, { subtree: true, childList: true });

// Strategy 4: Ensure drawer exists after a short delay
setTimeout(() => {
  if (!document.getElementById('tab-drawer')) {
    initializeDrawer();
  }
}, 500); 