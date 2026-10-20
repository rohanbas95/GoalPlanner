# GoalPlanner

One place for your goals and your daily to-dos. A static web app (no backend) that runs on GitHub Pages,
works offline, and can be installed on your phone's home screen.

- **Today**: overdue items, today's tasks and habits, goal steps due today, the next 7 days, and an Inbox for undated to-dos
- **Goals**: goals with a category, colour, start and target date; break each into steps (with due dates) and link repeating tasks/habits to it. Shows progress and whether you're on track for the time used
- **Timeline**: every goal as a bar across 3 months / 6 months / 1 year, with steps as markers and a line for today
- **Calendar**: month view of tasks, steps and deadlines, plus your Google Calendar events when signed in
- **Repeating tasks**: daily, weekdays, weekly, monthly, with an optional end date; ticked off per day
- **Google (optional)**: sync between devices through your Google Drive, and copy dated items into a separate "GoalPlanner" Google calendar
- Light/dark theme, backup download/restore, works offline (PWA)

Your data is stored in the browser (localStorage). Nothing is sent anywhere unless you sign in with Google.

## Run locally

ES modules don't load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site appears at `https://<username>.github.io/GoalPlanner/`.

When you release changes, bump `VERSION` in `sw.js` so installed copies drop their old cache.

## Google sign-in setup

`js/config.js` reuses Money Manager's OAuth client ID. In that project in [Google Cloud Console](https://console.cloud.google.com/):

1. **APIs & Services → Library**: enable **Google Calendar API** (Drive API is already on for Money Manager).
2. **Credentials → the OAuth client**: under *Authorised JavaScript origins*, make sure `https://<username>.github.io` is there
   (it already is if Money Manager runs from the same account), and add `http://localhost:8000` for local testing.
3. **OAuth consent screen → Data access**: add these scopes:
   - `.../auth/drive.appdata`: the sync file, in a hidden folder only this app can see
   - `.../auth/calendar.app.created`: create the "GoalPlanner" calendar and manage only that calendar's events
   - `.../auth/calendar.events.readonly`: show your existing events in the Calendar view
4. While the app is in "Testing", add your Google account under **Test users**. Google shows an "unverified app" warning; that's expected for a personal project.

The consent screen shows the Cloud project's app name. If you'd rather it say "GoalPlanner", create a separate project and OAuth client and paste its ID into `js/config.js`.

How it behaves:
- Google gives the browser a token that lasts about an hour. When it runs out, the cloud button in the header says **Reconnect**; one tap renews it.
- Edits sync a few seconds after you make them, and again when you return to the app. Devices are merged item by item (newer change wins; deletions carry over).
- Items copied to Google Calendar are overwritten from the app, so edit them in GoalPlanner. Deleting the GoalPlanner calendar in Google is fine; it's recreated on the next sync.

## Code layout

No build step; plain JavaScript modules.

| File | What it does |
| --- | --- |
| `index.html`, `css/app.css` | App shell and styles |
| `js/main.js` | Routing, shared click actions, re-rendering and sync wiring |
| `js/store.js` | Data, localStorage, merge for sync, queries |
| `js/dates.js` | Date helpers and repeat rules |
| `js/google.js` | Google sign-in, Drive sync, Google Calendar push/read |
| `js/forms.js` | Add/edit forms for tasks, goals, steps |
| `js/items.js` | Shared row markup |
| `js/views/*.js` | Today, Goals, Timeline, Calendar, Settings |
| `sw.js`, `manifest.webmanifest` | Offline support and install-to-home-screen |
