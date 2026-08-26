<p align="center">
  <img src="extension/icon128.png" width="96" height="96" alt="Commit at extension icon">
</p>

<h1 align="center">Commit at</h1>

<p align="center">
  A local browser extension that lets you schedule GitHub commits for a future date and time.
</p>

<p align="center">
  Select a repository, choose the files you want to commit, set a commit message and branch, then schedule the commit. The local server handles the scheduled job and creates the commit directly through the GitHub API when the scheduled time arrives.
</p>

## How It Works

```text
Browser Extension
       │
       ▼
Local Node.js Server
       │
       ▼
GitHub API
       │
       ▼
Scheduled Git Commit
```

The extension handles the user interface and scheduling setup.

The local Node.js server stores scheduled jobs and checks for jobs that are due. When a job reaches its scheduled time, the server uploads the selected files, creates the Git tree and commit, and updates the target branch on GitHub.

## Requirements

* Google Chrome or another Chromium-based browser
* Node.js
* A GitHub account
* A GitHub Personal Access Token for local development

## Configure GitHub

From the `server` directory, run:

```bash
npm install
npm run build
```

When prompted, enter your GitHub token as `GITHUB_DEV_TOKEN`.

The `build` command:

1. Generates a random `COMMIT_AT_API_TOKEN`
2. Creates `server/.env` automatically
3. Builds the server
4. Starts the local server

The server refuses to start when `COMMIT_AT_API_TOKEN` is missing.

The extension fetches the generated local API token from the running server and stores it in `chrome.storage.local`, so no token value is hardcoded in `extension/config.js`.

No additional server-start command is required after `npm run build`.

For a fine-grained GitHub token, the target repository should have:

```text
Administration: Read and write
Contents: Read and write
Metadata: Read-only
```

Repository creation may require additional GitHub account permissions.

> This project uses a development token for local use. A production version should replace this with a GitHub App or OAuth-based authentication flow.

## Start the Server

The recommended local setup is:

```bash
cd server
npm install
npm run build
```

The `build` command performs the required setup and starts the local server.

The local API starts at:

```text
http://localhost:8787
```

If the project is already configured and you only want to start the server without rebuilding, run:

```bash
npm start
```

For development with watch mode, run:

```bash
npm run dev
```

Keep the server process running while using scheduled commits.

## Configure the Extension

The API token is not stored in `extension/config.js`.

Once the local server is running, the extension obtains the generated token automatically and stores it in `chrome.storage.local`.

No token needs to be entered manually in the extension.

## Load the Extension

1. Open Chrome or another Chromium-based browser.
2. Open:

```text
chrome://extensions
```

3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the project's `extension` folder:

```text
commit-at/extension
```

6. Pin the extension if you want quick access.

## Use the Extension

### 1. Connect to GitHub

Open the extension and click:

```text
Test GitHub Connection →
```

A successful connection shows your GitHub username.

### 2. Select a Repository

Choose a repository from the repository list.

You can also enter a new repository name and click:

```text
Create repo
```

### 3. Add Files

Use the file area to:

* Drop files into the extension
* Click the file area and select files

Selected files are shown before scheduling.

### 4. Configure the Commit

Set:

```text
Commit message
Branch
Date
Time
```

The timezone is detected automatically from your computer.

The selected date and time must be in the future.

### 5. Schedule the Commit

Click:

```text
Schedule commit →
```

The job is sent to the local server and stored as a scheduled commit.

## Branches

The default branch is:

```text
main
```

If you enter another branch name, `commit-at` checks whether that branch exists.

If it does not exist, the server creates the branch from `main` before scheduling the commit.

## Recent Commits

The **Recent commits** section shows scheduled and completed jobs.

Each entry includes:

```text
Commit message
Repository
Status
Scheduled date and time
```

Click a commit to view additional details such as:

* Date
* Time
* Status
* Branch
* Repository
* Commit message
* Files

Scheduled commits can be deleted before they run.

The **Clear** button clears the recent history shown in the extension.

## Check It Works

From the project root, run:

```bash
cd server
npm install
npm run build
```

The `build` command starts the local server after setup.

Then verify the health endpoint:

```text
http://localhost:8787/api/health
```

Expected response:

```json
{"ok":true}
```

Next:

1. Load the extension.
2. Connect to GitHub.
3. Select a test repository.
4. Add a small test file.
5. Set a commit message.
6. Schedule the commit a few minutes in the future.
7. Keep the server process running.
8. Wait for the scheduled time.
9. Open the repository on GitHub.
10. Verify that the commit was created.

## Important

The scheduler runs inside the local Node.js process.

That means the server must remain running until the scheduled commit executes.

For the standard setup, use:

```bash
cd server
npm run build
```

After the server has been built and started, keep that terminal process running.

If the Node.js server process is closed, scheduled jobs will not be processed while the server is offline.

## Project Structure

```text
commit-at/
├── extension/
│   ├── background.js
│   ├── config.js
│   ├── icon128.png
│   ├── manifest.json
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
│
└── server/
    ├── data/
    │   └── jobs.json
    ├── src/
    │   └── index.js
    ├── .env
    ├── .gitignore
    └── package.json
```

## Local Development

The extension communicates with:

```text
http://localhost:8787
```

The server communicates with:

```text
https://api.github.com
```

The server stores scheduled jobs locally in:

```text
server/data/jobs.json
```

## Security Note

This project is intended as a local development prototype.

The GitHub development token is kept on the local server and should never be committed to Git.

Make sure:

```text
server/.env
```

is excluded from version control.

For a production-ready version, use a proper GitHub App or OAuth flow with secure server-side credential storage.
