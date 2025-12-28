Design / implement automated browser QA for the Tsugi LTI tool in folder `agree/` using Playwright.

Context:
- We will run tests using Tsugi’s built-in testing harness at `/tsugi/store`.
- `/tsugi/store` can launch any Tsugi tool via an LTI launch into an iframe.
- The store harness supports launching as Instructor and as three different Students.
- The goal is “watchable” automated QA: tests should run in a visible browser and be stable.

High-level goals:
1) Add Playwright test infrastructure to this repo (Node-based).
2) Write Playwright tests for the `agree/` tool that drive the UI inside the LTI iframe using `/tsugi/store`.
3) Make tests reliable by adding stable selectors to the `agree/` UI (data-testid) rather than brittle CSS/XPath.
4) Provide simple commands to run tests headed / slow (so a human can watch).

Implementation requirements:

A) Repo setup
- Add `package.json` (if missing) and install Playwright as a dev dependency:
  - `@playwright/test` plus `npx playwright install`
- Add `playwright.config.*` with:
  - default to Chromium
  - `headless: false` by default (watchable), but allow `HEADLESS=1` to run headless
  - `trace: 'on-first-retry'` and `screenshot: 'only-on-failure'`
  - reasonable timeouts for slow LMS/iframe flows

B) Environment configuration
- Tests should use environment variables:
  - `TSUGI_BASE_URL` (e.g. http://localhost or https://…)
  - (optional) any store keys needed, but prefer to keep assumptions minimal
- Tests should NOT require complicated LMS login; we rely on `/tsugi/store` test launch.

C) Instrument the agree tool for testability
Add stable `data-testid` attributes in the student and instructor UIs:
Student page (not signed):
- checkbox: data-testid="agree-checkbox"
- typed name input: data-testid="typed-name"
- sign button: data-testid="sign-button"
Student confirmation / already signed:
- confirmation block: data-testid="signed-confirmation"
- signed date: data-testid="signed-at"
- signed typed name: data-testid="signed-name"
- agreement snapshot text block: data-testid="agreement-snapshot"

Instructor pages:
- Agreement settings textarea: data-testid="agreement-text"
- “I understand” confirm checkbox: data-testid="i-understand"
- save button: data-testid="save-agreement"
- Student Data table: data-testid="student-data-table"
- student row link: data-testid="student-row-<id>" (or include user id as data attr)
- Clear signature button on student detail: data-testid="clear-signature"
Also add a simple way to detect role/view in DOM with a testid or body class.

D) Playwright tests to implement
Create tests under something like `tests/agree.spec.ts` (or .js):

Test 1: Student signing + revisit
- Use `/tsugi/store` to launch the `agree/` tool as Student 1 in an iframe.
- If agreement not configured, instructor config step may be needed first:
  - Launch as Instructor, set agreement text, confirm “I understand” if applicable, save.
- Launch as Student 1:
  - verify not-signed state elements exist
  - check agree checkbox, fill typed name, click sign
  - verify signed confirmation appears and agreement snapshot is visible
- Re-launch as Student 1:
  - confirm it shows already-signed confirmation (no signing form)

Test 2: Instructor can view student data + detail
- Launch as Instructor:
  - open Student Data screen
  - verify Student 1 shows signed with typed name and timestamp
  - click into Student 1 detail
  - verify agreement snapshot matches what was signed

Test 3: Clearing signature enables re-sign (grade handling out of scope)
- Instructor launches Student 1 detail and clicks Clear signature
- Launch Student 1 again:
  - should be back to not-signed UI
  - sign again (typed name maybe different)
  - verify confirmation appears again
- No attempt to verify LMS gradebook; just ensure tool UI/state toggles correctly.

Test 4: Agreement text change clears all signatures (but does not try to clear LMS grades)
- Precondition: at least Student 1 is signed.
- Instructor changes agreement text:
  - requires “I understand”
  - save
- Launch Student 1:
  - should be NOT signed now and must re-sign
- Instructor Student Data should show cleared signature state.

E) How to interact with the store harness
- Implement helper functions in tests:
  - goToStore()
  - launchToolAs(role, studentIndex) that clicks the appropriate store UI to perform a launch and waits for iframe to load the tool
  - getLtiFrame() that returns a Playwright FrameLocator for the LTI iframe
- Use robust waiting: wait for a known testid in the frame (e.g., "agree-root") rather than arbitrary sleeps.

F) Docs / usage
- Add a short doc (README or tests/README) with commands:
  - install deps
  - run tests headed
  - run tests slow
  - run single test
Example commands:
  - `npx playwright test --ui`
  - `npx playwright test --headed --project=chromium`
  - `npx playwright test --headed --slow-mo=250`

Deliverables
- package.json + playwright config
- tests with helpers
- minimal, stable testids added to `agree/` UI
- docs explaining env var and how to run

Important: Do not spend time on “how to build Tsugi tools”. Focus on integrating Playwright with `/tsugi/store` launches and making tests stable.

