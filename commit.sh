#!/bin/bash

# Simple commit script that ensures all commits go to main branch
# Usage: ./commit.sh "Your commit message"

# Check if we're on main branch, if not switch to it
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    echo "Switching to main branch..."
    git checkout main
fi

# Add all changes
git add .

# Commit with provided message or default message
if [ -n "$1" ]; then
    git commit -m "$1"
else
    git commit -m "Update files"
fi

# Push to main branch
git push origin main

echo "✅ Successfully committed and pushed to main branch!"