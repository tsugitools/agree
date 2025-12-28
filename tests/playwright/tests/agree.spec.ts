import { test, expect } from '@playwright/test';
import {
  launchToolAs,
  waitForToolLoad,
  setAgreementText,
} from './helpers';

const AGREEMENT_TEXT = 'I agree to follow the honor code and academic integrity policies.';

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
