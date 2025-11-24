# Quick Start: Year End Notice Email Trigger

## 🚀 One-Minute Setup

### Prerequisites
```bash
# Set your authentication token
export AUTH_TOKEN=your-token-here
```

### Basic Usage

#### Option 1: Bash Script (Recommended for Shell)
```bash
cd /Users/ivanalvis/Desktop/ForUsBots\ copy

# Trigger email for plan 627
./examples/emailtrigger-year-end-notice.sh 627

# Trigger and wait for completion
WAIT_FOR_COMPLETION=true ./examples/emailtrigger-year-end-notice.sh 627
```

#### Option 2: Node.js Script (Recommended for Automation)
```bash
cd /Users/ivanalvis/Desktop/ForUsBots\ copy

# Trigger email for plan 627
node examples/emailtrigger-year-end-notice.js 627

# Trigger and wait for completion
WAIT_FOR_COMPLETION=true node examples/emailtrigger-year-end-notice.js 627
```

#### Option 3: Direct API Call (curl)
```bash
curl -X POST http://localhost:10000/forusbot/email-trigger \
  -H "Content-Type: application/json" \
  -H "x-auth-token: $AUTH_TOKEN" \
  -d '{
    "planId": 627,
    "emailType": "year_end_notice",
    "createdBy": {
      "name": "Your Name",
      "role": "admin",
      "at": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'"
    }
  }'
```

---

## 📝 Quick API Reference

### Submit Job
```http
POST /forusbot/email-trigger
Content-Type: application/json
x-auth-token: your-token

{
  "planId": 627,
  "emailType": "year_end_notice"
}
```

**Response (202 Accepted)**:
```json
{
  "ok": true,
  "jobId": "job_abc123",
  "acceptedAt": "2025-01-15T12:00:00.123Z",
  "estimate": {
    "startAt": "2025-01-15T12:00:00.123Z",
    "finishAt": "2025-01-15T12:00:30.123Z"
  }
}
```

### Check Job Status
```bash
curl -H "x-auth-token: $AUTH_TOKEN" \
  http://localhost:10000/forusbot/jobs/{jobId}
```

**Response (Succeeded)**:
```json
{
  "ok": true,
  "jobId": "job_abc123",
  "state": "succeeded",
  "result": {
    "result": "Succeeded",
    "reason": "Year-end notice email triggered successfully",
    "details": {
      "completedAt": "2025-01-15T12:00:25.456Z",
      "emailType": "year_end_notice"
    }
  }
}
```

---

## 🔍 What Gets Selected

When you trigger a year-end notice:

1. **Plan**: The plan ID you specify (e.g., 627)
2. **Email Type**: `year_end_notice`
3. **Participants**: **All** participants in the plan (automatic)

---

## ⏱️ Expected Duration

- **Total Time**: ~20-30 seconds
- **Authentication**: ~8-12 seconds
- **Plan Selection**: ~3-5 seconds
- **Trigger & Redirect**: ~5-10 seconds

---

## ✅ Success Indicators

The job succeeded if:
- Job state is `"succeeded"`
- Result contains `completedAt` timestamp
- You're redirected back to `/trigger_emails` page

---

## ❌ Common Errors

### "PlanId '...' not available in the plan selector"
- **Cause**: Plan doesn't exist or you don't have access
- **Fix**: Verify plan ID is correct and accessible

### "Did not return to /trigger_emails after Trigger Email"
- **Cause**: Slow portal response or network issue
- **Fix**: Retry the request, check portal status

### "Missing env: SITE_USER/SITE_PASS/TOTP_SECRET"
- **Cause**: Server environment variables not set
- **Fix**: Set credentials in server's `.env` file

---

## 📚 Full Documentation

For detailed information, see:

1. **Implementation Summary**: `IMPLEMENTATION_SUMMARY_YEAR_END_NOTICE.md`
2. **Flow Documentation**: `src/bots/forusall-emailtrigger/flows/YEAR_END_NOTICE.md`
3. **All Flows Guide**: `src/bots/forusall-emailtrigger/flows/README.md`
4. **API Documentation**: `docs/api/index.html`

---

## 🧪 Test It Now

```bash
# 1. Set your token
export AUTH_TOKEN=your-actual-token

# 2. Quick test (bash)
./examples/emailtrigger-year-end-notice.sh 627

# 3. Quick test (Node.js)
node examples/emailtrigger-year-end-notice.js 627
```

---

## 🆘 Need Help?

Run the examples with `--help`:
```bash
./examples/emailtrigger-year-end-notice.sh --help
node examples/emailtrigger-year-end-notice.js --help
```

Check troubleshooting guide:
```bash
cat src/bots/forusall-emailtrigger/flows/YEAR_END_NOTICE.md
```

---

## 📊 Monitor Jobs

### View All Jobs
```bash
curl -H "x-auth-token: $AUTH_TOKEN" \
  http://localhost:10000/forusbot/jobs?botId=forusall-emailtrigger
```

### View Specific Job
```bash
curl -H "x-auth-token: $AUTH_TOKEN" \
  http://localhost:10000/forusbot/jobs/{jobId}
```

### Admin Console (if enabled)
Open in browser: http://localhost:10000/admin

---

**Ready to use! 🎉**

The `year_end_notice` flow is fully implemented and tested.

