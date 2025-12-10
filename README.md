# canvas2calendar

Web extension to allow custom ICS parsing from Canvas into Google Calendar + Tasks. 
Currently in plans to be published on the Chrome web store by early 2026. Some features: 

- classification of events (assignments, homework, quizzes, tests, etc.)
- custom blacklist/whitelist for certain classes/event types
- color coding
- oragnize between multiple calendars + task lists
- integration with Google Tasks
- manual refreshing for ICS feed


## Planned API Endpoints:

- Authentication
  - GET /auth/google — Start OAuth login
  - GET /auth/callback — OAuth callback

- Calendar
  - GET /calendar — Get the user's calendar
  - POST /calendar — Create a calendar (if none exists)
  - GET /calendar/events — List events
  - POST /calendar/events — Create an event
  - PATCH /calendar/events/:id — Update an event
  - DELETE /calendar/events/:id — Delete an event

- Tasks
  - GET /tasks — List task lists
  - POST /tasks — Create a task list
  - PATCH /tasks/:taskListId — Update a task list
  - DELETE /tasks/:taskListId — Delete a task list
  - GET /tasks/:taskListId/items — List tasks
  - POST /tasks/:taskListId/items — Create a task
  - PATCH /tasks/:taskListId/items/:id — Update a task
  - DELETE /tasks/:taskListId/items/:id — Delete a task

## Notes

- The project uses Express, PostgreSQL, and Prisma for the backend.
- Chrome extension reads user-provided ICS feeds locally and syncs events/tasks via the API.
- Authentication is handled via Google OAuth.
- All sensitive information (API keys, tokens) should be set in environment variables.

---

