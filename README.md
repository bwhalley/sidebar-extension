# Sidebar - Chrome Extension

A powerful Chrome extension that adds a resizable sidebar to your browser with tab management, Google Calendar integration, and bookmark access.

## Features

### 🗂️ Tab Management
- **Real-time tab list** with favicons and titles, and interaction
- **Drag-to-reorder tabs** with visual insertion indicators
- **Tab actions**: switch, close, and refresh tabs
- **Active tab highlighting**
- **Resizable sidebar** that pushes content right

### 📅 Google Calendar Integration
- **Next 2 meetings** display
- **Meeting details**: time, duration, and attendee count
- **Click to open** meetings in Google Calendar, or click to start linked video conferencing. 
- **OAuth2 authentication** for secure access

### 🔖 Bookmarks
- **Sidebar folder integration** - displays bookmarks from "Sidebar" folder
- **Click to open** bookmarks in new tabs without cluttering the tab bar
- **Favicon display** for visual recognition

### 🎨 User Interface
- **Modern glassmorphism design** with backdrop blur effects
- **Collapsible sidebar** to save space
- **Smooth animations** and transitions
- **Responsive design** that works on different screen sizes
- **Dark theme** with translucent elements

## Installation

### From Source
1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/sidebar-extension.git
   cd sidebar-extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the extension directory

5. The sidebar will appear on all web pages and the new tab page

### Google Calendar Setup
1. Follow the instructions in [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md)
2. Add your Google Client ID to the manifest
3. Grant calendar permissions when prompted

## Usage

### Tab Management
- **Click a tab** to switch to it
- **Drag tabs** to reorder them in the browser
- **Click the × button** to close a tab
- **Click the ↻ button** to refresh a tab
- **Drag the right edge** to resize the sidebar

### Calendar
- **Click a meeting** to open it in Google Calendar
- **View next 2 meetings** with time and attendee info
- **Automatic refresh** every few minutes

### Bookmarks
- **Create a "Sidebar" folder** in your Chrome bookmarks
- **Add bookmarks** to this folder to see them in the sidebar
- **Click bookmarks** to open them in new tabs

## File Structure

```
sidebar-extension/
├── manifest.json          # Extension manifest
├── background.js          # Background service worker
├── content.js            # Content script for web pages
├── newtab.js             # Content script for new tab page
├── newtab.html           # New tab page template
├── drawer.css            # Styles for the sidebar
├── icon16.png            # Extension icons
├── icon48.png
├── icon128.png
├── README.md             # This file
├── GOOGLE_CALENDAR_SETUP.md  # Calendar setup instructions
└── .gitignore            # Git ignore rules
```

## Development

### Prerequisites
- Chrome browser
- Basic knowledge of JavaScript and Chrome Extensions API

### Local Development
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

### Building for Distribution
1. Create a ZIP file of the extension directory
2. Upload to Chrome Web Store (requires developer account)

## Configuration

### Manifest Settings
- **Permissions**: tabs, bookmarks, identity, calendar
- **Content Security Policy**: Strict CSP for security
- **OAuth2**: Google Calendar integration

### Customization
- **Colors**: Modify CSS variables in `drawer.css`
- **Size**: Adjust default width in content scripts
- **Features**: Enable/disable sections in the manifest

## Troubleshooting

### Common Issues
1. **Sidebar not appearing**: Check if extension is enabled
2. **Calendar not loading**: Verify OAuth2 setup
3. **Bookmarks not showing**: Ensure "Sidebar" folder exists
4. **Drag and drop not working**: Check console for errors

### Debug Mode
- Open Chrome DevTools
- Check the Console tab for detailed logs
- Look for extension-related messages

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Chrome Extensions API documentation
- Google Calendar API
- Glassmorphism design inspiration
- Open source community

## Support

If you encounter any issues or have questions:
1. Check the troubleshooting section
2. Search existing issues
3. Create a new issue with detailed information

---

**Note**: This extension requires appropriate permissions and may need to be updated for future Chrome versions. 