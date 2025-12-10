# canvas2calendar

Web extension to allow custom ICS parsing from Canvas into Google Calendar + Tasks. 
Currently in plans to be published on the Chrome web store by early 2026. Some features: 

- classification of events (assignments, homework, quizzes, tests, etc.)
- custom blacklist/whitelist for certain classes/event types
- color coding
- oragnize between multiple calendars + task lists
- integration with Google Tasks
- manual refreshing for ICS feed

## Notes

- The project uses Express, PostgreSQL, and Prisma for the backend.
- Frontend built via React.js + Vite
- ICS feeds are parsed on the server to sync based on diffs in tasks/events.
- Authentication is handled via Google OAuth.

---

