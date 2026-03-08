# Discord Group - Inventory Management System Worktree

This group is for working with the inventory-system project in an isolated workspace.

## Project Location
- **Container Path**: `/workspace/extra/inventory-system`
- This is a git worktree of the main inventory-management-system repository
- The worktree is mounted from host at `/root/src/nanoclaw/groups/discord_main/inventory-system-worktree`

## Current State
- Working on the inventory management system codebase
- Isolated from other groups for focused work
- Git remote: `git@github.com:hw-live/inventory-management-system.git`

## Agent Configuration
- Working directory: `/workspace/group` (group folder)
- Project files are mounted at: `/workspace/extra/inventory-system`
- Backend: Go/Gin/SQLite
- Frontend: React/TypeScript/Vite

## Usage
- Use `@NanoClaw` to trigger assistance
- The agent will have access to the worktree files at `/workspace/extra/inventory-system`
- When referring to the project, use the path `/workspace/extra/inventory-system`
