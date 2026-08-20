# Email Trigger Flows

This directory contains flow handlers for the `forusall-emailtrigger` bot. Each flow handles a specific email type that can be triggered through the ForUsAll employer portal.

## Architecture

Each flow module exports a single async function with the signature:

```javascript
async function flowHandler({ page, selectors, meta, jobCtx }) {
  // Implementation
  return { result: "Succeeded" | "Failed" | "Empty Plan" | "Unknown Outcome", reason: "...", details: {...} };
}
```

### Parameters

- **`page`**: Playwright Page instance (already authenticated and navigated to trigger_emails)
- **`selectors`**: Selectors object from `FIXED.triggerEmails.selectors`
- **`meta`**: Full metadata object with all request parameters
- **`jobCtx`**: Job context for stage tracking (`setStage(name, meta)`)

### Return Value

All flows must return an object with:

- **`result`**: One of `"Succeeded"`, `"Failed"`, `"Empty Plan"`, or
  `"Unknown Outcome"`
- **`reason`**: Human-readable explanation
- **`details`**: Optional object with additional information

## Available Flows

### 1. summary_annual_notice

**Email Type**: `summary_annual_notice`

**Description**: Triggers Summary Annual Report (SAR) email notifications to participants.

**Process**:
1. Click Preview button and wait for navigation to `/preview`
2. Wait for DataTables table to load (with long timeout for slow plans)
3. Check if table is empty (no participants)
4. Select "All" rows and prove DataTables is unfiltered and fully rendered
5. Capture every `File Name` + `File S3 Loc` reference and validate delimited SAR, plan ID and report-year tokens
6. Read Legal Plan Name, Short Name and EIN from `/plans/{id}/edit`; use only the legal name when present, otherwise a minimum-entropy portal Short Name (Company Name never authorizes)
7. Download every unique allowlisted S3 URL with byte limits, PDF magic/parse checks and SHA-256
8. Send the exact bytes to the private OCR verifier using an ADC identity token
9. Re-read the complete manifest and re-HEAD ETag/version ID/length immediately before sending
10. In `verify_only`, return without installing a dialog handler or clicking anything
11. In `send`, click "Trigger Email", accept confirmation and require an explicit success alert

**Requirements**:
- Plan must have at least one participant
- Every row file name must contain delimited `SAR`, selected `planId` and `reportYear` tokens
- `reportYear` defaults to the previous UTC year when omitted
- `expectedDocument` must match plan ID/year and identify `summary_annual_report`
- The private verifier must be enabled and configured; otherwise SAR jobs are rejected

**Success Criteria**:
- Successfully redirected to `/trigger_emails` after triggering
- A `.alert.alert-success` confirmation is present and no error alert is present

**Error Handling**:
- Returns `"Empty Plan"` if no participants found
- Returns `"Failed"` if file name validation fails
- Returns `"Unknown Outcome"` if the click completed but navigation or the
  positive confirmation cannot be proven
- Persists row numbers/counts and validation flags, never raw file names
- Public document evidence contains only hashes, counts, stability flags and bounded non-text OCR facts
- Public gate failures expose only an explicitly allowlisted `SAR_*` code and the fixed message `SAR preview document verification failed`; identity, URLs, verifier text and internal details remain private
- The portal POST has no document/version ID. The final re-HEAD reduces but cannot eliminate the residual backend TOCTOU window.

---

### 2. year_end_notice

**Email Type**: `year_end_notice`

**Description**: Triggers year-end notice email to all participants in the plan.

**Process**:
1. Wait for "Trigger Email" button to be visible
2. Set up dialog handler for JavaScript confirmation ("Are you sure you want to send this email?")
3. Click "Trigger Email" button
4. Accept confirmation dialog automatically (clicks "OK")
5. Wait for redirect back to `/trigger_emails`
6. **Verify success alert appears** (`.alert.alert-success`) ✨
7. Read success message from alert

**Requirements**:
- Plan must be selected
- Email type must be set to `year_end_notice`

**Success Criteria**:
- Successfully redirected to `/trigger_emails` after triggering
- **Success alert (`.alert.alert-success`) is present on the page** ✨
- No error alerts detected
- No errors during the process

**Error Handling**:
- Returns `"Failed"` if button is not found
- Returns `"Failed"` if redirect doesn't occur within timeout

**Notes**:
- This is a simple flow that doesn't require preview
- No additional form fields needed
- Works directly from the trigger_emails page

---

## Common Utilities (_common.js)

The `_common.js` module provides shared utilities for all flows:

### Form Utilities

- **`waitOptionsCount(page, selectSel, opts)`**: Wait for dropdown options to load
- **`optionExists(page, selectSel, value)`**: Check if option exists in dropdown
- **`getSelectOptions(page, selectSel)`**: Get all options from dropdown
- **`selectIfPresent(page, selectSel, value, opts)`**: Select option if present
- **`setText(page, sel, value, opts)`**: Set text input value
- **`setCheckbox(page, sel, on)`**: Set checkbox state
- **`setRadioByValue(page, name, value)`**: Select radio button by value

### Validation Utilities

- **`validateTime(hhmm)`**: Validate HH:MM time format
- **`validateDate(ymd)`**: Validate YYYY-MM-DD date format

### Preview Page Utilities

- **`getPreviewFirstRowFileName(page)`**: Extract file name from first DataTables row
- **`getPreviewFileNames(page)`**: Extract one file name (or `null`) for every displayed DataTables row
- **`isPreviewTableEmpty(page)`**: Check if preview table is empty
- **`waitTableOrEmpty(page, opts)`**: Wait for table to resolve to rows or empty state
- **`ensurePreviewLongWait(page, selectors, jobCtx, opts)`**: Navigate to preview with long timeout

### Navigation Utilities

- **`waitForUrl(page, re, opts)`**: Wait for URL to match regex pattern
- **`acceptNextDialog(page)`**: Set up handler to accept next dialog

## Adding a New Flow

To add a new email type flow:

1. **Create flow file**: `flows/new_email_type.js`

```javascript
// flows/new_email_type.js
const { waitForUrl, setText, selectIfPresent } = require('./_common');

module.exports = async function runNewEmailType({ page, selectors: s, meta, jobCtx }) {
  try {
    // Stage 1: Fill additional fields if needed
    jobCtx?.setStage?.('new-email:fill-fields');
    
    // Example: fill year field
    if (meta.year) {
      await selectIfPresent(page, s.statementYear, meta.year);
    }
    
    // Stage 2: Trigger email
    jobCtx?.setStage?.('new-email:trigger');
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.click('#triggerEmail', { noWaitAfter: true });
    
    // Stage 3: Wait for redirect
    jobCtx?.setStage?.('new-email:wait-redirect');
    const redirected = await waitForUrl(page, /\/trigger_emails(\?|$)/, { timeout: 20000 });
    
    if (!redirected) {
      return { result: 'Failed', reason: 'Did not return to trigger_emails' };
    }
    
    // Success
    jobCtx?.setStage?.('new-email:done');
    return {
      result: 'Succeeded',
      reason: 'Email triggered successfully',
      details: { completedAt: new Date().toISOString() }
    };
  } catch (err) {
    return {
      result: 'Failed',
      reason: err?.message || String(err),
      details: { error: String(err) }
    };
  }
};
```

2. **Register in index.js**:

```javascript
// flows/index.js
const newEmailType = require('./new_email_type');

function getFlowHandler(emailType) {
  switch (emailType) {
    // ... existing cases ...
    case 'new_email_type':
      return newEmailType;
    // ...
  }
}
```

3. **Update controller.js** if the email type requires additional validation or parameters

4. **Add to ALLOWED_TYPES** in controller.js if not already present

5. **Update OpenAPI spec** in `docs/openapi.yaml`

6. **Create examples** in `examples/` directory

## Testing

### Manual Testing

1. Set environment variables:
```bash
export SITE_USER=your-email@example.com
export SITE_PASS=your-password
export TOTP_SECRET=your-totp-secret
export AUTH_TOKEN=your-api-token
```

2. Run the example:
```bash
# Using curl
./examples/emailtrigger-year-end-notice.sh 627

# Using Node.js
node examples/emailtrigger-year-end-notice.js 627
```

3. Monitor job status:
```bash
curl -H "x-auth-token: $AUTH_TOKEN" \
  "http://localhost:10000/forusbot/jobs/{jobId}"
```

### Automated Testing

(TODO: Add integration tests using Playwright Test)

## Best Practices

### Error Handling

- Always wrap the entire flow in try/catch
- Return structured error objects with `result: "Failed"`
- Include helpful details in error responses
- Don't throw errors; return error objects instead

### Stage Tracking

- Use `jobCtx?.setStage?.()` to track progress
- Use descriptive stage names (e.g., `'year-end:trigger-email'`)
- Include relevant metadata in stage calls

### Navigation

- Use `waitForUrl()` for URL-based navigation detection
- Set `noWaitAfter: true` when clicking buttons that trigger navigation
- Use multiple timeout attempts for slow-loading pages
- Always verify arrival at destination page

### Dialog Handling

- Set up dialog handlers BEFORE clicking buttons that trigger dialogs
- Use `page.once('dialog', ...)` for single-use handlers
- Always call `dialog.accept()` or `dialog.dismiss()` in catch blocks

### Selectors

- Use selectors from `selectors` parameter (from config.js)
- Provide fallback values for optional selectors
- Use stable IDs when possible
- Avoid fragile CSS nth-child selectors

## Troubleshooting

### Common Issues

**Issue**: "Handler not implemented yet for emailType='...'"
- **Cause**: Flow not registered in `flows/index.js`
- **Fix**: Add case to `getFlowHandler()` switch statement

**Issue**: "Did not return to /trigger_emails after Trigger Email"
- **Cause**: Navigation timeout or slow page load
- **Fix**: Increase timeout in `waitForUrl()` or add multiple retry attempts

**Issue**: "Required option '...' not found for #..."
- **Cause**: Plan doesn't support selected email type or option
- **Fix**: Validate plan capabilities before triggering email

**Issue**: Preview page never loads
- **Cause**: Slow plan with many participants
- **Fix**: Use `ensurePreviewLongWait()` with high timeout (90s+)

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
export PW_DEFAULT_TIMEOUT=30000
```

Enable evidence screenshots:
```bash
export EVIDENCE_ENABLED=1
export EVIDENCE_DIR=/tmp/evidence
```

## Architecture Decisions

### Why Separate Flows?

Each email type has different:
- Required form fields
- Validation rules
- Navigation patterns
- Success criteria

Separating flows keeps code:
- **Focused**: Each flow handles one email type
- **Testable**: Each flow can be tested independently
- **Maintainable**: Changes to one flow don't affect others
- **Clear**: Easy to understand what each flow does

### Why Return Objects Instead of Throwing?

Returning error objects instead of throwing:
- Provides structured error information
- Allows including additional context (details)
- Makes error handling consistent across flows
- Simplifies testing and mocking

### Why Stage Tracking?

Stage tracking provides:
- **Observability**: Know exactly where a job failed
- **Debugging**: Easier to diagnose issues
- **Metrics**: Track performance of individual stages
- **Progress**: Show users what's happening

## Future Enhancements

### Planned Flows

- [ ] monthly_balance
- [ ] notify_auto-escalation
- [ ] statement_notice
- [ ] sponsor_quarterly_email
- [ ] onboard_communications
- [ ] new_hire_communications
- [ ] generic_email
- [ ] force_out

### Planned Features

- [x] `verify_only` mode (full document gate without triggering)
- [ ] Retry logic for transient failures
- [ ] Evidence screenshots on errors
- [x] Exact Preview PDF OCR validation
- [ ] Participant count verification
- [ ] Integration tests with Playwright Test

## Contributing

When adding or modifying flows:

1. Follow the standard flow handler signature
2. Use common utilities from `_common.js`
3. Add comprehensive stage tracking
4. Return structured error objects
5. Document the flow in this README
6. Create usage examples
7. Update OpenAPI spec
8. Add tests (when test framework is ready)

## License

Copyright © ForUsBots Team. All rights reserved.
