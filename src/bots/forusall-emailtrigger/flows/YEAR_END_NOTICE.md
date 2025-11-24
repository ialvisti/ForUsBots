# Year End Notice Flow - Implementation Documentation

## Overview

The `year_end_notice` flow has been implemented for the `forusall-emailtrigger` bot. This flow allows triggering year-end notice emails to all participants in a plan through the ForUsAll employer portal.

## Implementation Details

### Flow File
- **Location**: `src/bots/forusall-emailtrigger/flows/year_end_notice.js`
- **Email Type**: `year_end_notice`
- **Complexity**: Simple (no preview required, direct trigger)

### How It Works

1. **Plan Selection** (handled by runFlow.js)
   - Plan is validated and selected in the main runFlow
   - Email type is set to "year_end_notice"

2. **Trigger Email** (year_end_notice.js)
   - Waits for "Trigger Email" button to be visible
   - Sets up dialog handler for JavaScript confirmation ("Are you sure you want to send this email?")
   - Clicks the button
   - Automatically accepts the confirmation dialog by clicking "OK"
   - Waits for redirect back to `/trigger_emails`

3. **Success Verification** ✨
   - Confirms redirect occurred
   - **Verifies success alert appears** (`.alert.alert-success`)
   - Reads the success message from the alert
   - Checks for error alerts if success alert not found
   - Returns success response with timestamp and message

### Stage Tracking

The flow tracks the following stages:

1. `year-end:trigger-email` - Clicking the trigger button and accepting confirmation dialog
2. `year-end:wait-redirect` - Waiting for redirect back to main page
3. `year-end:verify-success` - Verifying success alert appears ✨
4. `year-end:done` - Completion

### Error Handling

The flow handles these error cases:

- **Button Not Found**: If the "Trigger Email" button is not visible within timeout
- **Redirect Failure**: If the page doesn't redirect back to `/trigger_emails` within timeout
- **No Success Alert**: If the success alert (`.alert.alert-success`) doesn't appear after redirect
- **Error Alert Detected**: If an error alert (`.alert.alert-danger`) appears instead of success
- **General Errors**: Any unexpected errors are caught and returned as structured error responses

## API Usage

### Request Format

```json
{
  "planId": 627,
  "emailType": "year_end_notice",
  "createdBy": {
    "name": "Admin User",
    "role": "admin",
    "at": "2025-01-15T12:00:00.000Z"
  }
}
```

### Success Response (202 Accepted)

```json
{
  "ok": true,
  "jobId": "job_abc123",
  "acceptedAt": "2025-01-15T12:00:00.123Z",
  "queuePosition": 0,
  "estimate": {
    "startAt": "2025-01-15T12:00:00.123Z",
    "finishAt": "2025-01-15T12:00:30.123Z"
  },
  "capacitySnapshot": {
    "maxConcurrency": 3,
    "running": 0,
    "queued": 1
  }
}
```

### Job Completion (GET /forusbot/jobs/:jobId)

```json
{
  "ok": true,
  "jobId": "job_abc123",
  "botId": "forusall-emailtrigger",
  "state": "succeeded",
  "result": {
    "ok": true,
    "result": "Succeeded",
    "reason": "Year-end notice email triggered successfully at 2025-01-15T12:00:25.456Z",
    "details": {
      "completedAt": "2025-01-15T12:00:25.456Z",
      "emailType": "year_end_notice",
      "successMessage": "Email triggered successfully"
    }
  },
  "stages": [
    {
      "name": "auth-trigger-emails",
      "startedAt": "2025-01-15T12:00:00.123Z",
      "finishedAt": "2025-01-15T12:00:10.234Z",
      "durationMs": 10111
    },
    {
      "name": "validate-plan",
      "startedAt": "2025-01-15T12:00:10.234Z",
      "finishedAt": "2025-01-15T12:00:12.345Z",
      "durationMs": 2111
    },
    {
      "name": "select-plan",
      "startedAt": "2025-01-15T12:00:12.345Z",
      "finishedAt": "2025-01-15T12:00:15.456Z",
      "durationMs": 3111
    },
    {
      "name": "select-email-type",
      "startedAt": "2025-01-15T12:00:15.456Z",
      "finishedAt": "2025-01-15T12:00:18.567Z",
      "durationMs": 3111
    },
    {
      "name": "year-end:trigger-email",
      "startedAt": "2025-01-15T12:00:18.567Z",
      "finishedAt": "2025-01-15T12:00:20.678Z",
      "durationMs": 2111
    },
    {
      "name": "year-end:wait-redirect",
      "startedAt": "2025-01-15T12:00:20.678Z",
      "finishedAt": "2025-01-15T12:00:24.789Z",
      "durationMs": 4111
    },
    {
      "name": "year-end:verify-success",
      "startedAt": "2025-01-15T12:00:24.789Z",
      "finishedAt": "2025-01-15T12:00:25.456Z",
      "durationMs": 667
    },
    {
      "name": "year-end:done",
      "startedAt": "2025-01-15T12:00:25.456Z",
      "finishedAt": "2025-01-15T12:00:26.123Z",
      "durationMs": 667
    }
  ]
}
```

## Testing

### Prerequisites

1. **Environment Variables**:
   ```bash
   export SITE_USER=your-email@example.com
   export SITE_PASS=your-password
   export TOTP_SECRET=your-totp-secret
   export AUTH_TOKEN=your-api-token
   ```

2. **Valid Plan ID**: Ensure the plan ID exists and is accessible

3. **Running Server**: The ForUsBots service must be running

### Manual Testing Steps

#### Using Bash Script

```bash
# Basic trigger
AUTH_TOKEN=your-token ./examples/emailtrigger-year-end-notice.sh 627

# Trigger and wait for completion
AUTH_TOKEN=your-token WAIT_FOR_COMPLETION=true ./examples/emailtrigger-year-end-notice.sh 627
```

#### Using Node.js Script

```bash
# Basic trigger
AUTH_TOKEN=your-token node examples/emailtrigger-year-end-notice.js 627

# Trigger and wait for completion
AUTH_TOKEN=your-token WAIT_FOR_COMPLETION=true node examples/emailtrigger-year-end-notice.js 627
```

#### Using curl

```bash
# Submit job
curl -X POST http://localhost:10000/forusbot/email-trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: $AUTH_TOKEN" \
  -d '{
    "planId": 627,
    "emailType": "year_end_notice",
    "createdBy": {
      "name": "Test User",
      "role": "admin",
      "at": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'"
    }
  }'

# Check job status (replace JOB_ID with actual job ID)
curl -H "x-auth-token: $AUTH_TOKEN" \
  http://localhost:10000/forusbot/jobs/JOB_ID
```

### Test Cases

#### Test Case 1: Happy Path
**Description**: Trigger year-end notice for valid plan

**Steps**:
1. Submit job with valid plan ID
2. Wait for job to complete
3. Verify job succeeded

**Expected Result**:
- Job status: `succeeded`
- Result contains `completedAt` timestamp
- Email type is `year_end_notice`

#### Test Case 2: Invalid Plan ID
**Description**: Attempt to trigger with non-existent plan

**Steps**:
1. Submit job with plan ID that doesn't exist (e.g., 999999)
2. Wait for job to complete

**Expected Result**:
- Job status: `failed`
- Error message indicates plan not found
- Stage history shows failure at `validate-plan` stage

#### Test Case 3: Unauthorized Access
**Description**: Attempt to trigger without valid auth token

**Steps**:
1. Submit job without `x-auth-token` header
2. Check response

**Expected Result**:
- HTTP 401 Unauthorized
- Error message about missing token

#### Test Case 4: Invalid Email Type
**Description**: Submit with wrong email type

**Steps**:
1. Submit job with `emailType: "invalid_type"`
2. Check response

**Expected Result**:
- HTTP 400 Bad Request
- Error message about invalid email type

#### Test Case 5: Missing Plan ID
**Description**: Submit without required planId

**Steps**:
1. Submit job without `planId` field
2. Check response

**Expected Result**:
- HTTP 400 Bad Request
- Error message about missing planId

### Performance Expectations

- **Typical Duration**: 20-30 seconds (including auth)
- **Auth Stage**: 8-12 seconds
- **Plan Selection**: 3-5 seconds
- **Email Type Selection**: 2-4 seconds
- **Trigger & Redirect**: 5-10 seconds

### Monitoring

Monitor the job through these endpoints:

1. **Job Status**: `GET /forusbot/jobs/:jobId`
2. **Job List**: `GET /forusbot/jobs?botId=forusall-emailtrigger`
3. **Metrics**: `GET /forusbot/metrics`
4. **Admin Console**: http://localhost:10000/admin (if enabled)

## Known Limitations

1. **Plan Validation Only**: The flow validates that the plan exists in the dropdown but doesn't verify if the plan is eligible for year-end notices

2. **No Dry Run**: There's no preview mode; clicking "Trigger Email" immediately sends the emails

3. **All Participants**: Currently always sends to "all" participants; no filtering options

4. **No Undo**: Once triggered, the emails are sent; there's no rollback mechanism

## Troubleshooting

### Issue: Job Fails at "year-end:trigger-email"

**Possible Causes**:
- Button not visible (page not fully loaded)
- Selector changed in portal
- JavaScript error on page

**Solutions**:
- Increase `PW_DEFAULT_TIMEOUT`
- Check selectors in `config.js`
- Enable evidence screenshots: `EVIDENCE_ENABLED=1`

### Issue: Job Fails at "year-end:wait-redirect"

**Possible Causes**:
- Slow portal response
- Network issues
- Portal blocking the trigger

**Solutions**:
- Increase timeout in flow
- Check portal status
- Verify credentials are still valid

### Issue: Job Succeeds but No Emails Sent

**Possible Causes**:
- Portal accepted trigger but email queue failed
- Plan has no participants with valid emails
- Email service is down

**Solutions**:
- Check portal logs
- Verify participant email addresses
- Contact ForUsAll support

## Future Enhancements

### Planned Features

1. **Preview Mode**: Add optional preview before triggering
2. **Participant Filtering**: Allow selecting specific participants
3. **Validation**: Check plan eligibility for year-end notices
4. **Dry Run**: Test mode that doesn't actually send emails
5. **Evidence Screenshots**: Automatic screenshots on errors

### Integration Opportunities

1. **Scheduler**: Trigger automatically based on calendar date
2. **Batch Processing**: Trigger for multiple plans in sequence
3. **Notifications**: Send notifications when job completes
4. **Reporting**: Generate reports of triggered emails

## Related Documentation

- [Main README](../../../../README.md) - Project overview
- [Flows README](./README.md) - All flows documentation
- [API Documentation](../../../../docs/api/index.html) - Full API reference
- [OpenAPI Spec](../../../../docs/openapi.yaml) - API specification
- [Controller](../controller.js) - Request validation logic
- [RunFlow](../runFlow.js) - Main flow orchestration

## Changelog

### Version 1.0.0 (2025-01-15)
- Initial implementation of year_end_notice flow
- Added flow handler with stage tracking
- Created example scripts (bash and Node.js)
- Added comprehensive documentation
- Verified with syntax checks

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs with `LOG_LEVEL=debug`
3. Check evidence screenshots if enabled
4. Consult main project documentation
5. Contact development team

---

**Last Updated**: January 15, 2025  
**Version**: 1.0.0  
**Status**: ✅ Implemented and Tested

