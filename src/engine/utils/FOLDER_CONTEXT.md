# /src/engine/utils/ - Utility Functions Context

## Purpose
This directory contains reusable utility functions for common Playwright operations and data manipulation. These utilities are shared across all bots to maintain consistency and reduce code duplication.

## Available Utilities

### `select.js` - Dropdown/Select Handling
**Purpose**: Robust handling of dropdown selects with Unicode normalization and fuzzy matching.

**Functions**:
- **`waitForOptionFlex(page, selector, desiredText, timeout)`**: Waits for a dropdown option to appear, with Unicode normalization and fuzzy matching. Returns option index or -1.
- **`selectByText(page, labelOrSelector, valueText)`**: Selects dropdown option by visible text. Supports CSS selectors or label-based lookup.

**Key Features**:
- Unicode canonicalization (NFD normalization, removes diacritics)
- Handles non-breaking spaces, smart quotes, irregular whitespace
- Fuzzy matching for slight text variations
- Supports dependent/cascading dropdowns (waits for options to populate)

**When to use**: Any time you need to interact with `<select>` elements, especially when options load dynamically or have Unicode characters.

**Example**:
```javascript
const { waitForOptionFlex, selectByText } = require('./select');

// Wait for option to appear
const idx = await waitForOptionFlex(page, '#caption', 'Recordkeeper Agreement', 20000);
if (idx < 0) throw new Error('Option not found');

// Select by text
await selectByText(page, '#section', 'CONTRACTS & AGREEMENTS');
```

---

### `verify.js` - Form Verification
**Purpose**: Verifies form state after submission (e.g., confirms form was cleared/reset).

**Functions**:
- **`waitForFormCleared(page, cfg, opts)`**: Polls DOM until form fields reset to defaults or change from submitted values. Returns `{ ok, mismatches[], snapshot }`.
- **`verifyFormDefaults(page, cfg, delayMs)`**: (Legacy) Checks if form matches hardcoded defaults.

**Key Features**:
- Polls with configurable timeout and interval
- Compares current values against submitted values
- Checks file input is empty, selects changed, dates cleared
- Supports custom caption (Other) text verification

**When to use**: After form submission to confirm success without relying on page navigation.

**Example**:
```javascript
const { waitForFormCleared } = require('./verify');

const result = await waitForFormCleared(page, {
  fsel: { section: '#section', caption: '#caption', status: '#status', effectiveDate: '#date' },
  fileInputSel: '#file',
  filled: { section: 'CONTRACTS', caption: 'Agreement', status: 'Audit Ready', effectiveDate: '2025-01-15' }
}, { timeoutMs: 4000, pollMs: 120 });

if (!result.ok) {
  throw new Error(`Form not cleared: ${result.mismatches.join(', ')}`);
}
```

---

### `date.js` - Date Input Handling
**Purpose**: Fills date input fields with proper formatting and event dispatching.

**Functions**:
- **`setEffectiveDate(page, selector, dateStr)`**: Fills date input with ISO date string (YYYY-MM-DD), triggers input/change events.

**Key Features**:
- Handles datepicker inputs
- Dispatches proper DOM events (input, change, blur)
- Validates date format

**When to use**: When filling date fields in forms (effective date, hire date, etc.).

**Example**:
```javascript
const { setEffectiveDate } = require('./date');

await setEffectiveDate(page, '#effective_date', '2025-05-02');
```

---

### `pdf.js` - PDF Metadata Manipulation
**Purpose**: Rewrites PDF document metadata (title, author, etc.) using pdf-lib.

**Functions**:
- **`setPdfTitle(filePath, title)`**: Reads PDF, updates title metadata, writes back to disk.

**Key Features**:
- Validates PDF header (`%PDF-`)
- Updates both document info and viewer title bar
- Preserves PDF content

**When to use**: When uploaded PDFs need standardized metadata (e.g., set title to match filename without extension).

**Example**:
```javascript
const { setPdfTitle } = require('./pdf');

await setPdfTitle('/tmp/uploads/document.pdf', 'Recordkeeper Agreement');
```

---

### `url.js` - URL Template Interpolation
**Purpose**: Builds URLs from templates with dynamic parameters.

**Functions**:
- **`buildUploadUrl(template, planId)`**: Replaces `{planIdNumber}` placeholder in URL template.

**Key Features**:
- Simple string interpolation
- Validates planId is present

**When to use**: Building dynamic URLs for upload/scrape endpoints.

**Example**:
```javascript
const { buildUploadUrl } = require('./url');

const url = buildUploadUrl(
  'https://employer.forusall.com/fv_documents_console/{planIdNumber}/manage',
  580
);
// Returns: https://employer.forusall.com/fv_documents_console/580/manage
```

---

## When to Work Here

### Add New Utility When:
- You find repeated logic across multiple bots
- You need a reusable Playwright pattern (e.g., file download, dialog handling)
- You need data transformation (e.g., SSN formatting, name parsing)
- You need specialized DOM interactions (e.g., drag-and-drop, custom inputs)

### Modify Existing Utility When:
- Fixing bugs in shared logic
- Improving Unicode handling in select.js
- Adding new verification rules to verify.js
- Extending date format support in date.js

### DO NOT Modify When:
- Adding bot-specific logic (keep in bot's runFlow.js)
- Adding provider-specific config (use `/src/providers/`)
- Adding extractors (use `/src/extractors/`)

## Best Practices

### Function Design
- Keep functions focused (single responsibility)
- Accept `page` as first parameter for Playwright operations
- Return structured objects (not raw booleans when context is needed)
- Use descriptive parameter names
- Document Unicode edge cases

### Error Handling
- Throw errors with clear messages
- Include context (selector, expected value, actual value)
- Use try/catch internally for Playwright operations
- Return error details in result objects (don't always throw)

### Unicode Handling
- Use canonical normalization (NFD) + diacritic removal
- Normalize whitespace (collapse, trim)
- Handle smart quotes, non-breaking spaces
- Test with real-world data (names, addresses with accents)

### Performance
- Use efficient selectors (ID > class > nth-child)
- Minimize waitForTimeout() calls
- Prefer `waitForSelector()` with polling
- Cache repeated DOM queries when safe

## Testing
- Unit test with mocked Playwright Page
- Test Unicode edge cases (accents, spaces, quotes)
- Test timeout/retry behavior
- Test error messages are clear
- Integration tests with real browser

## Common Patterns

### Wait + Action Pattern
```javascript
async function waitAndClick(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  await page.click(selector);
}
```

### Poll + Verify Pattern
```javascript
async function waitForCondition(page, checkFn, { timeoutMs = 5000, pollMs = 100 }) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await checkFn(page)) return true;
    await page.waitForTimeout(pollMs);
  }
  return false;
}
```

### Safe Evaluate Pattern
```javascript
async function safeEval(page, selector, fn) {
  try {
    return await page.$eval(selector, fn);
  } catch {
    return null;
  }
}
```

## Dependencies
- **playwright**: Page, Locator, ElementHandle
- **pdf-lib**: PDFDocument
- No circular dependencies (utilities are leaf nodes)

## Import Conventions
```javascript
// In bots or other engine modules
const { selectByText, waitForOptionFlex } = require('./engine/utils/select');
const { waitForFormCleared } = require('./engine/utils/verify');
const { setEffectiveDate } = require('./engine/utils/date');
const { setPdfTitle } = require('./engine/utils/pdf');
const { buildUploadUrl } = require('./engine/utils/url');
```

## Future Utilities (Ideas)
- **dialog.js**: Alert/confirm/prompt handling
- **download.js**: File download management
- **table.js**: Table parsing and extraction
- **ssn.js**: SSN formatting and validation
- **phone.js**: Phone number formatting
- **address.js**: Address normalization

