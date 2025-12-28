import { Page, FrameLocator, expect } from '@playwright/test';

const TSUGI_BASE_URL = process.env.TSUGI_BASE_URL || 'http://localhost';
const STORE_URL = `${TSUGI_BASE_URL}/tsugi/store`;

/**
 * Debug helper - take screenshot and log page content
 */
async function debugPage(page: Page, label: string): Promise<void> {
  if (process.env.DEBUG) {
    console.log(`\n=== DEBUG: ${label} ===`);
    console.log(`URL: ${page.url()}`);
    const title = await page.title().catch(() => 'N/A');
    console.log(`Title: ${title}`);
    await page.screenshot({ path: `debug-${label.replace(/\s+/g, '-')}.png` });
    console.log(`Screenshot saved: debug-${label.replace(/\s+/g, '-')}.png`);
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

// Track if we've already launched the tool (to use identity switcher)
let toolLaunched = false;
let currentPage: Page | null = null;

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
  // If tool is already launched, use identity switcher instead of going back to store
  if (toolLaunched && currentPage === page) {
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
  
  let tryItButton = null;
  let foundSelector = null;
  for (const selector of tryItSelectors) {
    tryItButton = page.locator(selector).first();
    if (await tryItButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      foundSelector = selector;
      console.log(`Found "Try It" button with selector: ${selector}`);
      break;
    }
  }
  
  if (!tryItButton || !foundSelector) {
    // Fallback: take a screenshot for debugging
    await page.screenshot({ path: 'try-it-not-found.png', fullPage: true });
    const bodyText = await page.textContent('body').catch(() => 'Could not get body text');
    console.log('Page body text (first 500 chars):', bodyText?.substring(0, 500));
    throw new Error('Could not find "Try It" button. Screenshot saved to try-it-not-found.png. Set DEBUG=1 for more details.');
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
    
    // Mark as launched
    toolLaunched = true;
    currentPage = page;
    
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
    
    // Mark as launched
    toolLaunched = true;
    currentPage = page;
    
    // Now switch to student identity
    return await switchIdentity(page, role, studentIndex);
  }
}

/**
 * Switch identity using the dropdown switcher (faster than going back to store)
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
  
  // Find the identity dropdown - try multiple selectors
  const dropdownSelectors = [
    'select:has-text("Jane Instructor")',
    'select:has-text("Instructor")',
    'select[name*="identity"]',
    'select[name*="user"]',
    'select.dropdown',
    'select',
  ];
  
  let dropdown = null;
  for (const selector of dropdownSelectors) {
    dropdown = page.locator(selector).first();
    if (await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`Found identity dropdown with selector: ${selector}`);
      break;
    }
  }
  
  // If dropdown not found, try clicking on text that says "Jane Instructor"
  if (!dropdown || !(await dropdown.isVisible({ timeout: 2000 }).catch(() => false))) {
    const instructorText = page.locator('text="Jane Instructor", text=/Jane.*Instructor/i').first();
    if (await instructorText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await instructorText.click();
      await page.waitForTimeout(500);
      // Look for dropdown again after click
      dropdown = page.locator('select').first();
    }
  }
  
  if (!dropdown || !(await dropdown.isVisible({ timeout: 2000 }).catch(() => false))) {
    await page.screenshot({ path: 'identity-dropdown-not-found.png', fullPage: true });
    throw new Error('Could not find identity dropdown. Screenshot saved to identity-dropdown-not-found.png');
  }
  
  // Select the appropriate identity
  if (role === 'instructor') {
    await dropdown.selectOption({ label: /instructor/i });
  } else {
    const studentNum = studentIndex || 1;
    // Try to find student option - might be "Student 1", "Learner 1", etc.
    const studentOptions = [
      `Student ${studentNum}`,
      `Learner ${studentNum}`,
      `student${studentNum}`,
      `learner${studentNum}`,
    ];
    
    let selected = false;
    for (const option of studentOptions) {
      try {
        await dropdown.selectOption({ label: new RegExp(option, 'i') });
        selected = true;
        break;
      } catch (e) {
        // Try next option
      }
    }
    
    if (!selected) {
      // Fallback: select by index (assuming students come after instructor)
      const options = await dropdown.locator('option').all();
      const studentOptionIndex = studentNum; // Assuming 1-based index
      if (options.length > studentOptionIndex) {
        await dropdown.selectOption({ index: studentOptionIndex });
      } else {
        throw new Error(`Could not find student ${studentNum} option`);
      }
    }
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
  
  let settingsButton = null;
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
  
  let saveButton = null;
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
      await page.screenshot({ path: 'save-button-not-found.png', fullPage: true });
    }
    throw new Error('Could not find save button. Screenshot saved to save-button-not-found.png');
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
  typedName: string
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

