# Class2Calendar Verification Checklist

Complete these items before/during OAuth verification and Chrome Web Store submission.

---

## Phase 1: Google Cloud Console Setup

### OAuth Consent Screen
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > OAuth consent screen
- [ ] Set User Type to **External**
- [ ] Fill in required fields:
  - [ ] App name: `Class2Calendar`
  - [ ] User support email
  - [ ] App logo (512x512 PNG)
  - [ ] Application home page URL
  - [ ] Privacy policy URL (must be publicly accessible)
  - [ ] Terms of Service URL (optional but recommended)
  - [ ] Developer contact email

### Scopes Configuration
- [ ] Add the following scopes with justifications:
  | Scope | Justification |
  |-------|--------------|
  | `calendar.events` | Create/update/delete calendar events synced from Canvas |
  | `tasks` | Create/update/delete tasks synced from Canvas assignments |
  | `userinfo.email` | Identify user account for data storage |
  | `userinfo.profile` | Display user name/photo in extension UI |

### Credentials
- [ ] Create OAuth 2.0 Client ID (Chrome Extension type)
- [ ] Add your extension ID to authorized origins
- [ ] Download and securely store credentials

---

## Phase 2: Extension Preparation

### Manifest Updates
- [ ] Add fixed extension key for consistent ID:
  ```json
  "key": "YOUR_PUBLIC_KEY_HERE"
  ```
- [ ] Verify all permissions are necessary
- [ ] Update version number for release

### Privacy & Legal
- [ ] Privacy policy hosted at public URL
- [ ] Privacy policy covers:
  - [ ] What data is collected (Google account, Canvas calendar)
  - [ ] How data is used (sync to Google Calendar/Tasks)
  - [ ] Data storage (local Chrome storage, Supabase)
  - [ ] Third-party services (Google APIs, Supabase)
  - [ ] User rights (data deletion, opt-out)
- [ ] Terms of Service (optional)

### Assets
- [ ] Extension icon (128x128 and 48x48 PNG)
- [ ] Promotional images for Chrome Web Store:
  - [ ] Small tile: 440x280
  - [ ] Large tile: 920x680
  - [ ] Screenshots: 1280x800 or 640x400
- [ ] Demo video (required for sensitive scopes)

---

## Phase 3: OAuth Verification Submission

### Prepare Documentation
- [ ] Write scope justification document explaining why each scope is needed
- [ ] Record demo video (2-5 minutes) showing:
  - [ ] User signs in with Google
  - [ ] Calendar events being synced
  - [ ] Tasks being created
  - [ ] How user data is protected

### Submit for Verification
- [ ] Go to OAuth consent screen > Publish App
- [ ] Submit for verification
- [ ] Respond promptly to any Google reviewer questions

> **Timeline**: OAuth verification typically takes 2-6 weeks

---

## Phase 4: Chrome Web Store Submission

### Developer Account
- [ ] Register for [Chrome Web Store Developer](https://chrome.google.com/webstore/developer/dashboard)
- [ ] Pay one-time $5 registration fee
- [ ] Verify account email

### Store Listing
- [ ] Detailed description (explain value proposition)
- [ ] Category: Productivity
- [ ] Language: English (add others as needed)
- [ ] Upload all promotional images
- [ ] Add screenshots with captions

### Upload Extension
- [ ] Build production bundle: `pnpm build`
- [ ] Create ZIP of `dist/` folder
- [ ] Upload to Chrome Web Store
- [ ] Fill in permissions justification for each permission:
  | Permission | Justification |
  |------------|--------------|
  | `storage` | Store user preferences and sync state locally |
  | `identity` | Authenticate with Google account |
  | `alarms` | Schedule automatic background syncs |
  | `tabs` | Open OAuth authentication flow |
  | `notifications` | Alert user of sync status |

### Review & Publish
- [ ] Submit for review
- [ ] Respond to any reviewer feedback

> **Timeline**: Chrome Web Store review typically takes 1-3 business days

---

## Quick Reference

### Key URLs to Prepare
| Item | Example URL |
|------|-------------|
| Privacy Policy | `https://yoursite.com/privacy` |
| Terms of Service | `https://yoursite.com/terms` |
| Homepage | `https://yoursite.com` |
| Support Email | `support@yoursite.com` |

### Environment Checklist
- [ ] Production Supabase instance configured
- [ ] Production environment variables set
- [ ] API keys rotated from development
- [ ] Error monitoring in place (optional but recommended)

---

## Post-Launch
- [ ] Monitor error reports
- [ ] Respond to user reviews
- [ ] Plan first update with bug fixes
