# Project Documentation

## API Structure

```
api
├─ auth
│   ├─ GET /auth/google               # start OAuth
│   └─ GET /auth/callback             # OAuth callback
│
├─ calendar
│   ├─ GET /calendar                  # fetch the user's single calendar
│   ├─ POST /calendar                 # create the user's calendar (if not exists)
│   │
│   └─ events
│       ├─ GET /calendar/events                  # list all events in the calendar
│       ├─ POST /calendar/events                 # create a new event
│       ├─ PATCH /calendar/events/:id           # update an event
│       └─ DELETE /calendar/events/:id          # delete an event
│
└─ tasks
    ├─ GET /tasks                      # list all task lists for the user
    ├─ POST /tasks                     # create a new task list
    ├─ PATCH /tasks/:taskListId        # update task list info (name, order)
    ├─ DELETE /tasks/:taskListId       # delete a task list
    │
    └─ items
        ├─ GET /tasks/:taskListId/items         # list tasks in a list
        ├─ POST /tasks/:taskListId/items        # create a new task
        ├─ PATCH /tasks/:taskListId/items/:id  # update a task
        └─ DELETE /tasks/:taskListId/items/:id # delete a task
```

---

## Full List of Routes

/auth/google [GET]  
/auth/callback [GET]  
/calendar [GET, POST]  
/calendar/events [GET, POST]  
/calendar/events/:id [PATCH, DELETE]  
/tasks [GET, POST]  
/tasks/:taskListId [PATCH, DELETE]  
/tasks/:taskListId/items [GET, POST]  
/tasks/:taskListId/items/:id [PATCH, DELETE]  

---

## Project Architecture & Design Decisions

### Client-Side ICS Parsing
- **Why:** Keeps user's ICS feed data private (never hits our server)  
- **Why:** Reduces server load and costs — parsing happens on user's machine  
- **Why:** Allows for custom filtering logic without server-side complexity  
- **Why:** User can apply Canvas-specific filters (classes vs assignments vs quizzes) locally before syncing  

### One Calendar Per User (MVP)
- **Why:** Simplifies the data model and API routes significantly  
- **Why:** Most users will only need one "synced" calendar  
- **Tradeoff:** Less flexible, but easier to build and maintain initially  

### Multiple Task Lists Supported
- **Why:** Google Tasks API naturally organizes tasks into lists  
- **Why:** Users may want to separate different types of tasks (assignments, quizzes, exams)  
- **Default handling:** We create/store a default task list ID for items that don't have a specific destination  

### Local Hash Storage (Extension)
- **Why:** Enables efficient change detection without fetching all events from Google every sync  
- **Why:** Extension compares new ICS parse against stored hashes to determine what changed  
- **Why:** Only makes API calls for events that were added/modified/deleted  
- **How it works:**  
  1. Parse ICS → compute hash for each event  
  2. Compare against locally stored hash map  
  3. Call API only for differences (create/update/delete)  
- **Storage location:** Browser extension's local storage (or IndexedDB if needed)  

### Individual API Calls (Not Batched)
- **Why:** Simpler API design and error handling  
- **Why:** Each operation is independent (one failure doesn't break others)  
- **Why:** Modern HTTP/2 handles parallel requests efficiently  
- **Future consideration:** Can add batch endpoints later if sync performance becomes an issue  

### Manual Sync Button (MVP)
- **Why:** Avoids race conditions and complexity of automatic syncing  
- **Why:** Gives users control over when syncing happens  
- **Future consideration:** Can add automatic syncing (on interval or ICS feed change detection) post-MVP  

### Express API + PostgreSQL + Prisma
- **Why Express:** Familiar, well-documented, good for OAuth flows  
- **Why PostgreSQL:** Relational data (users → calendars → events) fits well  
- **Why Prisma:** Type-safe database access, easy migrations, plays well with TypeScript  

### Chrome Extension Boilerplate (React + Vite)
- **Why:** Modern dev experience with fast builds  
- **Why React:** Makes complex UI (filter configuration, sync status) easier  
- **Why Vite:** Provides fast HMR during development  

---

## Current Limitations & How We're Handling Them

### OAuth Token Expiration
- **Limitation:** Google OAuth tokens expire after 1 hour  
- **Current handling:** Deferred to post-MVP — will implement refresh token logic later  
- **Impact:** Users may need to re-authenticate mid-session  

### Rate Limiting (Google Calendar API)
- **Limitation:** Google Calendar API has rate limits  
- **Current handling:** Manual sync button, track sync timestamps  
- **Future consideration:** Exponential backoff, batch operations if hitting limits  

### Race Conditions (Multiple Syncs)
- **Limitation:** User could trigger multiple syncs simultaneously  
- **Current handling:** Rate-limit sync button, simple mutex/flag  
- **MVP approach:** "Last sync wins" — no complex conflict resolution  

### ICS Feed Changes Between Syncs
- **Limitation:** Events might change on source calendar between syncs  
- **Current handling:** Manual sync required  
- **Impact:** Not real-time, acceptable for MVP  

### No Calendar Selection (One Calendar Only)
- **Limitation:** Users can't sync to multiple Google Calendars  
- **Current handling:** All synced events go to one designated calendar  

### Task List Assignment Logic
- **Limitation:** How to decide which task list an ICS item goes to  
- **Current handling:** Default task list for items that don't match rules  

### Large ICS Feeds (100+ Events)
- **Limitation:** Many individual API calls  
- **Current handling:** Accept slower sync times for MVP  
- **Future optimization:** Batch API endpoints if needed  

### No Conflict Resolution
- **Limitation:** Manual edits overwritten  
- **Handling:** ICS is source of truth  

### Error Handling
- **Limitation:** Google API calls can fail  
- **Handling:** Try-catch in API routes, show errors in extension  

### No Offline Support
- **Limitation:** Requires internet connection  
- **Future consideration:** Cache ICS feed locally  

### User Has No Calendar Yet
- **Limitation:** On first use, calendar not created  
- **Handling:** GET /calendar returns empty or 404, extension auto-calls POST /calendar  

---

## Data Flow Summary

1. User triggers sync in extension  
2. Extension fetches ICS feed (URL or uploaded file)  
3. Extension parses ICS with TypeScript helpers  
4. Extension applies user's custom filters  
5. Extension computes hash for each filtered event  
6. Extension compares hashes against locally stored hash map  
7. Extension identifies: new events, modified events, deleted events  
8. Extension makes targeted API calls:  
   - POST /calendar/events for new events  
   - PATCH /calendar/events/:id for modified events  
   - DELETE /calendar/events/:id for deleted events  
   - Similar for tasks  
9. Extension updates local hash map with new hashes  
10. Extension shows success message to user
