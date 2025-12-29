import { test, expect } from '@playwright/test';
import {
  launchToolAs,
  waitForToolLoad,
  setAgreementText,
  signAgreement,
  verifySigned,
  resetToolState,
} from './helpers';

const AGREEMENT_TEXT = 'I agree to follow the honor code and academic integrity policies.';

// Reset state before each test to ensure clean starting point
test.beforeEach(async ({ page }) => {
  await resetToolState(page);
});

test('Instructor can set agreement text and see it displayed', async ({ page }) => {
  // Launch as instructor
  const frame = await launchToolAs(page, 'agree', 'instructor');
  await waitForToolLoad(frame);
  
  // Verify we're in instructor view
  await expect(frame.locator('[data-testid="instructor-view"]')).toBeVisible();
  
  // Set agreement text
  await setAgreementText(frame, AGREEMENT_TEXT, false, page);
  
  // Wait for page to reload/update
  await page.waitForTimeout(2000);
  
  // Verify the agreement text is displayed in the "Current Agreement Text" section
  const currentAgreementSection = frame.locator('h2:has-text("Current Agreement Text")');
  await expect(currentAgreementSection).toBeVisible();
  
  // Verify the text content matches
  const agreementDisplay = frame.locator('.well').filter({ hasText: AGREEMENT_TEXT });
  await expect(agreementDisplay).toBeVisible();
  await expect(agreementDisplay).toContainText(AGREEMENT_TEXT);
});

test('Student can sign agreement and instructor can see it', async ({ page }) => {
  // First, ensure agreement text is set as instructor
  let frame = await launchToolAs(page, 'agree', 'instructor');
  await waitForToolLoad(frame);
  
  // Set agreement text if not already set
  const currentText = await frame.locator('[data-testid="agreement-text"]').inputValue().catch(() => '');
  if (!currentText || currentText.trim() === '') {
    await setAgreementText(frame, AGREEMENT_TEXT, false, page);
    await page.waitForTimeout(2000);
  }
  
  // Switch to Student 1 (Sue)
  frame = await launchToolAs(page, 'agree', 'student', 1);
  await waitForToolLoad(frame);
  
  // Verify we're in student view
  await expect(frame.locator('[data-testid="student-view"]')).toBeVisible();
  
  // Sign the agreement as Sue
  const studentName = 'Sue Student';
  await signAgreement(frame, studentName, page);
  
  // Verify signed confirmation appears
  await verifySigned(frame, studentName);
  
  // Switch back to instructor
  frame = await launchToolAs(page, 'agree', 'instructor');
  await waitForToolLoad(frame);
  
  // Wait for page to load
  await page.waitForTimeout(2000);
  
  // Verify Student Data table exists
  const studentTable = frame.locator('[data-testid="student-data-table"]');
  await expect(studentTable).toBeVisible();
  
  // Verify Sue appears in the table with signed status
  const tableContent = await studentTable.textContent();
  expect(tableContent).toContain('Sue');
  expect(tableContent).toContain('Y'); // Signed status
  
  // Verify the typed name appears in the table
  expect(tableContent).toContain(studentName);
});
