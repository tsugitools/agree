# Agreement Tool

A simple Tsugi LTI tool that allows students to sign agreements by checking a box and typing their name. Once signed, a grade of 1.0 is sent to the LMS.

## Purpose

This tool provides a straightforward way for instructors to have students acknowledge and sign agreements (such as honor codes, lab safety agreements, or course policies). Students sign by checking an "I agree" checkbox and typing their name. The tool sends a grade of 1.0 to the LMS upon signing.

## Configuration

### Agreement Text

The agreement text is configured by instructors in the **Settings** tab (accessible via the gear icon in the top right when logged in as an instructor).

- Navigate to the Agreement Settings section
- Enter or edit the agreement text in the textarea
- Click "Save" to update

**Important:** If any students have already signed the agreement, changing the text will:
- Clear all existing signatures for this link
- Require students to re-sign to receive a grade
- **Not** clear grades already sent to the LMS (grades remain as-is)

When changing the agreement text with existing signatures, you must check the confirmation checkbox acknowledging that signatures will be cleared.

## Data Storage

### Link Settings

The agreement text is stored in Link Settings under the key:
- `agreement_text` (string)

### Result Settings (per user/link)

Signature data is stored in the Result settings JSON blob for each user/link combination. The data structure includes:

- `signed` (boolean) - Whether the student has signed
- `signed_at` (ISO 8601 string) - Timestamp when the signature was recorded
- `typed_name` (string) - The name typed by the student
- `tsugi_display_name_at_signing` (string) - The student's display name at the time of signing
- `agreement_text_snapshot` (string) - The exact agreement text at the time of signing
- `agreement_hash` (string) - MD5 hash of the agreement text snapshot

## Grade Behavior

- **If student signs:** Grade of 1.0 is sent to the LMS
- **If student never signs:** No grade is sent
- **Never sends 0.0:** The tool never sends a zero grade
- **Re-signing:** If an instructor clears a signature and the student re-signs, the tool will resend 1.0 (safe to resend)

## Instructor Features

### Agreement Settings
- Edit the agreement text
- See warning if signatures exist
- Confirm before clearing signatures

### Student Data
- View roster table showing all students
- See who has signed and who hasn't
- View signed date/time and typed name
- Link to individual student detail pages

### Student Detail
- View complete signature information
- See the exact agreement text the student signed
- Clear individual student signatures
- Student can re-sign after clearing

## Student Experience

1. **Not Configured:** If no agreement text is set, students see a friendly message
2. **Not Signed:** Students see the agreement text, an "I agree" checkbox, and a name field
3. **Signed:** Students see a confirmation with their signature date/time and the agreement text they signed

## Security

- All writes require CSRF protection
- Role checks ensure only instructors can access instructor features
- Agreement text is safely rendered to prevent XSS
- Newlines in agreement text are preserved for readability

## Testing

This tool includes Playwright-based browser tests. See [tests/playwright/tests/README.md](tests/playwright/tests/README.md) for details on running the tests.

Quick start:
```bash
cd tests/playwright
npm install
npx playwright install
export TSUGI_BASE_URL=http://localhost:8888/py4e
npm run test:headed
```

