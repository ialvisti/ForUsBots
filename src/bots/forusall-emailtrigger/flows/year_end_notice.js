// src/bots/forusall-emailtrigger/flows/year_end_notice.js

const { waitForUrl } = require("./_common");

/**
 * Flow for year_end_notice email type
 * This is a simple flow that just triggers the email after plan selection
 */
module.exports = async function runYearEndNotice({ page, selectors: s, jobCtx }) {
  try {
    // Stage 1: Trigger Email button click
    jobCtx?.setStage?.("year-end:trigger-email");
    
    // Wait for trigger button to be visible and enabled
    const triggerBtn = "#triggerEmail";
    await page.waitForSelector(triggerBtn, { 
      state: "visible", 
      timeout: 8000 
    });

    // Set up dialog handler to accept confirmation BEFORE clicking
    page.once("dialog", (dialog) => {
      dialog.accept().catch(() => {});
    });

    // Click the Trigger Email button
    await page.click(triggerBtn, { noWaitAfter: true });

    // Stage 2: Wait for redirect back to trigger_emails page
    jobCtx?.setStage?.("year-end:wait-redirect");
    
    // First attempt to wait for redirect
    let redirected = await waitForUrl(page, /\/trigger_emails(\?|$)/, {
      timeout: 20000,
    });

    // If first attempt fails, try again with additional timeout
    if (!redirected) {
      redirected = await waitForUrl(page, /\/trigger_emails(\?|$)/, {
        timeout: 15000,
      });
      
      // If still not redirected, check for the shell element
      if (!redirected) {
        const shell = await page
          .waitForSelector("#trigger-emails", { timeout: 8000 })
          .catch(() => null);
        
        if (!shell && !/\/trigger_emails/.test(page.url())) {
          return {
            result: "Failed",
            reason: "Did not return to /trigger_emails after Trigger Email",
            details: { 
              currentUrl: page.url(),
              expectedPattern: "/trigger_emails"
            },
          };
        }
      }
    }

    // Stage 3: Verify success alert appeared
    jobCtx?.setStage?.("year-end:verify-success");
    
    // Wait for success alert to appear
    const successAlert = await page
      .waitForSelector(".alert.alert-success", { timeout: 8000 })
      .catch(() => null);
    
    // Read the success message if present
    let successMessage = null;
    if (successAlert) {
      successMessage = await page
        .evaluate(() => {
          const alertDiv = document.querySelector(".alert.alert-success");
          if (!alertDiv) return null;
          const noticeDiv = alertDiv.querySelector("#flash_notice, .flash_notice, div");
          return noticeDiv ? noticeDiv.textContent.trim() : alertDiv.textContent.trim();
        })
        .catch(() => null);
    }

    // If no success alert found, check if there's an error alert instead
    if (!successAlert) {
      const errorAlert = await page
        .waitForSelector(".alert.alert-danger, .alert.alert-error", { timeout: 2000 })
        .catch(() => null);
      
      if (errorAlert) {
        const errorMessage = await page
          .evaluate(() => {
            const alertDiv = document.querySelector(".alert.alert-danger, .alert.alert-error");
            return alertDiv ? alertDiv.textContent.trim() : "Unknown error";
          })
          .catch(() => "Unknown error");
        
        return {
          result: "Failed",
          reason: "Email trigger failed with error alert",
          details: {
            errorMessage,
            currentUrl: page.url()
          },
        };
      }
      
      // No success or error alert found - this is suspicious
      return {
        result: "Failed",
        reason: "No success confirmation alert found after redirect",
        details: {
          currentUrl: page.url(),
          note: "Expected .alert.alert-success element but none was found"
        },
      };
    }

    // Stage 4: Done - Success confirmed
    jobCtx?.setStage?.("year-end:done");
    const completedAt = new Date().toISOString();
    
    return {
      result: "Succeeded",
      reason: `Year-end notice email triggered successfully at ${completedAt}`,
      details: { 
        completedAt,
        emailType: "year_end_notice",
        successMessage: successMessage || "Email triggered successfully"
      },
    };
  } catch (err) {
    return {
      result: "Failed",
      reason: err?.message || String(err),
      details: {
        error: String(err),
        stack: err?.stack || null
      },
    };
  }
};

