#!/bin/bash
# Example: Trigger year_end_notice email for a plan
# This script demonstrates how to trigger a year-end notice email using the forusall-emailtrigger bot

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:10000}"
AUTH_TOKEN="${AUTH_TOKEN:-your-auth-token-here}"
PLAN_ID="${PLAN_ID:-627}"

# Function to make API call
trigger_year_end_notice() {
  local plan_id=$1
  
  echo "Triggering year-end notice email for plan ID: ${plan_id}"
  echo "---"
  
  response=$(curl -s -X POST "${API_BASE_URL}/forusbot/email-trigger" \
    -H "Content-Type: application/json" \
    -H "x-auth-token: ${AUTH_TOKEN}" \
    -d "{
      \"planId\": ${plan_id},
      \"emailType\": \"year_end_notice\",
      \"createdBy\": {
        \"name\": \"Script User\",
        \"role\": \"admin\",
        \"at\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\"
      }
    }")
  
  echo "Response:"
  echo "$response" | jq '.' 2>/dev/null || echo "$response"
  echo ""
  
  # Extract jobId if available
  job_id=$(echo "$response" | jq -r '.jobId // empty' 2>/dev/null)
  
  if [ -n "$job_id" ]; then
    echo "Job ID: ${job_id}"
    echo "---"
    echo "Check job status:"
    echo "curl -H 'x-auth-token: ${AUTH_TOKEN}' '${API_BASE_URL}/forusbot/jobs/${job_id}'"
    
    # Optional: Poll for job completion
    if [ "${WAIT_FOR_COMPLETION:-false}" = "true" ]; then
      echo ""
      echo "Waiting for job completion..."
      poll_job_status "$job_id"
    fi
  else
    echo "Error: Could not extract job ID from response"
    exit 1
  fi
}

# Function to poll job status
poll_job_status() {
  local job_id=$1
  local max_attempts=60
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    sleep 2
    attempt=$((attempt + 1))
    
    status_response=$(curl -s -H "x-auth-token: ${AUTH_TOKEN}" \
      "${API_BASE_URL}/forusbot/jobs/${job_id}")
    
    state=$(echo "$status_response" | jq -r '.state // empty' 2>/dev/null)
    
    if [ "$state" = "succeeded" ]; then
      echo "✓ Job completed successfully!"
      echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
      exit 0
    elif [ "$state" = "failed" ]; then
      echo "✗ Job failed!"
      echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
      exit 1
    elif [ "$state" = "running" ]; then
      echo "⋯ Job is running... (attempt ${attempt}/${max_attempts})"
    elif [ "$state" = "queued" ]; then
      echo "⋯ Job is queued... (attempt ${attempt}/${max_attempts})"
    else
      echo "? Unknown state: ${state}"
    fi
  done
  
  echo "Timeout waiting for job completion"
  exit 1
}

# Main execution
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: $0 [PLAN_ID]"
  echo ""
  echo "Triggers a year-end notice email for the specified plan."
  echo ""
  echo "Environment variables:"
  echo "  API_BASE_URL          API base URL (default: http://localhost:10000)"
  echo "  AUTH_TOKEN            Authentication token (required)"
  echo "  PLAN_ID               Plan ID (default: 627)"
  echo "  WAIT_FOR_COMPLETION   Wait for job to complete (default: false)"
  echo ""
  echo "Examples:"
  echo "  # Trigger for plan 627"
  echo "  AUTH_TOKEN=your-token $0"
  echo ""
  echo "  # Trigger for plan 500 and wait for completion"
  echo "  AUTH_TOKEN=your-token WAIT_FOR_COMPLETION=true $0 500"
  exit 0
fi

# Use command line argument if provided, otherwise use env var
PLAN_ID="${1:-${PLAN_ID}}"

# Validate AUTH_TOKEN
if [ "${AUTH_TOKEN}" = "your-auth-token-here" ]; then
  echo "Error: Please set AUTH_TOKEN environment variable"
  echo "Example: AUTH_TOKEN=your-token $0"
  exit 1
fi

# Execute
trigger_year_end_notice "$PLAN_ID"

