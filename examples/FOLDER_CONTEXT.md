# /examples/ - Integration Examples Context

## Purpose
This directory contains example integrations, workflows, and usage patterns for the ForUsBots API. These examples help developers integrate ForUsBots into their systems.

## Available Examples

### `curl.sh`
**Purpose**: Shell script demonstrating API usage with curl.

**Contains**:
- Authentication examples (x-auth-token header)
- Job submission (vault-file-upload)
- Job polling (GET /jobs/:id)
- Job listing with filters
- Error handling examples
- Token masking in logs

**Usage**:
```bash
# Set your token
export FORUSBOT_TOKEN="your_token_here"

# Run examples
bash examples/curl.sh
```

**Example Snippets**:
```bash
# Upload file
curl -X POST "https://api/forusbot/vault-file-upload" \
  -H "x-auth-token: $FORUSBOT_TOKEN" \
  -H "x-filename: agreement.pdf" \
  -H "x-meta: {\"planId\":580,\"formData\":{...}}" \
  --data-binary @document.pdf

# Poll job status
curl -X GET "https://api/forusbot/jobs/$JOB_ID" \
  -H "x-auth-token: $FORUSBOT_TOKEN"
```

---

### `forus-bot-n8n.json`
**Purpose**: n8n workflow template for integrating ForUsBots.

**Contains**:
- HTTP Request nodes configured for ForUsBots API
- Authentication setup (credentials)
- Job submission + polling loop
- Error handling nodes
- Conditional logic for job states
- Notification nodes (email, Slack, etc.)

**Import Instructions**:
1. Open n8n workflow editor
2. Click "Import from File"
3. Select `forus-bot-n8n.json`
4. Configure credentials (ForUsBots token)
5. Test workflow

**Key Nodes**:
- **HTTP Request (Submit)**: POST /vault-file-upload
- **Wait**: Delay between polls
- **HTTP Request (Poll)**: GET /jobs/:id
- **IF (State Check)**: Check if job complete
- **Loop**: Continue polling until done
- **Success Handler**: Process successful result
- **Error Handler**: Handle failures

**Customization**:
- Adjust polling interval (default 5s)
- Change notification destinations
- Add data transformation nodes
- Integrate with other services (Dropbox, Google Drive, etc.)

---

## When to Work Here

### Add New Example When:
- Supporting a new integration platform (Zapier, Make, etc.)
- Demonstrating new bot features
- Creating common workflow patterns
- Providing language-specific SDKs (Python, JavaScript, etc.)

### Update Existing Example When:
- API endpoints change
- Request/response formats update
- Adding error handling improvements
- Better practices discovered

### DO NOT Add Examples For:
- Internal implementation details (use `/docs/` for architecture)
- Test code (use test directories within `/src/`)
- Prototype code (use separate scratch repos)

---

## Example Patterns

### REST API Integration
```javascript
// JavaScript/Node.js example
const axios = require('axios');

const FORUSBOT_API = 'https://api/forusbot';
const TOKEN = process.env.FORUSBOT_TOKEN;

async function uploadDocument(file, metadata) {
  // Submit job
  const submitRes = await axios.post(
    `${FORUSBOT_API}/vault-file-upload`,
    file,
    {
      headers: {
        'x-auth-token': TOKEN,
        'x-filename': metadata.filename,
        'x-meta': JSON.stringify(metadata)
      }
    }
  );
  
  const jobId = submitRes.data.jobId;
  
  // Poll until complete
  while (true) {
    const statusRes = await axios.get(
      `${FORUSBOT_API}/jobs/${jobId}`,
      { headers: { 'x-auth-token': TOKEN } }
    );
    
    const job = statusRes.data;
    if (job.state === 'succeeded') {
      return job.result;
    } else if (job.state === 'failed') {
      throw new Error(job.error);
    }
    
    await sleep(5000); // Wait 5s before polling again
  }
}
```

### Python Integration
```python
import requests
import time
import os

FORUSBOT_API = 'https://api/forusbot'
TOKEN = os.environ['FORUSBOT_TOKEN']

def upload_document(file_path, metadata):
    # Submit job
    with open(file_path, 'rb') as f:
        response = requests.post(
            f'{FORUSBOT_API}/vault-file-upload',
            data=f,
            headers={
                'x-auth-token': TOKEN,
                'x-filename': os.path.basename(file_path),
                'x-meta': json.dumps(metadata)
            }
        )
    
    job_id = response.json()['jobId']
    
    # Poll until complete
    while True:
        status = requests.get(
            f'{FORUSBOT_API}/jobs/{job_id}',
            headers={'x-auth-token': TOKEN}
        ).json()
        
        if status['state'] == 'succeeded':
            return status['result']
        elif status['state'] == 'failed':
            raise Exception(status['error'])
        
        time.sleep(5)
```

---

## Integration Best Practices

### Authentication
- Store tokens securely (environment variables, secret managers)
- Never commit tokens to version control
- Rotate tokens regularly
- Use separate tokens per environment (dev, staging, prod)

### Job Polling
- Start with 5-second intervals
- Implement exponential backoff for long-running jobs
- Set maximum poll attempts (timeout)
- Handle all job states (queued, running, succeeded, failed, canceled)

### Error Handling
- Check HTTP status codes
- Parse error response body
- Retry transient errors (503, 502, timeout)
- Don't retry client errors (400, 401, 403, 422)
- Log errors with context (job ID, timestamp)

### Performance
- Reuse HTTP connections (connection pooling)
- Batch job submissions when possible
- Implement client-side rate limiting
- Cache job results when appropriate

---

## Documentation

### Example Structure
Each example should include:
1. **Purpose**: What the example demonstrates
2. **Prerequisites**: Required tools, libraries, credentials
3. **Installation**: Setup instructions
4. **Configuration**: How to configure tokens, endpoints
5. **Usage**: How to run the example
6. **Output**: Expected results
7. **Troubleshooting**: Common issues and solutions

### Code Comments
- Explain non-obvious logic
- Document required ENV vars
- Note API-specific quirks
- Include example values (masked)

---

## Testing Examples

### Manual Testing
- Run each example against test environment
- Verify successful execution
- Test error cases (invalid token, missing file, etc.)
- Check output formatting

### Automated Testing
- Include in CI/CD if possible
- Use mock API responses
- Test against sandbox endpoint
- Validate generated code syntax

---

## Integration Platforms

### Current Support
- **curl** (command line)
- **n8n** (workflow automation)

### Future Platforms (Ideas)
- **Zapier**: Zap template
- **Make (Integromat)**: Scenario template
- **Postman**: Collection export
- **Insomnia**: Workspace export
- **Python SDK**: pip installable library
- **JavaScript SDK**: npm package
- **Ruby SDK**: gem
- **PHP SDK**: composer package

---

## Dependencies

### curl.sh
- `curl`: HTTP client
- `jq`: JSON parsing (optional, for pretty output)
- `bash` 4.0+

### n8n Workflow
- n8n instance (cloud or self-hosted)
- HTTP Request credentials

### Future SDKs
- Language-specific HTTP libraries
- JSON parsers
- Testing frameworks

---

## Contribution Guidelines

### Adding New Examples
1. Place in appropriate subdirectory (by language/platform)
2. Include README.md with setup instructions
3. Test thoroughly before committing
4. Add to this FOLDER_CONTEXT.md
5. Update main README.md if significant

### Example Quality Standards
- Complete, runnable examples (not snippets)
- Clear variable names
- Commented code
- Error handling included
- Environment variables for configuration
- No hardcoded credentials

---

## Support

### Where to Get Help
- API Documentation: `/docs/api`
- Sandbox Testing: `/docs/sandbox`
- OpenAPI Spec: `/docs/openapi.yaml`
- GitHub Issues: (if applicable)
- Team Contact: (internal)

---

## Future Enhancements
- **SDK development**: Official client libraries
- **Example repository**: Separate repo with more examples
- **Video tutorials**: Screen recordings of integrations
- **Starter templates**: Full project scaffolds
- **Integration gallery**: Showcase community integrations

