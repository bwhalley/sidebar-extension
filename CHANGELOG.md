# Changelog

All notable changes to the Sidebar Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-19

### Added
- **Initial release** of the Sidebar Chrome Extension
- **Resizable sidebar** that pushes content right instead of overlapping
- **Real-time tab management** with favicons and titles
- **Drag-to-reorder tabs** with visual insertion indicators
- **Tab actions**: switch, close, and refresh tabs
- **Google Calendar integration** showing next 2 meetings
- **Bookmarks integration** from "Sidebar" folder
- **Custom new tab page** with integrated sidebar
- **Modern glassmorphism design** with backdrop blur effects
- **Collapsible sidebar** functionality
- **Active tab highlighting**
- **OAuth2 authentication** for Google Calendar
- **Smart calendar filtering** (excludes location status, shows multi-attendee meetings)
- **Responsive design** for different screen sizes
- **Error handling** and retry mechanisms
- **CSP-compliant** code with no inline scripts

### Technical Features
- **Manifest V3** compliance
- **Background service worker** for tab and calendar management
- **Content scripts** for web pages and new tab page
- **Chrome Extensions API** integration
- **Google Calendar API** integration
- **Bookmarks API** integration
- **Drag and drop** event handling
- **Debounced updates** for performance
- **Periodic sync** for real-time updates

### Security
- **Strict Content Security Policy**
- **OAuth2 authentication** for Google services
- **No inline scripts** or event handlers
- **Secure API communication**

## [0.9.0] - Development Phase

### Added
- Basic tab drawer functionality
- Google Calendar integration setup
- Bookmark integration
- Drag and drop tab reordering
- Tab grouping (removed due to stability issues)

### Changed
- Improved error handling and stability
- Enhanced UI/UX design
- Optimized performance with throttling
- Simplified architecture for better reliability

### Removed
- Tab grouping feature due to persistent Chrome API issues
- Complex operation locking system
- Custom tab tracking in favor of native Chrome APIs

---

## Version History Summary

### Major Features Implemented
1. **Tab Management**: Complete tab listing, switching, closing, and reordering
2. **Calendar Integration**: Google Calendar OAuth2 with meeting display
3. **Bookmarks**: Integration with Chrome bookmarks from "Sidebar" folder
4. **UI/UX**: Modern design with glassmorphism effects and smooth animations
5. **Performance**: Optimized updates with debouncing and throttling
6. **Security**: CSP compliance and secure API communication

### Technical Achievements
- Manifest V3 compliance
- Background service worker architecture
- Content script injection for web pages and new tab
- Chrome Extensions API integration
- Google Calendar API integration
- Drag and drop functionality
- Real-time synchronization

### Future Considerations
- Potential tab grouping reimplementation with improved Chrome API support
- Additional calendar features (event creation, multiple calendars)
- Enhanced bookmark management
- Theme customization options
- Performance optimizations for large numbers of tabs 