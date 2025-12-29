import { Page, FrameLocator, expect } from '@playwright/test';

const TSUGI_BASE_URL = process.env.TSUGI_BASE_URL || 'http://localhost';
const STORE_URL = `${TSUGI_BASE_URL}/tsugi/store`;

const SCREENSHOT_DIR = './screenshots';

/**
 * Debug helper - take screenshot and log page content
 */
async function debugPage(page: Page, label: string): Promise<void> {
  if (process.env.DEBUG) {
    // Ensure screenshot directory exists
    const fs = require('fs');
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    
    console.log(`\n=== DEBUG: ${label} ===`);
    console.log(`URL: ${page.url()}`);
    const title = await page.title().catch(() => 'N/A');
    console.log(`Title: ${title}`);
    const screenshotPath = `${SCREENSHOT_DIR}/debug-${label.replace(/\s+/g, '-')}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved: ${screenshotPath}`);
  }
}

/**
 * Navigate to the Tsugi store page
 */
export async function goToStore(page: Page): Promise<void> {
  await page.goto(STORE_URL);
  // Wait for store to load - look for common store elements
  await page.waitForLoadState('networkidle');
  // Wait for page to be fully interactive
  await page.waitForTimeout(1000);
}

// Track if we've already launched the tool per page (to use identity switcher)
// Use a Map to track per-page state since tests might run in parallel
const toolLaunchedMap = new Map<Page, boolean>();

/**
 * Launch a tool as a specific role via the store harness
 * Uses identity switcher dropdown if tool is already launched
 * @param page The Playwright page
 * @param toolPath The path to the tool (e.g., 'agree')
 * @param role 'instructor' or 'student'
 * @param studentIndex If role is 'student', which student (1, 2, or 3)
 */
export async function launchToolAs(
  page: Page,
  toolPath: string,
  role: 'instructor' | 'student',
  studentIndex?: number
): Promise<FrameLocator> {
  // If tool is already launched for this page, use identity switcher instead of going back to store
  if (toolLaunchedMap.get(page)) {
    return await switchIdentity(page, role, studentIndex);
  }
  
  // First time launch - go through store
  await goToStore(page);
  
  // Find and click the tool link - try multiple selectors
  const toolLink = page.locator(`a[href*="${toolPath}"], a:has-text("${toolPath}"), a:has-text("Agree")`).first();
  await toolLink.waitFor({ timeout: 10000 });
  await debugPage(page, 'after-tool-link-click');
  await toolLink.click();
  
  // Wait for tool selection page to load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Give it a moment for page to render
  
  await debugPage(page, 'before-try-it-button');
  
  // Look for "Try It" button and click it - try multiple selectors
  const tryItSelectors = [
    'button:has-text("Try It")',
    'a:has-text("Try It")',
    'input[value*="Try It"]',
    'button:has-text("Try")',
    'a:has-text("Try")',
    'button.btn-primary:has-text("Try")',
    'a.btn-primary:has-text("Try")',
    '[onclick*="try"]',
    'button.btn, a.btn',
  ];
  
  let tryItButton: any = null;
  let foundSelector: string | null = null;
  for (const selector of tryItSelectors) {
    tryItButton = page.locator(selector).first();
    if (await tryItButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      foundSelector = selector;
      console.log(`Found "Try It" button with selector: ${selector}`);
      break;
    }
  }
  
  if (!tryItButton || !foundSelector) {
    // Ensure screenshot directory exists
    const fs = require('fs');
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    // Fallback: take a screenshot for debugging
    const screenshotPath = `${SCREENSHOT_DIR}/try-it-not-found.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.textContent('body').catch(() => 'Could not get body text');
    console.log('Page body text (first 500 chars):', bodyText?.substring(0, 500));
    throw new Error(`Could not find "Try It" button. Screenshot saved to ${screenshotPath}. Set DEBUG=1 for more details.`);
  }
  
  await tryItButton.scrollIntoViewIfNeeded();
  await tryItButton.click();
  await page.waitForTimeout(2000); // Wait for click to process
  
  // "Try It" launches as instructor by default, so if we want instructor, just wait for iframe
  // If we want student, we need to switch identity first
  if (role === 'instructor') {
    // Wait for iframe to load (already launched as instructor)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give iframe time to load
    
    // Mark as launched for this page
    toolLaunchedMap.set(page, true);
    
    // Get the LTI iframe - try multiple selectors
    const iframe = page.frameLocator('iframe[name="content"], iframe[src*="' + toolPath + '"], iframe').first();
    
    // Wait for the tool to load by checking for instructor view
    await iframe.locator('[data-testid="instructor-view"]').waitFor({ timeout: 15000 });
    
    return iframe;
  } else {
    // For student, we need to switch identity after the initial instructor launch
    // Wait a bit for the page to settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Mark as launched for this page
    toolLaunchedMap.set(page, true);
    
    // Now switch to student identity
    return await switchIdentity(page, role, studentIndex);
  }
}

/**
 * Switch identity using the tabbed dialog switcher (faster than going back to store)
 * @param page The Playwright page
 * @param role 'instructor' or 'student'
 * @param studentIndex If role is 'student', which student (1, 2, or 3)
 */
async function switchIdentity(
  page: Page,
  role: 'instructor' | 'student',
  studentIndex?: number
): Promise<FrameLocator> {
  await debugPage(page, 'before-identity-switch');
  
  // Find the identity switcher - it's a tabbed dialog, not a dropdown
  // Look for text that says "Jane Instructor" or similar - clicking it opens the tabbed dialog
  const instructorTextSelectors = [
    'text="Jane Instructor"',
    'text=/Jane.*Instructor/i',
    'a:has-text("Jane Instructor")',
    'button:has-text("Jane Instructor")',
    '[role="button"]:has-text("Jane Instructor")',
    '.dropdown-toggle:has-text("Jane")',
    '.dropdown-toggle:has-text("Instructor")',
  ];
  
  let switcherTrigger: any = null;
  for (const selector of instructorTextSelectors) {
    switcherTrigger = page.locator(selector).first();
    if (await switcherTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`Found identity switcher trigger with selector: ${selector}`);
      break;
    }
  }
  
  if (!switcherTrigger || !(await switcherTrigger.isVisible({ timeout: 2000 }).catch(() => false))) {
    const fs = require('fs');
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const screenshotPath = `${SCREENSHOT_DIR}/identity-switcher-not-found.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    throw new Error(`Could not find identity switcher. Screenshot saved to ${screenshotPath}`);
  }
  
  // Click to open the identity list (ul/li with hrefs)
  await switcherTrigger.click();
  await page.waitForTimeout(500); // Wait for list to appear
  
  // Wait for the ul list to appear
  const listSelectors = [
    'ul.dropdown-menu',
    'ul[role="menu"]',
    'ul:has(li a)',
    'ul',
  ];
  
  let identityList: any = null;
  for (const selector of listSelectors) {
    identityList = page.locator(selector).first();
    if (await identityList.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`Found identity list with selector: ${selector}`);
      break;
    }
  }
  
  if (!identityList || !(await identityList.isVisible({ timeout: 2000 }).catch(() => false))) {
    const fs = require('fs');
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const screenshotPath = `${SCREENSHOT_DIR}/identity-list-not-found.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    throw new Error(`Could not find identity list. Screenshot saved to ${screenshotPath}`);
  }
  
  // Now find and click the appropriate link in the list
  if (role === 'instructor') {
    const instructorLinkSelectors = [
      'li a:has-text("Instructor")',
      'li a:has-text("Jane")',
      'a:has-text("Instructor")',
      'a[href*="instructor"]',
    ];
    
    let instructorLink: any = null;
    for (const selector of instructorLinkSelectors) {
      // Try within the list first
      if (identityList) {
        instructorLink = identityList.locator(selector).first();
        if (await instructorLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`Found instructor link with selector: ${selector}`);
          break;
        }
      }
      // Try in page context
      instructorLink = page.locator(selector).first();
      if (await instructorLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Found instructor link in page with selector: ${selector}`);
        break;
      }
    }
    
    if (instructorLink && await instructorLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await instructorLink.click();
    } else {
      console.log('Instructor link not found, may already be selected');
    }
  } else {
    // Student role
    const studentNum = studentIndex || 1;
    const studentLinkSelectors = [
      `li a:has-text("Student ${studentNum}")`,
      `li a:has-text("Learner ${studentNum}")`,
      `a:has-text("Student ${studentNum}")`,
      `a:has-text("Learner ${studentNum}")`,
      `a[href*="student${studentNum}"]`,
      `a[href*="learner${studentNum}"]`,
    ];
    
    let studentLink: any = null;
    for (const selector of studentLinkSelectors) {
      // Try within the list first
      if (identityList) {
        studentLink = identityList.locator(selector).first();
        if (await studentLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`Found student ${studentNum} link with selector: ${selector}`);
          break;
        }
      }
      // Try in page context
      studentLink = page.locator(selector).first();
      if (await studentLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Found student ${studentNum} link in page with selector: ${selector}`);
        break;
      }
    }
    
    if (!studentLink || !(await studentLink.isVisible({ timeout: 2000 }).catch(() => false))) {
      const fs = require('fs');
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }
      const screenshotPath = `${SCREENSHOT_DIR}/student-${studentNum}-link-not-found.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw new Error(`Could not find student ${studentNum} link. Screenshot saved to ${screenshotPath}`);
    }
    
    await studentLink.click();
  }
  
  // Wait for identity switch to complete and iframe to reload
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Get the LTI iframe
  const iframe = page.frameLocator('iframe[name="content"], iframe[src*="agree"], iframe').first();
  
  // Wait for the tool to load with new identity
  await iframe.locator('[data-testid="student-view"], [data-testid="instructor-view"]').waitFor({ timeout: 15000 });
  
  return iframe;
}

/**
 * Get the LTI iframe containing the tool
 */
export function getLtiFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[name="content"], iframe[src*="agree"]').first();
}

/**
 * Wait for the tool to be fully loaded
 */
export async function waitForToolLoad(frame: FrameLocator): Promise<void> {
  await frame.locator('[data-testid="student-view"], [data-testid="instructor-view"]').waitFor({ timeout: 10000 });
}

/**
 * Set agreement text as instructor
 */
export async function setAgreementText(
  frame: FrameLocator,
  text: string,
  hasExistingSignatures: boolean = false,
  page?: Page
): Promise<void> {
  // Wait for instructor view
  await frame.locator('[data-testid="instructor-view"]').waitFor();
  
  // Wait a bit for the page to fully render (use page if available)
  if (page) {
    await page.waitForTimeout(1000);
  } else {
    // Fallback: wait for an element to be stable
    await frame.locator('body').waitFor({ timeout: 1000 }).catch(() => {});
  }
  
  // Click the Settings button to open the modal
  // Settings button is typically a gear icon or "Settings" link in the top nav
  const settingsSelectors = [
    'a:has-text("Settings")',
    'button:has-text("Settings")',
    'a[href="#"]:has-text("Settings")',
    '.fa-cog', // FontAwesome gear icon
    '[class*="settings"]',
    'a[title*="Settings"]',
  ];
  
  let settingsButton: any = null;
  for (const selector of settingsSelectors) {
    settingsButton = frame.locator(selector).first();
    if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`Found Settings button with selector: ${selector}`);
      break;
    }
  }
  
  if (!settingsButton || !(await settingsButton.isVisible({ timeout: 2000 }).catch(() => false))) {
    // Try finding it in the page context (might be outside iframe)
    if (page) {
      for (const selector of settingsSelectors) {
        settingsButton = page.locator(selector).first();
        if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`Found Settings button in page with selector: ${selector}`);
          break;
        }
      }
    }
  }
  
  if (settingsButton && await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await settingsButton.click();
    // Wait for modal to open
    if (page) {
      await page.waitForTimeout(500);
    }
  } else {
    console.log('Settings button not found, assuming modal is already open or not needed');
  }
  
  // Wait for the modal/form to be visible
  // The textarea might be in a modal, so wait for it to be visible (not just present)
  const textarea = frame.locator('[data-testid="agreement-text"]');
  
  // Wait for textarea to be visible (not just present in DOM)
  await textarea.waitFor({ state: 'visible', timeout: 10000 });
  await textarea.clear();
  await textarea.fill(text);
  
  // If there are existing signatures, check the confirmation checkbox
  if (hasExistingSignatures) {
    const confirmCheckbox = frame.locator('[data-testid="i-understand"]');
    if (await confirmCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmCheckbox.check();
    }
  }
  
  // Click save button - try multiple selectors
  // SettingsForm might render it as a submit button in the form
  const saveButtonSelectors = [
    '[data-testid="save-agreement"]',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Save")',
    'button:has-text("Submit")',
    'input[value*="Save"]',
    'input[value*="Submit"]',
    'button.btn-primary',
    'button.btn-success',
  ];
  
  let saveButton: any = null;
  for (const selector of saveButtonSelectors) {
    // Try in frame first
    saveButton = frame.locator(selector).first();
    if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`Found save button with selector: ${selector}`);
      break;
    }
    // Try in page context if available (modal might be outside iframe)
    if (page) {
      saveButton = page.locator(selector).first();
      if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Found save button in page with selector: ${selector}`);
        break;
      }
    }
  }
  
  if (!saveButton || !(await saveButton.isVisible({ timeout: 2000 }).catch(() => false))) {
    // Take screenshot for debugging
    if (page) {
      const fs = require('fs');
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }
      const screenshotPath = `${SCREENSHOT_DIR}/save-button-not-found.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw new Error(`Could not find save button. Screenshot saved to ${screenshotPath}`);
    }
    throw new Error('Could not find save button');
  }
  
  await saveButton.click();
  
  // Wait for save to complete and page to reload (use page if available)
  if (page) {
    await page.waitForTimeout(2000);
  } else {
    // Fallback: wait for page to be stable
    await frame.locator('body').waitFor({ timeout: 2000 }).catch(() => {});
  }
}

/**
 * Sign agreement as student
 */
export async function signAgreement(
  frame: FrameLocator,
  typedName: string,
  page?: Page
): Promise<void> {
  // Wait for student view and signing form
  await frame.locator('[data-testid="student-view"]').waitFor();
  await frame.locator('[data-testid="typed-name"]').waitFor();
  
  // Fill in typed name
  const nameInput = frame.locator('[data-testid="typed-name"]');
  await nameInput.fill(typedName);
  
  // Check the agree checkbox
  const agreeCheckbox = frame.locator('[data-testid="agree-checkbox"]');
  await agreeCheckbox.check();
  
  // Click sign button
  const signButton = frame.locator('[data-testid="sign-button"]');
  await signButton.click();
  
  // Wait for confirmation
  await frame.locator('[data-testid="signed-confirmation"]').waitFor({ timeout: 10000 });
  
  // Wait a bit for the page to update
  if (page) {
    await page.waitForTimeout(1000);
  }
}

/**
 * Verify student has signed
 */
export async function verifySigned(
  frame: FrameLocator,
  expectedName: string
): Promise<void> {
  await frame.locator('[data-testid="signed-confirmation"]').waitFor();
  await expect(frame.locator('[data-testid="signed-name"]')).toContainText(expectedName);
  await expect(frame.locator('[data-testid="signed-at"]')).toBeVisible();
  await expect(frame.locator('[data-testid="agreement-snapshot"]')).toBeVisible();
}

/**
 * Verify student has not signed (shows signing form)
 */
export async function verifyNotSigned(frame: FrameLocator): Promise<void> {
  await frame.locator('[data-testid="student-view"]').waitFor();
  await expect(frame.locator('[data-testid="typed-name"]')).toBeVisible();
  await expect(frame.locator('[data-testid="agree-checkbox"]')).toBeVisible();
  await expect(frame.locator('[data-testid="sign-button"]')).toBeVisible();
  // Should not show signed confirmation
  await expect(frame.locator('[data-testid="signed-confirmation"]')).not.toBeVisible();
}

/**
 * Reset tool state - clear all signatures and agreement text via UI
 * This ensures tests start from a clean database state
 * Uses the UI to clear agreement text, which automatically clears all signatures
 */
export async function resetToolState(page: Page): Promise<void> {
  console.log('Resetting tool state via UI (clearing database)...');
  
  // Launch as instructor
  let frame = await launchToolAs(page, 'agree', 'instructor');
  await waitForToolLoad(frame);
  
  // Open settings
  const settingsSelectors = [
    'a:has-text("Settings")',
    'button:has-text("Settings")',
    'a[href="#"]:has-text("Settings")',
    '.fa-cog',
  ];
  
  let settingsButton: any = null;
  for (const selector of settingsSelectors) {
    settingsButton = frame.locator(selector).first();
    if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsButton.click();
      await page.waitForTimeout(500);
      break;
    }
    if (page) {
      settingsButton = page.locator(selector).first();
      if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  }
  
  // Clear agreement text (set to empty) - this will clear all signatures in the database
  const textarea = frame.locator('[data-testid="agreement-text"]');
  if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    
    // Check if there are existing signatures (confirmation checkbox will appear)
    const confirmCheckbox = frame.locator('[data-testid="i-understand"]');
    if (await confirmCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Signatures exist - check the confirmation checkbox
      await confirmCheckbox.check();
      await page.waitForTimeout(500);
    }
    
    // Clear the textarea
    await textarea.clear();
    
    // Save - this will clear all signatures in the database
    const saveButtonSelectors = [
      '[data-testid="save-agreement"]',
      'button[type="submit"]',
      'input[type="submit"]',
    ];
    
    for (const selector of saveButtonSelectors) {
      const saveButton = frame.locator(selector).first();
      if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        break;
      }
      if (page) {
        const saveButtonPage = page.locator(selector).first();
        if (await saveButtonPage.isVisible({ timeout: 2000 }).catch(() => false)) {
          await saveButtonPage.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    }
  }
  
  // Reset the launch state tracking for this page so next test starts fresh
  toolLaunchedMap.delete(page);
  
  console.log('Tool state reset complete - database cleared via UI');
}

