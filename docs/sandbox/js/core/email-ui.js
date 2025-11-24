// docs/sandbox/js/core/email-ui.js
import { $ } from "./utils.js";

const ALLOWED_TYPES = [
  "monthly_balance",
  "onboard_communications",
  "new_hire_communications",
  "year_end_notice",
  "notify_auto-escalation",
  "summary_annual_notice",
  "statement_notice",
  "sponsor_quarterly_email",
  "generic_email",
  "force_out",
];

const GENERIC_KINDS = [
  "onboard_communications",
  "new_hire_communications",
  "year_end_notice",
  "notify_auto-escalation",
  "summary_annual_notice",
  "other",
];

export function wireEmailUI({ onChange }) {
  const emailTypeSelect = $("#emailType");
  const statementFields = $("#statementFields");
  const sponsorQuarterlyFields = $("#sponsorQuarterlyFields");
  const onboardNewHireFields = $("#onboardNewHireFields");
  const genericEmailFields = $("#genericEmailFields");

  // Update visibility based on emailType
  function updateEmailTypeVisibility() {
    const emailType = (emailTypeSelect?.value || "").trim();

    // Hide all conditional sections
    statementFields?.classList.add("hidden");
    sponsorQuarterlyFields?.classList.add("hidden");
    onboardNewHireFields?.classList.add("hidden");
    genericEmailFields?.classList.add("hidden");

    // Show relevant section
    if (emailType === "statement_notice") {
      statementFields?.classList.remove("hidden");
    } else if (emailType === "sponsor_quarterly_email") {
      sponsorQuarterlyFields?.classList.remove("hidden");
    } else if (
      emailType === "onboard_communications" ||
      emailType === "new_hire_communications"
    ) {
      onboardNewHireFields?.classList.remove("hidden");
    } else if (emailType === "generic_email") {
      genericEmailFields?.classList.remove("hidden");
    }

    onChange?.();
  }

  // Update generic email subtype visibility
  function updateGenericKindVisibility() {
    const kind = ($("#genericKind")?.value || "").trim();
    const otherTextWrap = $("#genericOtherTextWrap");
    const genericRkTypeWrap = $("#genericRkTypeWrap");
    const genericEmailToSendWrap = $("#genericEmailToSendWrap");

    otherTextWrap?.classList.toggle("hidden", kind !== "other");
    genericRkTypeWrap?.classList.toggle(
      "hidden",
      kind !== "onboard_communications"
    );
    genericEmailToSendWrap?.classList.toggle(
      "hidden",
      kind !== "onboard_communications" && kind !== "new_hire_communications"
    );

    onChange?.();
  }

  // Wire events
  emailTypeSelect?.addEventListener("change", updateEmailTypeVisibility);
  $("#genericKind")?.addEventListener("change", updateGenericKindVisibility);

  // Wire all input changes to refresh
  const allInputs = [
    "#emailPlanId",
    "#emailType",
    "#stYear",
    "#stQuarter",
    "#stSeason",
    "#sqYear",
    "#sqQuarter",
    "#sqCaNoteSubject",
    "#sqCaNoteDetails",
    "#sqCaUrl",
    "#sqQuarterlyInvestmentReviewUrl",
    "#sqNextReviewDate",
    "#sqNextReviewTime",
    "#onhRkType",
    "#onhPlanSnapshot",
    "#onhEmailToSend",
    "#onhConversationId",
    "#onhAttachments",
    "#geEnrolled",
    "#geNotEnrolled",
    "#geTerminated",
    "#geIneligible",
    "#geTerminatedParticipants",
    "#gePlanSnapshot",
    "#genericKind",
    "#genericOtherText",
    "#genericRkType",
    "#genericEmailToSend",
    "#genericConversationId",
    "#genericAttachments",
    "#genericTerminatedParticipants",
  ];

  allInputs.forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.addEventListener("input", onChange || (() => {}));
      el.addEventListener("change", onChange || (() => {}));
    }
  });

  // Initialize
  updateEmailTypeVisibility();
  updateGenericKindVisibility();
}

export function buildEmailBodyStr(pretty = false) {
  const planId = parseInt(($("#emailPlanId")?.value || "").trim(), 10);
  const emailType = ($("#emailType")?.value || "").trim();

  if (!planId || !emailType) return "{}";

  const body = {
    planId,
    emailType,
    participants: "all",
  };

  // Statement notice
  if (emailType === "statement_notice") {
    const year = parseInt(($("#stYear")?.value || "").trim(), 10);
    const quarter = parseInt(($("#stQuarter")?.value || "").trim(), 10);
    const season = ($("#stSeason")?.value || "").trim();
    if (year && quarter && season) {
      body.statement = { year, quarter, season };
    }
  }

  // Sponsor quarterly email
  if (emailType === "sponsor_quarterly_email") {
    const year = parseInt(($("#sqYear")?.value || "").trim(), 10);
    const quarter = parseInt(($("#sqQuarter")?.value || "").trim(), 10);
    const caNoteSubject = ($("#sqCaNoteSubject")?.value || "").trim();
    const caNoteDetails = ($("#sqCaNoteDetails")?.value || "").trim();
    const caUrl = ($("#sqCaUrl")?.value || "").trim();
    const quarterlyInvestmentReviewUrl = (
      $("#sqQuarterlyInvestmentReviewUrl")?.value || ""
    ).trim();
    const nextReviewDate = ($("#sqNextReviewDate")?.value || "").trim();
    const nextReviewTime = ($("#sqNextReviewTime")?.value || "").trim();

    if (
      year &&
      quarter &&
      caNoteSubject &&
      caNoteDetails &&
      caUrl &&
      quarterlyInvestmentReviewUrl &&
      nextReviewDate &&
      nextReviewTime
    ) {
      body.sponsorQuarterly = {
        year,
        quarter,
        caNoteSubject,
        caNoteDetails,
        caUrl,
        quarterlyInvestmentReviewUrl,
        nextReviewDate,
        nextReviewTime,
      };
    }
  }

  // Onboard or New Hire
  if (
    emailType === "onboard_communications" ||
    emailType === "new_hire_communications"
  ) {
    const rkType = ($("#onhRkType")?.value || "").trim();
    const planSnapshot = ($("#onhPlanSnapshot")?.value || "").trim();
    const emailToSend = ($("#onhEmailToSend")?.value || "onboard_email").trim();
    const conversationId = ($("#onhConversationId")?.value || "").trim();
    const attachments = ($("#onhAttachments")?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    body.onboardOrNewHire = {
      rkType: rkType || null,
      planSnapshot: planSnapshot || null,
      emailToSend,
      conversationId: conversationId || null,
      attachments,
    };
  }

  // Generic email
  if (emailType === "generic_email") {
    const enrolled = $("#geEnrolled")?.checked || false;
    const notEnrolled = $("#geNotEnrolled")?.checked || false;
    const terminated = $("#geTerminated")?.checked || false;
    const ineligible = $("#geIneligible")?.checked || false;
    const terminatedParticipants = (
      $("#geTerminatedParticipants")?.value || ""
    ).trim();
    const planSnapshot = ($("#gePlanSnapshot")?.value || "").trim();
    const kind = ($("#genericKind")?.value || "").trim();
    const otherText = ($("#genericOtherText")?.value || "").trim();
    const rkType = ($("#genericRkType")?.value || "").trim();
    const emailToSend = ($("#genericEmailToSend")?.value || "").trim();
    const conversationId = ($("#genericConversationId")?.value || "").trim();
    const attachments = ($("#genericAttachments")?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const genericTerminatedParticipants = (
      $("#genericTerminatedParticipants")?.value || ""
    ).trim();

    body.genericEmail = {
      audience: {
        enrolled,
        notEnrolled,
        terminated,
        ineligible,
        terminatedParticipants: terminatedParticipants || undefined,
      },
      planSnapshot: planSnapshot || null,
      subType: {
        kind,
        otherText: otherText || null,
        rkType: rkType || null,
        emailToSend: emailToSend || null,
        conversationId: conversationId || null,
        attachments,
        terminatedParticipants: genericTerminatedParticipants || undefined,
      },
    };
  }

  return JSON.stringify(body, null, pretty ? 2 : 0);
}

