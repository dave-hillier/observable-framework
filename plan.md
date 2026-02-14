# Phase 7: Production Correctness — FileAttachment, Head Injection, Base Path, and Inline Expressions

## Overview

Phase 6 addressed search and missing FileAttachment formats. This phase fixes
**correctness issues** that would cause real-world React builds to break:

1. **FileAttachment registration** — The React build doesn't emit `registerFile()`
   calls, so `FileAttachment("data.csv")` silently fails in production.
2. **Custom `<head>` content** — Config/page `head` option (analytics, fonts, etc.)
   is completely missing from the React shell.
3. **Base path routing** — Deploying to a subpath like `/myapp/` breaks navigation
   because `matchPath()` doesn't strip the base prefix.
4. **Inline expressions** — `${variable}` in markdown body compiles to static text
   rather than reactive JSX that updates when variables change.

These are all blockers for real deployments.

## Tasks

### 7.1: Emit file registration in React page modules
### 7.2: Include custom `<head>` content in the React shell
### 7.3: Fix base path handling in App router
### 7.4: Wire inline expressions to reactive cell state
### 7.5–7.6: Tests
