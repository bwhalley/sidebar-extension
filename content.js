// Content script that injects the tab drawer
class TabDrawer {
  constructor() {
    this.drawer = null;
    this.shadow = null;
    this.host = null;
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
    // Prevent running on Chrome's internal pages
    if (window.location.protocol === 'chrome:' || 
        window.location.protocol === 'chrome-extension:' ||
        window.location.protocol === 'moz-extension:' ||
        window.location.protocol === 'edge:') {
      return;
    }
    
    // Prevent multiple initializations
    if (this.initialized) {
      return;
    }
    
    // Create and inject the shadow host
    this.host = document.createElement('div');
    this.host.id = 'tab-drawer-host';
    document.body.appendChild(this.host);
    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Inject styles into shadow root
    const style = document.createElement('style');
    style.textContent = `
:host { all: initial; }

#tab-drawer {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 250px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  z-index: 999999;
  box-shadow: 2px 0 10px rgba(0,0,0,0.3);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  transition: all 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.drawer-header {
  padding: 12px 20px;
  background: rgba(255,255,255,0.1);
  border-bottom: 1px solid rgba(255,255,255,0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  backdrop-filter: blur(10px);
}

.drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: white;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}
.close-btn:hover { background: rgba(255,255,255,0.2); }

.calendar-section,
.bookmarks-section {
  border-bottom: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.05);
}

.calendar-header,
.bookmarks-header {
  padding: 15px 20px 10px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.calendar-header h4,
.bookmarks-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: white;
  opacity: 0.9;
}

.calendar-content,
.bookmarks-content {
  padding: 10px;
  overflow-y: auto;
}

.loading {
  text-align: center;
  padding: 20px;
  color: rgba(255,255,255,0.8);
  font-style: italic;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

/* Tab Items */
.tab-item {
  background: rgba(255,255,255,0.1);
  border-radius: 6px;
  margin: 2px 0;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(5px);
}
.tab-item.dragging { opacity: 0.5; transform: rotate(2deg); }
.tab-item.drag-over { background: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.6); transform: scale(1.02); position: relative; }
.tab-item.drag-over-before::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255,255,255,0.8);
  border-radius: 1px;
  z-index: 10;
  animation: insertionLine 0.2s ease;
}
.tab-item.drag-over-after::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255,255,255,0.8);
  border-radius: 1px;
  z-index: 10;
  animation: insertionLine 0.2s ease;
}
@keyframes insertionLine {
  from { opacity: 0; transform: scaleX(0); }
  to { opacity: 1; transform: scaleX(1); }
}
.tab-item:hover { background: rgba(255,255,255,0.2); transform: translateX(5px); }
.tab-item.active { background: rgba(255,255,255,0.25); border-color: rgba(255,255,255,0.4); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.tab-content {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}
.tab-favicon { width: 16px; height: 16px; border-radius: 2px; flex-shrink: 0; background: rgba(255,255,255,0.2); }
.tab-info { flex: 1; min-width: 0; overflow: hidden; }
.tab-title { font-size: 14px; font-weight: 500; color: white; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tab-url { font-size: 11px; color: rgba(255,255,255,0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tab-close { background: rgba(255,255,255,0.2); border: none; color: white; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; opacity: 0; flex-shrink: 0; }
.tab-item:hover .tab-close { opacity: 1; }
.tab-close:hover { background: rgba(255,0,0,0.8); transform: scale(1.1); }
.tab-refresh { background: rgba(255,255,255,0.2); border: none; color: white; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; opacity: 0; flex-shrink: 0; margin-right: 5px; }
.tab-item:hover .tab-refresh { opacity: 1; }
.tab-refresh:hover { background: rgba(0,255,0,0.8); transform: scale(1.1); }

/* Meeting Items */
.meeting-item {
  background: rgba(255,255,255,0.1);
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(5px);
}
.meeting-item:hover { background: rgba(255,255,255,0.2); transform: translateX(3px); }
.meeting-content { padding: 10px; display: flex; align-items: center; gap: 10px; }
.meeting-time { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); min-width: 50px; text-align: center; background: rgba(255,255,255,0.2); padding: 4px 6px; border-radius: 4px; }
.meeting-info { flex: 1; min-width: 0; overflow: hidden; }
.meeting-title { font-size: 13px; font-weight: 500; color: white; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meeting-duration { font-size: 11px; color: rgba(255,255,255,0.7); }
.meeting-platform { font-size: 18px; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s ease; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; flex-shrink: 0; }
.meeting-platform:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.meeting-platform[title*="Zoom"]:hover { background: rgba(0,122,255,0.3); }
.meeting-platform[title*="Google Meet"]:hover { background: rgba(0,150,136,0.3); }
.meeting-platform[title*="Microsoft Teams"]:hover { background: rgba(0,120,215,0.3); }
.meeting-platform[title*="Webex"]:hover { background: rgba(255,102,0,0.3); }
.meeting-platform[title*="Discord"]:hover { background: rgba(114,137,218,0.3); }
.meeting-platform[title*="Slack"]:hover { background: rgba(74,21,75,0.3); }
.meeting-platform[title*="Skype"]:hover { background: rgba(0,175,240,0.3); }
.calendar-error { text-align: center; padding: 15px; color: rgba(255,255,255,0.8); }
.error-message { margin-bottom: 10px; font-size: 12px; }
.retry-btn { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s ease; }
.retry-btn:hover { background: rgba(255,255,255,0.3); }
.no-meetings { text-align: center; padding: 20px; color: rgba(255,255,255,0.7); font-style: italic; font-size: 13px; }

/* Bookmarks */
.bookmark-item {
  background: rgba(255,255,255,0.1);
  border-radius: 6px;
  margin-bottom: 2px;
  padding: 2px 0;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(5px);
}
.bookmark-item:hover { background: rgba(255,255,255,0.2); transform: translateX(3px); }
.bookmark-content {
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.bookmark-favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  flex-shrink: 0;
}
.bookmark-title {
  font-size: 13px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bookmarks-error { text-align: center; padding: 15px; color: rgba(255,255,255,0.8); }
.no-bookmarks { text-align: center; padding: 20px; color: rgba(255,255,255,0.7); font-style: italic; font-size: 13px; }

/* Drawer Resizer */
.drawer-resizer { position: absolute; top: 0; right: 0; width: 4px; height: 100%; cursor: col-resize; background: rgba(255,255,255,0.1); transition: background-color 0.2s ease; }
.drawer-resizer:hover { background: rgba(255,255,255,0.3); }
.drawer-resizer::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 2px; height: 40px; background: rgba(255,255,255,0.5); border-radius: 1px; }

/* Responsive adjustments */
@media (max-width: 768px) {
  #tab-drawer { width: 200px; }
  .drawer-header { padding: 15px; }
  .drawer-header h3 { font-size: 16px; }
  .tab-content { padding: 10px; }
  .tab-title { font-size: 13px; }
  .tab-url { font-size: 10px; }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes tabUpdate {
  0% { background: rgba(255,255,255,0.3); }
  100% { background: rgba(255,255,255,0.1); }
}
.tab-item { animation: slideIn 0.3s ease; }
.tab-item.updating { animation: tabUpdate 0.5s ease; }
.tab-title, .tab-url, .tab-favicon { transition: all 0.2s ease; }
.tab-item:focus { outline: 2px solid rgba(255,255,255,0.5); outline-offset: 2px; }
.close-btn:focus, .tab-close:focus, .tab-refresh:focus { outline: 2px solid rgba(255,255,255,0.5); outline-offset: 2px; }

.bookmarks-content {
  padding: 10px;
  /* No max-height, no overflow */
}
`;
    this.shadow.appendChild(style);

    // Create and inject the drawer HTML into shadow root
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
    this.shadow.appendChild(this.drawer);

    // Set initial width and body margin
    this.drawer.style.width = `${this.defaultWidth}px`;
    document.body.style.marginLeft = `${this.defaultWidth}px`;

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

    // Ensure all .dragging classes are removed on dragend, even if drag leaves the shadow root
    this.shadow.addEventListener('dragend', () => {
      this.shadow.querySelectorAll('.tab-item.dragging').forEach(el => el.classList.remove('dragging'));
      this.shadow.querySelectorAll('.tab-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  }

  cleanup() {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    // Remove global resize listeners
    if (this._onWindowMouseMove) window.removeEventListener('mousemove', this._onWindowMouseMove);
    if (this._onWindowMouseUp) window.removeEventListener('mouseup', this._onWindowMouseUp);
    this.initialized = false;
  }

  async loadTabs() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
      if (response && response.tabs) {
        this.updateTabs(response.tabs);
      } else {
        console.error('Invalid response from background script:', response);
      }
    } catch (error) {
      console.error('Failed to load tabs:', error);
      // If extension context is invalidated, try to reinitialize
      if (error.message.includes('Extension context invalidated')) {
        setTimeout(() => {
          this.cleanup();
          this.init();
        }, 1000);
      }
    }
  }

  async loadCalendar() {
    try {
      // Test if background script is working at all
      try {
        const testResponse = await chrome.runtime.sendMessage({ action: 'test' });
      } catch (testError) {
        this.updateCalendar({ error: 'Extension not responding. Please reload the page.' });
        return;
      }
      
      const response = await chrome.runtime.sendMessage({ action: 'getNextMeetings' });
      if (response) {
        this.updateCalendar(response.meetings);
      } else {
        console.error('No response received for calendar');
        this.updateCalendar({ error: 'No response from background script' });
      }
    } catch (error) {
      // If extension context is invalidated, show error
      if (error.message.includes('Extension context invalidated')) {
        this.updateCalendar({ error: 'Extension context invalidated. Please reload the page.' });
        return;
      }
      this.updateCalendar({ error: error.message });
    }
  }

  async loadBookmarks() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSidebarBookmarks' });
      if (response && response.bookmarks) {
        this.updateBookmarks(response.bookmarks);
      } else {
        console.error('Invalid bookmarks response:', response);
      }
    } catch (error) {
      // If extension context is invalidated, don't retry bookmarks
      if (error.message.includes('Extension context invalidated')) {
        return;
      }
    }
  }

  updateTabs(tabs) {
    const content = this.shadow.getElementById('drawer-content');
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
    const content = this.shadow.getElementById('calendar-content');
    if (!content) {
      return;
    }

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
    const content = this.shadow.getElementById('bookmarks-content');
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
        <div class="bookmark-title" title="${bookmark.title}">${this.truncateTitle(bookmark.title)}</div>
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
        setTimeout(() => {
          this.cleanup();
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
        setTimeout(() => {
          this.cleanup();
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
        setTimeout(() => {
          this.cleanup();
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
      // Set a transparent drag image to prevent favicon ghost
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
      e.dataTransfer.setDragImage(img, 0, 0);
    });

    tabElement.addEventListener('dragend', (e) => {
      this.shadow.querySelectorAll('.tab-item.dragging').forEach(el => el.classList.remove('dragging'));
      this.shadow.querySelectorAll('.tab-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    tabElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Remove drag-over from all other tabs
      this.shadow.querySelectorAll('.tab-item.drag-over').forEach(el => {
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
      
      if (draggedTabId && targetTabId && draggedTabId !== targetTabId) {
        // Determine insertion position based on mouse position
        const rect = tabElement.getBoundingClientRect();
        const mouseY = e.clientY;
        const tabCenter = rect.top + rect.height / 2;
        const insertBefore = mouseY < tabCenter;
        
        await this.handleTabDrop(draggedTabId, targetTabId, insertBefore);
      } else {
        console.log('Invalid drop: same tab or missing data');
      }
    });
  }

  async handleTabDrop(draggedTabId, targetTabId, insertBefore) {
    try {
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
    const closeBtn = this.shadow.getElementById('drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.drawer.classList.toggle('collapsed');
        document.body.classList.toggle('drawer-collapsed');
      });
    }

    // Resizer
    const resizer = this.shadow.getElementById('drawer-resizer');
    if (resizer) {
      resizer.addEventListener('mousedown', (e) => {
        this.startResize(e);
      });
    }

    // Global mouse events for resizing (window-level for Shadow DOM)
    this._onWindowMouseMove = (e) => {
      if (this.isResizing) {
        this.resize(e);
      }
    };
    this._onWindowMouseUp = () => {
      if (this.isResizing) {
        this.stopResize();
      }
    };
    window.addEventListener('mousemove', this._onWindowMouseMove);
    window.addEventListener('mouseup', this._onWindowMouseUp);
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

function waitForBodyAndInitSidebar() {
  if (document.body) {
    if (!document.getElementById('tab-drawer-host')) {
      new TabDrawer();
    }
  } else {
    // Try again soon
    setTimeout(waitForBodyAndInitSidebar, 20);
  }
}

waitForBodyAndInitSidebar(); 