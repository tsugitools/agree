# Playwright Tests for Agree Tool

This directory contains automated browser tests for the Agree Tsugi LTI tool using Playwright.

## Prerequisites

1. Node.js and npm installed
2. A running Tsugi instance with the `/tsugi/store` testing harness available
3. The `agree` tool registered in Tsugi

## Installation

```bash
cd tests/playwright
npm install
npx playwright install
```

## Configuration

Set the `TSUGI_BASE_URL` environment variable to point to your Tsugi instance:

```bash
export TSUGI_BASE_URL=http://localhost
# or
export TSUGI_BASE_URL=https://your-tsugi-instance.com
```

## Running Tests

### Run tests in headed mode (watchable)
```bash
npm run test:headed
```

### Run tests with UI mode (interactive)
```bash
npm run test:ui
```

### Run tests with slow motion (250ms delay between actions)
```bash
npm run test:slow
```

### Run tests headless
```bash
HEADLESS=1 npm test
```

### Run a specific test
```bash
npx playwright test tests/agree.spec.ts
```

### Run tests in debug mode
```bash
npm run test:debug
```

## Test Structure

- `helpers.ts` - Helper functions for interacting with the Tsugi store and tool iframe
- `agree.spec.ts` - Test specifications covering:
  1. Student signing and revisit
  2. Instructor viewing student data
  3. Clearing signatures and re-signing
  4. Agreement text changes clearing signatures

## How Tests Work

Tests use the `/tsugi/store` harness to launch the tool in an iframe as different roles:
- **Instructor**: Can configure agreement text and view student data
- **Student 1, 2, 3**: Can sign agreements

The tests interact with the tool through the iframe using Playwright's `FrameLocator` API and stable `data-testid` attributes added to the UI.

## Troubleshooting

- **Tests timeout**: Increase timeout in `playwright.config.js` or check that Tsugi store is accessible
- **Iframe not found**: Verify the tool is registered in Tsugi and the store can launch it
- **Elements not found**: Check that `data-testid` attributes are present in the rendered HTML

## Environment Variables

- `TSUGI_BASE_URL` - Base URL of your Tsugi instance (required)
- `HEADLESS` - Set to `1` to run tests headless (default: false)
- `DEBUG` - Set to `1` to enable debug screenshots and logging

## Troubleshooting

### "Try It" button not found

If tests fail to find the "Try It" button:

1. Run with debug mode: `DEBUG=1 npm run test:headed`
2. Check the screenshots saved in the test directory (`debug-*.png`, `try-it-not-found.png`)
3. Verify the Tsugi store page structure matches expectations
4. You may need to adjust selectors in `tests/helpers.ts` based on your Tsugi version

### Common Issues

- **Tests timeout**: Increase timeout in `playwright.config.js` or check that Tsugi store is accessible
- **Iframe not found**: Verify the tool is registered in Tsugi and the store can launch it
- **Elements not found**: Check that `data-testid` attributes are present in the rendered HTML

