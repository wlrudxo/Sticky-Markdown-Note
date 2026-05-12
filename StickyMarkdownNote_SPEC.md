# Sticky Markdown Note Spec

## Product Definition

AI_DailyNote is a Windows sticky-note style Markdown viewer.

The source of truth is ordinary Markdown files. AI agents, CLI tools, Obsidian,
or text editors may modify those files directly. This app does not own the task
schema and does not provide a task-specific CLI.

Primary target example:

```text
C:\Users\user\OneDrive\Obsidian-Personal\DailyNote\DailyTasks.md
```

The target document can change. The app must support multiple Markdown files.

## Platform And Stack

- Platform: Windows first
- App framework: Tauri
- Frontend: React/Vite or equivalent web UI inside Tauri
- Manager window: normal app window
- Note windows: frameless/custom titlebar sticky-note windows
- Tray icon: required
- Settings/state location: Windows app data directory, for example Tauri app data
  dir or `%APPDATA%\AI_DailyNote\config.json`

## Core Windows

### Manager Window

The manager window is a lightweight utility panel, not the main work surface.

Required:

- `+ Note` button
- `Load` button
- Settings button
- Pinned section
- Recent notes section
- Card preview using the bottom part of the last successfully read snapshot
- Card context menu

Excluded from MVP:

- Search
- Tags/categories
- Board layout
- Source Markdown editing
- File deletion
- File rename

Closing the manager window hides/closes only the manager. Note windows stay
alive. The app is fully closed only through `Quit`, for example from the tray or
context menu.

### Note Windows

Each note window maps to exactly one Markdown file.

Required:

- Multiple independent note windows
- One window per normalized absolute file path by default
- Frameless/custom titlebar
- Thin top accent/header area used for dragging
- Resizable window
- Minimum window size
- Focus/selected state shows toolbar
- Unfocused state shows content only, except error banners
- Focus state shows a subtle bottom-right resize grip
- Text selection must work in the content area

The content area must not be a drag region, because text selection, link
handling, and scrolling are more important there.

## File Opening And Creation

### `+ Note`

Creates a new empty Markdown file.

Required:

- User chooses folder/path and filename
- Default folder is configurable
- If no extension is provided, append `.md`
- Do not overwrite an existing file
- After creation, immediately open the new note window
- Initial content is empty

Templates are deferred.

### `Load`

Uses the native OS file picker.

Required:

- Select existing Markdown-like files
- Suggested filters: `.md`, `.markdown`, `.txt`
- Add selected file to recent notes
- Open or focus the note window

## Recent Notes And Pinning

Recent notes are app metadata, not a live folder scan.

Required:

- Recent list is based on files opened by the app
- Pinned is file-level and affects manager list ordering
- Pinned does not imply the note window opens automatically
- File existence checks are lazy
- If a file cannot be found, show a recoverable `not found` state after lazy
  check or open failure
- Do not scan every file synchronously when rendering the manager list

Recent note card click behavior:

- If the note is already open, focus/bring that note window forward
- If it is closed, open it
- Do not create duplicate windows for the same normalized path

Card context menu:

- Open / bring to front
- Pin / unpin
- Toggle open on startup
- Open file location
- Open in external editor
- Remove from recent list

Do not include original file deletion or rename in MVP.

## Startup And Restore

Required state:

- Recent files
- Pinned files
- Open on startup per file
- Last read metadata
- Last preview snapshot
- Last window position and size
- Monitor identity or monitor geometry
- Always-on-top per note window
- Whether the note was open in the last session
- Manager window visible/hidden state
- Global theme
- Default folder
- Global hotkey settings
- Windows login autostart setting

Startup behavior:

- First run: show manager window
- If manager was visible at previous quit: show manager
- If manager was hidden at previous quit: keep manager hidden and use tray
- Restore note windows from `wasOpenLastSession` plus `openOnStartup`
- Deduplicate by normalized absolute path
- If no notes are restored, show manager window

Closing a note window:

- Closes only that note window
- Does not delete or remove the recent record
- Sets `wasOpenLastSession=false`
- If `openOnStartup=true`, it will still open on next app launch

## Multi-Monitor Behavior

Multi-monitor placement is a core MVP requirement.

Required:

- Save each note window's `x`, `y`, `width`, `height`
- Save monitor identity if available, or enough monitor geometry to validate
  placement
- Restore windows to their previous monitor and position when possible
- If the monitor is missing or the saved rectangle is off-screen, move the
  window to a safe visible location
- Hotkey behavior must not move windows to the active monitor

## Tray

System tray is required.

Tray menu:

- Open manager
- New note
- Load note
- Quit

The tray is the primary way to reopen the manager after it has been hidden.

## Windows Login Autostart

Required:

- Setting for Windows login autostart
- Default: off
- User must explicitly enable it
- Autostart should behave like normal app startup:
  - restore eligible note windows
  - keep manager hidden if that was the previous state
  - keep tray icon active

## Global Hotkey

A configurable global hotkey is required, primarily for Stream Deck usage.

Required:

- Default: none
- User can record a hotkey
- User can also type a hotkey manually, e.g. `F16` or `Ctrl+Alt+N`
- Validate hotkey before saving
- If registration fails, keep the previous hotkey and show an error
- Support mode selection:
  - Bring notes to front
  - Toggle notes

Hotkey target order:

1. If note windows are open, show/bring those note windows forward.
2. If no note windows are open, open `openOnStartup=true` notes.
3. If that also yields no notes, open the manager window.

Hotkey behavior:

- Applies to note windows first, not the manager
- Does not change saved positions or monitor placement
- Hidden or minimized notes are restored at their prior positions
- Off-screen windows are corrected only by the multi-monitor safety rule

Toggle mode:

- Toggle off hides note windows
- Hidden note windows should not appear as minimized taskbar items
- Toggle on shows hidden note windows at their existing positions
- X-closed notes and hotkey-hidden notes are different states

## Taskbar Visibility

Note windows:

- Configurable taskbar visibility
- Default: hidden from taskbar

Manager window:

- Visible in taskbar

Access paths for note windows:

- Visible desktop windows
- Global hotkey
- Tray menu
- Manager recent list

## Always On Top

Always-on-top is a note-window-level setting.

Required:

- Each note remembers its own always-on-top value
- Changes apply immediately and persist
- Hide/show preserves always-on-top
- Hotkey show brings normal windows forward but does not make them topmost
- Hotkey show restores topmost behavior for always-on-top windows

## Markdown Rendering

Rendering mode: Markdown-lite.

The app renders Markdown output only. It does not parse document semantics into
task/project structures.

Required:

- Render Markdown as compact sticky-note content
- Preserve readable line breaks
- Hide frontmatter in the viewer without modifying the file
- Support checkboxes visually
- Completed checkbox items may be visually de-emphasized
- Support numbered lists, bullet lists, bold, strikethrough, and links
- Code blocks, tables, images, and callouts should not break layout, but do not
  need rich app-specific behavior in MVP
- Headings should be modestly styled, not large article headings

Do not implement:

- Task board interpretation
- Section/project/date parsing
- Tag management
- Domain-specific task actions

## Links And Text Selection

Required:

- Rendered note content must be selectable DOM text
- `Ctrl+A` selects the current note body only
- `Ctrl+C` copies selected note text
- Context menu includes Select all and Copy
- Toolbar/status text should not be included in note-body select-all
- Normal link click should not open links
- `Ctrl+Click` opens links in the default browser

Deferred:

- Paste
- Inline editing
- Ctrl+F search

## Scrolling

Required:

- Internal scrolling for long note content
- Scrollbar hidden by default
- When note is focused/selected or actively scrolling, show a subtle thin
  scrollbar
- Save scroll position
- On automatic file refresh:
  - If the user was near the bottom, stay at bottom after refresh
  - If the user was reading the middle, preserve position as much as possible
- Add limited bottom padding so the final line can scroll above the bottom edge
  of the window
- Provide a go-to-bottom action in the focus toolbar
- Preserve normal `End` / `Ctrl+End` style behavior where practical

## File Watching And Refresh

External modification is expected and central to the product.

Required:

- Watch only currently open note files
- Use filesystem watcher for quick updates
- Also use polling fallback for reliability, especially OneDrive paths
- Poll by metadata such as modified time and size
- Debounce reloads after change detection
- Read-only mode auto-refreshes without confirmation
- After successful refresh, show a subtle `Updated` indicator for about 1-2
  seconds
- No popup for read-only external changes

Read failure behavior:

- Keep showing the last successfully rendered content
- Show a thin error banner
- Keep watching/polling
- Automatically recover when the file becomes readable again
- On recovery, show `Updated` or `Recovered`

Encoding:

- Try UTF-8 first
- Fallback to CP949 for legacy Korean/Windows files
- Remember detected encoding if useful
- If future edit/save is added, preserve original encoding by default

## Editing Roadmap

MVP is display-first.

Editing is deferred. If added later:

- Editing happens in a draft state
- The source Markdown file is modified only after an explicit Save action
- If the external file changes while the note has unsaved draft changes, show a
  Notepad++-style conflict warning
- Possible actions:
  - Reload external changes and discard draft
  - Save draft over file
  - Cancel / inspect

No autosave editing in the MVP.

## Theme

MVP uses global theme only.

Default style:

- Based on Windows Sticky Notes
- Yellow paper background
- Subtle accent/header color
- Compact Markdown typography
- Minimal visible UI

Theme implementation:

- Use CSS variables or equivalent theme tokens
- Store global theme in app settings
- Apply the same theme to all note windows in MVP

Suggested configurable global tokens:

- Note background color
- Accent/header color
- Font size
- Line height
- Border radius
- Shadow strength
- Content padding
- Optional opacity

Deferred:

- Per-note color/style UI
- Per-note theme override UI

The data model may reserve a nullable `themeOverride` field for future use.

## Context Menus

### Manager Card Context Menu

- Open / bring to front
- Pin / unpin
- Toggle open on startup
- Open file location
- Open in external editor
- Remove from recent list

### Note Window Context Menu

- Always on top on/off
- Open on startup on/off
- Pin / unpin
- Open in external editor
- Refresh
- Select all
- Copy
- Close note
- Quit app

## Explicit Non-Goals For MVP

- Built-in task CLI
- Task schema enforcement
- Task board UI
- Search
- Tags/categories
- Inline Markdown editing
- Autosave
- File deletion
- File rename
- Per-note theme editing
- Duplicate windows for the same file
- Moving all notes to the active monitor on hotkey

