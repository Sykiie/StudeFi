# Study Organizer

A local-first study organizer web app. It saves its library in the browser on the current device and does not use an account, server, or online database.

## Run locally

Run `npm start` in this folder, then open `http://127.0.0.1:4173` in your browser. The server uses Node’s built-in modules; there are no package dependencies to install.

Browser storage is scoped to the site and browser profile. Use **Back up library** regularly to download a JSON backup containing classes, topics, notes, study sets, and uploaded files. **Restore backup** replaces the current browser library with the selected backup.

## Features

- Classes with topics and optional Prelims, Midterms, Finals, or custom term labels
- Uploaded PDFs, Word documents, slide decks, and images associated with multiple topics
- Formatted notes in a separate Notes area
- A separate Study Tools area for manually written flashcards and quiz questions
- Optional source dates and deadlines, plus automatically recorded material-added dates
- Search and class/topic filtering
- Full-library backup and restore
