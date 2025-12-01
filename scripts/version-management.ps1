# PowerShell Script สำหรับจัดการเวอร์ชั่นและการ Rollback
# Usage: .\scripts\version-management.ps1 [command] [options]

param(
    [Parameter(Position=0)]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$Arg1,
    
    [Parameter(Position=2)]
    [string]$Arg2
)

function Print-Help {
    Write-Host "Usage: .\scripts\version-management.ps1 [command] [options]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:"
    Write-Host '  tag-version <version> <message>  - Create tag for version (e.g. v1.0.0)'
    Write-Host '  list-tags                         - List all tags'
    Write-Host '  list-commits                      - Show commit history'
    Write-Host '  create-staging                    - Create staging branch'
    Write-Host '  rollback-to <tag/commit>          - Rollback to previous tag or commit'
    Write-Host '  show-version                      - Show current version'
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\scripts\version-management.ps1 tag-version v1.0.0 'Version 1.0.0 Stable'"
    Write-Host "  .\scripts\version-management.ps1 rollback-to v1.0.0"
    Write-Host "  .\scripts\version-management.ps1 create-staging"
}

function Tag-Version {
    param([string]$Version, [string]$Message)
    
    if ([string]::IsNullOrEmpty($Version)) {
        Write-Host "Error: Version is required" -ForegroundColor Red
        Write-Host "Usage: tag-version <version> <message>"
        exit 1
    }
    
    if ([string]::IsNullOrEmpty($Message)) {
        $Message = "Version $Version"
    }
    
    Write-Host "Creating tag: $Version" -ForegroundColor Yellow
    git tag -a $Version -m $Message
    git push origin $Version
    Write-Host "✓ Tag $Version created and pushed" -ForegroundColor Green
}

function List-Tags {
    Write-Host "Available tags:" -ForegroundColor Yellow
    git tag -l -n9
    Write-Host ""
    Write-Host "Latest 5 tags:" -ForegroundColor Yellow
    git tag -l | Select-Object -Last 5
}

function List-Commits {
    Write-Host "Recent commits:" -ForegroundColor Yellow
    git log --oneline --graph --all -20
}

function Create-Staging {
    Write-Host "Creating staging branch..." -ForegroundColor Yellow
    $branchExists = git branch -l staging
    if ($branchExists) {
        git checkout staging
    } else {
        git checkout -b staging
    }
    git push origin staging
    Write-Host "✓ Staging branch created/updated" -ForegroundColor Green
    $currentBranch = git branch --show-current
    Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow
}

function Rollback-To {
    param([string]$Target)
    
    if ([string]::IsNullOrEmpty($Target)) {
        Write-Host "Error: Tag or commit hash is required" -ForegroundColor Red
        Write-Host "Usage: rollback-to <tag/commit>"
        exit 1
    }
    
    Write-Host "Rolling back to: $Target" -ForegroundColor Yellow
    
    # Check if it's a valid tag or commit
    $result = git rev-parse $Target 2>&1
    if ($LASTEXITCODE -eq 0) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $branchName = "rollback-$timestamp"
        Write-Host "Creating rollback branch..." -ForegroundColor Yellow
        git checkout -b $branchName $Target
        Write-Host "✓ Rollback branch created: $branchName" -ForegroundColor Green
        Write-Host "To deploy this version:" -ForegroundColor Yellow
        Write-Host "  1. git push origin $branchName"
        Write-Host "  2. In Northflank: Change source branch to $branchName"
        Write-Host "  3. Or merge to main: git checkout main; git merge $branchName"
    } else {
        Write-Host "Error: $Target not found in Git history" -ForegroundColor Red
        exit 1
    }
}

function Show-Version {
    Write-Host "Current Git Information:" -ForegroundColor Yellow
    $branch = git branch --show-current
    $commit = git rev-parse --short HEAD
    $tag = git describe --tags --abbrev=0 2>$null
    if (-not $tag) { $tag = "No tags" }
    
    Write-Host "Branch: $branch"
    Write-Host "Commit: $commit"
    Write-Host "Latest Tag: $tag"
    Write-Host ""
    Write-Host "Recent tags:" -ForegroundColor Yellow
    git tag -l | Select-Object -Last 5
}

# Main command handler
switch ($Command) {
    "tag-version" {
        Tag-Version -Version $Arg1 -Message $Arg2
    }
    "list-tags" {
        List-Tags
    }
    "list-commits" {
        List-Commits
    }
    "create-staging" {
        Create-Staging
    }
    "rollback-to" {
        Rollback-To -Target $Arg1
    }
    "show-version" {
        Show-Version
    }
    "help" {
        Print-Help
    }
    "--help" {
        Print-Help
    }
    "-h" {
        Print-Help
    }
    default {
        if ([string]::IsNullOrEmpty($Command)) {
            Print-Help
        } else {
            Write-Host "Error: Invalid command" -ForegroundColor Red
            Write-Host ""
            Print-Help
            exit 1
        }
    }
}

