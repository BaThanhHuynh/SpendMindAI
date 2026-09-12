# AI AGENT WORKFLOW & EXECUTION SPEC

## 1. Operating Principles
- **Do Not Break Interfaces:** Preserve existing public APIs and function contracts unless explicitly marked for deprecation.
- **Root-Cause Fixes Only:** Reject temporary patches, `try-catch` blocks that silence errors silently, or arbitrary `sleep`/delay hacks.
- **Atomic Commits/Tasks:** Process one module or sub-system at a time. Verify with tests before proceeding.

## 2. Audit & Refactoring Execution Steps
1. **Discovery:** Scan the file tree, package manifests (`package.json`, `requirements.txt`, `go.mod`, etc.), and environment configurations.
2. **Static Inspection:** Identify linting errors, anti-patterns, typing issues, security holes (hardcoded secrets, unsafe queries), and UI bottlenecks.
3. **Execution Plan:** Log findings into `AUDIT_LOG.md` categorized by severity: Critical (P0), High (P1), Medium (P2), Minor (P3).
4. **Resolution:** Sequentially address items starting from P0. Refactor logic, update UI components, add missing validations, and write missing unit tests.
5. **Verification:** Validate build success, run test suites, check bundle sizes / query latencies, and remove all debug code (`console.log`, `print`, mock variables).
