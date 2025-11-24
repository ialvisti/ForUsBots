#!/usr/bin/env node
/**
 * Example: Trigger year_end_notice email using Node.js
 * 
 * This script demonstrates how to trigger a year-end notice email
 * using the forusall-emailtrigger bot with Node.js fetch API.
 * 
 * Usage:
 *   node emailtrigger-year-end-notice.js [planId]
 * 
 * Environment variables:
 *   API_BASE_URL - API base URL (default: http://localhost:10000)
 *   AUTH_TOKEN - Authentication token (required)
 *   PLAN_ID - Plan ID (default: 627)
 *   WAIT_FOR_COMPLETION - Wait for job to complete (default: false)
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:10000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PLAN_ID = process.argv[2] || process.env.PLAN_ID || 627;
const WAIT_FOR_COMPLETION = process.env.WAIT_FOR_COMPLETION === 'true';

/**
 * Trigger year-end notice email
 */
async function triggerYearEndNotice(planId) {
  if (!AUTH_TOKEN || AUTH_TOKEN === 'your-auth-token-here') {
    console.error('Error: Please set AUTH_TOKEN environment variable');
    console.error('Example: AUTH_TOKEN=your-token node emailtrigger-year-end-notice.js');
    process.exit(1);
  }

  console.log(`Triggering year-end notice email for plan ID: ${planId}`);
  console.log('---');

  try {
    const response = await fetch(`${API_BASE_URL}/forusbot/email-trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': AUTH_TOKEN,
      },
      body: JSON.stringify({
        planId: Number(planId),
        emailType: 'year_end_notice',
        createdBy: {
          name: 'Node.js Script',
          role: 'admin',
          at: new Date().toISOString(),
        },
      }),
    });

    const data = await response.json();

    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    if (data.ok && data.jobId) {
      console.log(`Job ID: ${data.jobId}`);
      console.log('---');
      console.log('Check job status:');
      console.log(`curl -H 'x-auth-token: ${AUTH_TOKEN}' '${API_BASE_URL}/forusbot/jobs/${data.jobId}'`);

      if (WAIT_FOR_COMPLETION) {
        console.log('');
        console.log('Waiting for job completion...');
        await pollJobStatus(data.jobId);
      }
    } else {
      console.error('Error: Could not extract job ID from response');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error triggering email:', error.message);
    process.exit(1);
  }
}

/**
 * Poll job status until completion
 */
async function pollJobStatus(jobId, maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const response = await fetch(`${API_BASE_URL}/forusbot/jobs/${jobId}`, {
        headers: {
          'x-auth-token': AUTH_TOKEN,
        },
      });

      const data = await response.json();

      if (data.state === 'succeeded') {
        console.log('✓ Job completed successfully!');
        console.log(JSON.stringify(data, null, 2));
        return;
      } else if (data.state === 'failed') {
        console.log('✗ Job failed!');
        console.log(JSON.stringify(data, null, 2));
        process.exit(1);
      } else if (data.state === 'running') {
        console.log(`⋯ Job is running... (attempt ${attempt + 1}/${maxAttempts})`);
      } else if (data.state === 'queued') {
        console.log(`⋯ Job is queued... (attempt ${attempt + 1}/${maxAttempts})`);
      } else {
        console.log(`? Unknown state: ${data.state}`);
      }
    } catch (error) {
      console.error('Error polling job status:', error.message);
    }
  }

  console.error('Timeout waiting for job completion');
  process.exit(1);
}

/**
 * Show help message
 */
function showHelp() {
  console.log('Usage: node emailtrigger-year-end-notice.js [PLAN_ID]');
  console.log('');
  console.log('Triggers a year-end notice email for the specified plan.');
  console.log('');
  console.log('Environment variables:');
  console.log('  API_BASE_URL          API base URL (default: http://localhost:10000)');
  console.log('  AUTH_TOKEN            Authentication token (required)');
  console.log('  PLAN_ID               Plan ID (default: 627)');
  console.log('  WAIT_FOR_COMPLETION   Wait for job to complete (default: false)');
  console.log('');
  console.log('Examples:');
  console.log('  # Trigger for plan 627');
  console.log('  AUTH_TOKEN=your-token node emailtrigger-year-end-notice.js');
  console.log('');
  console.log('  # Trigger for plan 500 and wait for completion');
  console.log('  AUTH_TOKEN=your-token WAIT_FOR_COMPLETION=true node emailtrigger-year-end-notice.js 500');
}

// Main execution
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

triggerYearEndNotice(PLAN_ID);

