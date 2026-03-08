# Discord Group - Inventory Management System Worktree

This group is for working with the inventory-system project in an isolated workspace.

## Project Location
- **Path in container**: `/workspace/group/inventory-system-worktree`
- This is a git worktree of the main inventory-management-system repository
- Located inside the worktree is the full inventory management system codebase
- Git remote: `git@github.com:hw-live/inventory-management-system.git`

## Current State
- Working on the inventory management system codebase
- Isolated from other groups for focused work
- The worktree contains: backend/, frontend/, cmd/, internal/

## Agent Configuration
- Working directory: `/workspace/group` (the group folder)
- Worktree is at: `/workspace/group/inventory-system-worktree`
- Backend: Go/Gin/SQLite
- Frontend: React/TypeScript/Vite

## Usage
- Use `@NanoClaw` to trigger assistance
- The agent will have access to the worktree files at `/workspace/group/inventory-system-worktree`
- All git operations can be performed directly in `/workspace/group/inventory-system-worktree`
