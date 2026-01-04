Param(
	[string]$RemoteUrl = "https://github.com/Shubham-ktk/Fin-Ai.git",
	[string]$Branch = "main"
)

Write-Host "Push helper: remote=$RemoteUrl branch=$Branch"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
	Write-Error "git is not installed or not in PATH. Install Git and re-run."
	exit 1
}

# Initialize repo and commit if needed
if (-not (Test-Path ".git")) {
	Write-Host "No git repo found — initializing and committing all files..."
	& git init
	& git add -A
	& git commit -m "Initial commit"
	if ($LASTEXITCODE -ne 0) { Write-Host "No files to commit or commit failed" }
} else {
	Write-Host "Git repo exists — staging changes and committing..."
	& git add -A
	& git commit -m "Update project files"
	if ($LASTEXITCODE -ne 0) { Write-Host "No changes to commit" }
}

# Configure remote
$existing = $null
try {
	$existing = (& git remote get-url origin) -join ""
} catch {
	$existing = $null
}

if ($existing) {
	Write-Host "Existing origin: $existing"
	if ($existing -ne $RemoteUrl) {
		Write-Host "Updating origin to $RemoteUrl"
		& git remote remove origin
		& git remote add origin $RemoteUrl
	} else {
		Write-Host "Origin already points to target repository."
	}
} else {
	Write-Host "Adding origin -> $RemoteUrl"
	& git remote add origin $RemoteUrl
}

# Ensure branch name
& git branch -M $Branch

# Push (uses GitHub CLI auth if available in the environment)
if (Get-Command gh -ErrorAction SilentlyContinue) {
	Write-Host "Using GitHub CLI (gh) to push — make sure you're authenticated (run gh auth login if needed)."
	& git push -u origin $Branch
} else {
	Write-Host "GitHub CLI not found. Attempting standard 'git push'. You may be prompted for credentials."
	& git push -u origin $Branch
}

Write-Host "Done. If push failed due to authentication, run 'gh auth login' or use a personal access token (PAT) with write:repo scope."

