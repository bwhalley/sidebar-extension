# Google Calendar Setup Guide

This guide will help you set up Google Calendar integration for the Sidebar extension.

## Prerequisites

- A Google account
- Access to Google Cloud Console
- Basic understanding of OAuth2

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top of the page
3. Click "New Project"
4. Enter a project name (e.g., "Sidebar Extension")
5. Click "Create"

## Step 2: Enable the Google Calendar API

1. In your new project, go to the [API Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Calendar API"
3. Click on "Google Calendar API"
4. Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to the [Credentials page](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - **User Type**: External
   - **App name**: Sidebar Extension
   - **User support email**: Your email
   - **Developer contact information**: Your email
   - **Scopes**: Add `https://www.googleapis.com/auth/calendar.readonly`
4. Click "Save and Continue" through the remaining steps
5. Back on the credentials page, click "Create Credentials" → "OAuth client ID"
6. Choose "Chrome Extension" as the application type
7. Enter a name (e.g., "Sidebar Extension")
8. For "Application ID", you'll need to get your extension ID:
   - Load the extension in Chrome
   - Go to `chrome://extensions/`
   - Find your extension and copy the ID (long string of letters/numbers)
9. Paste the extension ID into the "Application ID" field
10. Click "Create"

## Step 4: Update the Extension

1. Copy the generated Client ID
2. Open `manifest.json` in your extension
3. Replace the placeholder `client_id` with your actual Client ID:

```json
{
  "oauth2": {
    "client_id": "YOUR_ACTUAL_CLIENT_ID_HERE.apps.googleusercontent.com"
  }
}
```

## Step 5: Test the Integration

1. Reload the extension in Chrome
2. Open any webpage
3. The sidebar should now show a "Calendar" section
4. Click "Connect Calendar" to authenticate
5. Grant the requested permissions
6. Your next 2 meetings should appear in the sidebar

## Troubleshooting

### "Invalid client" Error
- Ensure the extension ID in Google Cloud Console matches your actual extension ID
- Check that you're using the correct Client ID in manifest.json

### "Access denied" Error
- Make sure you've enabled the Google Calendar API
- Verify the OAuth consent screen is configured correctly
- Check that the required scopes are added

### No Calendar Data
- Ensure you have calendar events with multiple attendees
- Check that the events are within the next 24 hours
- Verify your Google account has access to the calendar

### Extension Not Loading
- Check the browser console for any JavaScript errors
- Ensure all manifest.json syntax is correct
- Verify the extension is properly loaded in Chrome

## Security Notes

- Never commit your Client ID to public repositories
- Consider using environment variables for production builds
- Regularly rotate your OAuth credentials
- Monitor API usage in Google Cloud Console

## API Quotas

The Google Calendar API has quotas:
- 1,000,000 requests per day (free tier)
- 10,000 requests per 100 seconds per user
- Monitor usage in Google Cloud Console

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify all setup steps were completed correctly
3. Test with a simple calendar event first
4. Check Google Cloud Console for API errors

For more information, see the [Google Calendar API documentation](https://developers.google.com/calendar/api). 