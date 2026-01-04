Push project to GitHub — instructions

1) Recommended: authenticate with GitHub CLI (interactive)

PowerShell:

```powershell
# install GitHub CLI if not already installed
# then authenticate interactively
gh auth login
```

2) Run the helper script (from repo root):

```powershell
cd e:\finance_mng
.\scripts\push_to_github.ps1
```

The script will:
- initialize a git repo if none exists
- add and commit files
- set `origin` to https://github.com/Shubham-ktk/Fin-Ai.git
- push to the `main` branch

3) If you prefer to use a personal access token (PAT) instead of `gh`:
- create a PAT with `repo` (write) scope
- do NOT hardcode the token into files. Use one of these approaches:
  - `gh auth login --with-token` and paste the token
  - use Windows Git Credential Manager which will prompt for credentials on push

4) Troubleshooting:
- Authentication errors: run `gh auth login` or configure a PAT.
- Remote permission denied: ensure the GitHub account has write access to the target repository.
