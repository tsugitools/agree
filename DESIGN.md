Prompt for Cursor.AI (design.me)

Build a simple Tsugi LTI tool in folder agree/. Cursor already knows Tsugi/LTI PHP patterns; focus on the behavior, data rules, and instructor/student UX.

Core model (non-negotiable)

One agreement per LTI link.

One signature per student, no history.

Signature storage uses the per-user, per-link Result settings JSON blob.

Agreement text is stored in Link Settings.

Tool sends grades as follows:

If student signs, send grade = 1.0 to the LMS.

Never send 0.0.

If student never signs, do not send any grade.

If a student re-signs (after instructor clears), it’s OK to resend 1.0.

Student experience

If agreement_text is not set (or empty):

Show a friendly “not configured yet” message and nothing else.

If agreement exists and student has not signed:

Show the agreement text prominently in a well-styled box (grey background).

Below it, show (with matching left/right padding but no background):

required typed-name field ("Type your name")

required checkbox: "I agree"

"Sign Agreement" button

Validation:

checkbox must be checked

typed name must be non-empty (trim whitespace)

On successful sign:

store signature data in Result settings (see keys below)

send grade 1.0

show a confirmation page that includes the signed date/time and the typed name

If student has already signed:

Show a confirmation view again (same as after signing):

“You signed on <date> as <typed_name>.”

Also display the exact agreement text snapshot they signed (not the current link text), so the student can always see what they agreed to.

No “I do not agree” path:

The student either signs and gets a grade 1.0 sent, or does nothing and no grade is sent. What “no grade” means is handled outside this tool.

Instructor experience

Provide instructor UI consistent with other Tsugi tools, with tabs/pages:

Agreement Settings

Edit the agreement text stored in Link settings under a stable key (e.g., agreement_text).

If any students have already signed:

show a prominent warning that changing the text will clear signatures and that existing grades will be left as is

require an "I understand" confirmation (checkbox + Save button is fine)

Current Agreement Text

Display the current agreement text above the Student Data section so instructors can see what students see.

Critical rule on change:

When the instructor changes agreement text (any change at all):

clear all existing signatures for this link (in Result settings)

do not attempt to clear grades in the LMS (grades remain as-is)

after clearing signatures, students must re-sign to re-send 1.0 (safe to resend)

Student Data

A roster-like table showing, per student:

Tsugi-known user display name (current)

typed name entered at signing (if signed)

signed_at timestamp (if signed)

signed? (Y/N)

Each row links to Student Detail

The table is paginated (50 students per page) with pagination controls when there are more than 50 students.

Student Detail

Show all stored signature fields including:

typed_name

tsugi display name at signing

signed_at timestamp

agreement text snapshot stored at signing time

Provide a button: Clear signature

clears that one student’s signature data from Result settings

does not send any grade (and never sends 0.0)

student can re-sign later; tool may resend 1.0 then

No CSV export.

Data to store (Result settings per user/link)

Store under a single object or stable keys. Example keys:

signed (boolean)

signed_at (ISO 8601 string, server time)

typed_name (string)

tsugi_display_name_at_signing (string)

agreement_text_snapshot (string; exact text at signing time)

agreement_hash (optional but useful; hash of snapshot)

Data to store (Link settings)

agreement_text (string)

Safety / correctness requirements

Safe rendering of agreement text (avoid XSS). If allowing HTML, sanitize. If you choose plain text, preserve newlines nicely.

All writes require standard Tsugi CSRF protection and role checks.

Clearing signatures on agreement change must be reliable and scoped to the current link/context.

Repeated launches after signing should not re-send grades unless the student signs again (OK if it’s simpler to only send on sign).

Deliverables

agree/ tool implementation

Minimal README documenting:

purpose

where agreement text is configured

what keys are stored in Result settings

what happens when instructor edits agreement text (signatures cleared, grades not cleared)

