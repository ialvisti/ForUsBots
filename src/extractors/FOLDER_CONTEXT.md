# /src/extractors/ - Data Extraction Modules Context

## Purpose
This directory contains modules that extract structured data from participant pages in the ForUsAll employer portal. Extractors parse HTML, extract specific fields, and return normalized data objects.

## Architecture
```
extractors/
└── forusall-participant/
    ├── modules/           # Per-module extractors (census, loans, payroll, etc.)
    │   ├── census.js
    │   ├── savings_rate.js
    │   ├── loans.js
    │   ├── plan_details.js
    │   ├── payroll.js
    │   └── mfa.js
    ├── registry.js        # Extractor registration and lookup
    └── utils.js           # Shared extraction utilities
```

## Module Structure

### registry.js
**Purpose**: Central registry for all extractors. Provides lookup, validation, and field policy management.

**Functions**:
- **`getExtractor(key)`**: Returns extractor function for module (e.g., 'census', 'loans').
- **`getSupportedFields(key)`**: Returns array of supported field names for module.
- **`getFieldPolicy(key)`**: Returns field policy object (defaults, required, etc.).
- **`validateFieldsForModule(key, fields)`**: Validates requested fields against module schema.
- **`supportedKeys()`**: Returns list of all available module keys.

**When to use**: Looking up extractors, validating field requests, discovering available modules.

---

### utils.js
**Purpose**: Shared utilities for all extractors (text normalization, selector helpers, etc.).

**Common Patterns**:
- Text normalization (trim, lowercase, Unicode)
- DOM query helpers
- Date parsing
- Currency/number parsing

---

## Available Extractors

### 1. `modules/census.js` - Census Data
**Fields**: firstName, lastName, preferredFirstName, preferredLastName, ssn, birthDate, hireDate, rehireDate, terminationDate, projectedPlanEntryDate, eligibilityStatus, address1, address2, city, state, zipcode, email, homeEmail, phone, employeeId.

**Special Features**:
- SSN reveal logic (controlled by `REVEAL_FULL_SSN` ENV var)
- Date parsing (MM/DD/YYYY → YYYY-MM-DD)
- Eligibility status codes (A, D, I, X, U)

**When to use**: Extracting participant demographic and employment data.

---

### 2. `modules/savings_rate.js` - Savings Rate
**Fields**: beforeTaxPercentage, rothPercentage, afterTaxPercentage, escalationYesNo, escalationPercentageIncrease, escalationMaxPercentage, escalationFrequencyMonths.

**Special Features**:
- Percentage parsing (removes %)
- Boolean conversion (Yes/No → true/false)

**When to use**: Extracting participant contribution settings.

---

### 3. `modules/loans.js` - Loan Information
**Fields**: loanId, loanType, loanNumber, originalAmount, outstandingBalance, interestRate, loanDate, paymentAmount, paymentFrequency, paymentsRemaining, lastPaymentDate, status.

**Special Features**:
- Multiple loan support (returns array)
- Currency parsing (removes $, commas)
- Date normalization

**When to use**: Extracting active/historical loan data.

---

### 4. `modules/plan_details.js` - Plan Enrollment Details
**Fields**: planName, enrollmentStatus, enrollmentDate, eligibilityDate, participationDate, vestingPercentage, yearsOfService, compensationAmount.

**Special Features**:
- Vesting percentage parsing
- Service years calculation
- Compensation amount normalization

**When to use**: Extracting plan enrollment and vesting information.

---

### 5. `modules/payroll.js` - Payroll History
**Fields**: Supports year-based queries (`years:all`, `years:2024,2023`, `years:last3`).

**Structure**:
```javascript
{
  years: ['2024', '2023'],
  byYear: {
    '2024': [
      { date: '2024-01-15', gross: 5000, beforeTax: 250, roth: 100, ... },
      ...
    ]
  },
  metadata: { totalRows, distinctYears, dateRange }
}
```

**Special Features**:
- Year tokenization (parse special tokens like "all", "last3")
- Multi-year aggregation
- Table parsing with dynamic columns
- Metadata extraction (row counts, date ranges)

**When to use**: Extracting payroll contribution history, generating reports.

---

### 6. `modules/mfa.js` - MFA Status
**Fields**: status (e.g., "enrolled", "not enrolled"), enrolledDate.

**Special Features**:
- Status normalization
- Date extraction from status text

**When to use**: Checking participant MFA enrollment state.

---

## Extractor Interface

### Standard Signature
```javascript
module.exports = async function extract(page, { scope = null, fields = null } = {}) {
  // scope: CSS selector to limit extraction (e.g., '#census')
  // fields: Array of field names to extract (null = all fields)
  
  return {
    data: { field1: 'value1', field2: 'value2', ... },
    warnings: [],
    unknownFields: []  // If fields parameter had unknown field names
  };
};
```

### Field Filtering
Extractors support field filtering when `fields` parameter is provided:
- **null/undefined**: Extract all available fields
- **Array**: Extract only specified fields
- Unknown fields are returned in `unknownFields` array

### Example Usage (from scrape bot)
```javascript
const { getExtractor } = require('../../extractors/forusall-participant/registry');

const extractor = getExtractor('census');
const result = await extractor(page, {
  scope: '#census',
  fields: ['firstName', 'lastName', 'email', 'ssn']
});

console.log(result.data);
// { firstName: 'John', lastName: 'Doe', email: 'john@example.com', ssn: '123-45-6789' }
```

---

## When to Work Here

### Add New Extractor When:
- Adding support for a new participant page module
- Creating specialized extractors (e.g., document list, communications)
- Need structured data from new portal sections

### Modify Existing Extractor When:
- Portal HTML structure changes
- Adding new fields to existing modules
- Fixing parsing bugs or edge cases
- Improving date/currency normalization

### DO NOT Modify When:
- Changing navigation logic (use bot's runFlow.js)
- Adding selectors for non-extraction purposes (use `/src/providers/`)
- Changing auth or page management (use `/src/engine/`)

---

## Best Practices

### Extraction Logic
- Use `page.evaluate()` for bulk DOM queries (reduce round-trips)
- Normalize text (trim, lowercase for comparisons)
- Handle missing fields gracefully (return null, not undefined)
- Use CSS selectors > XPath when possible
- Cache repeated queries

### Data Normalization
- Dates: Always return ISO format (YYYY-MM-DD)
- Currency: Remove $, commas; return numbers
- Percentages: Remove %; return numbers
- Booleans: Return true/false (not "Yes"/"No")
- Text: Trim whitespace, normalize Unicode

### Error Handling
- Return partial data if some fields fail
- Add warnings for recoverable issues
- Only throw for catastrophic failures (selector not found)
- Include field name in error messages

### Field Policy
```javascript
module.exports.SUPPORTED_FIELDS = ['field1', 'field2', ...];
module.exports.FIELD_POLICY = {
  defaults: ['field1', 'field2'],  // Extracted when fields=null
  required: ['field1'],             // Must always be present
  optional: ['field3'],             // May be absent
};
```

---

## Testing

### Unit Tests
- Mock Playwright Page with fixture HTML
- Test field parsing with edge cases (empty, malformed, Unicode)
- Test field filtering logic
- Test date/currency normalization

### Integration Tests
- Use real participant pages (saved HTML)
- Test full extraction pipeline
- Validate data structure matches schema

### Edge Cases to Test
- Missing fields (empty strings, null)
- Malformed dates (MM/DD/YY vs MM/DD/YYYY)
- Currency with/without cents
- Multi-line addresses
- Special characters in names
- Loans with zero balance
- Payroll with gaps

---

## Common Patterns

### Text Extraction
```javascript
const text = await page.$eval(selector, el => (el.textContent || '').trim());
```

### Table Parsing
```javascript
const rows = await page.$$eval('table tbody tr', rows => 
  rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    return {
      col1: cells[0]?.textContent?.trim() || '',
      col2: cells[1]?.textContent?.trim() || '',
    };
  })
);
```

### Date Normalization
```javascript
function parseDate(dateStr) {
  // MM/DD/YYYY → YYYY-MM-DD
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (!match) return null;
  const [, m, d, y] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
```

### Currency Parsing
```javascript
function parseCurrency(str) {
  const cleaned = String(str).replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}
```

---

## Configuration (ENV Variables)

### SSN Reveal
- `REVEAL_FULL_SSN=0`: Return only last 4 digits (default)
- `REVEAL_FULL_SSN=1`: Click reveal button and extract full SSN
- `SSN_REVEAL_WAIT_MS=1500`: Wait time after clicking reveal

---

## Dependencies
- **playwright**: Page interaction
- **../../../config**: ENV variables (REVEAL_FULL_SSN, etc.)
- **./utils**: Shared extraction helpers
- No circular dependencies

---

## Future Extractors (Ideas)
- **documents.js**: Participant document list
- **communications.js**: Communication history
- **distributions.js**: Distribution requests/history
- **beneficiaries.js**: Beneficiary information
- **investments.js**: Investment allocations

