# Publish this source to GitHub

The delivered source was initialized as a Git repository with a clean `main` branch. No GitHub account was available to the build environment, so no remote repository was created automatically.

## GitHub Desktop

1. Extract the source ZIP.
2. Open GitHub Desktop and choose **File → Add local repository**.
3. Select the extracted `Task-Tracker-1.3.0-source` folder.
4. If GitHub Desktop does not detect history from the ZIP, choose **Create a repository from existing files**, keep branch `main`, and commit the files.
5. Choose **Publish repository**, set the name to `task-tracker`, and choose Public or Private.

## Command line

From the extracted source folder:

```powershell
git init -b main
git add .
git commit -m "Task Tracker 1.3.0 source recovery"
git remote add origin https://github.com/YOUR-USER/task-tracker.git
git push -u origin main
```

Never commit `node_modules`, `release`, local databases, diagnostic ZIPs, or `.env` files. The included `.gitignore` already excludes these.
