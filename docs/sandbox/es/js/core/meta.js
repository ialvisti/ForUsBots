// docs/sandbox/js/core/meta.js
export const SECTION_CAPTIONS = {
  "COVER LETTERS": ["Other"],
  "PLAN DOCUMENTS": [
    "Basic Plan Documents",
    "Adoption Agreement",
    "Joinder Agreement",
    "IRS Determination Letter",
    "Fidelity Bond",
    "Funding/QDRO/Loan",
    "Investment Policy Statement",
    "Other",
  ],
  "CONTRACTS & AGREEMENTS": [
    "Plan Service Agreement",
    "ADV Part II",
    "3(16) Contract",
    "Recordkeeper Agreement",
    "Sponsor Fee Disclosure",
    "Other",
  ],
  // Alias guard (typo)
  "CONTACTS & AGREEMENTS": [
    "Plan Service Agreement",
    "ADV Part II",
    "3(16) Contract",
    "Recordkeeper Agreement",
    "Sponsor Fee Disclosure",
    "Other",
  ],
  "PARTICIPANT NOTICES": [
    "Annual Notices",
    "Auto Enrollment Notice",
    "Participant Introduction Packet",
    "Summary Plan Description",
    "Participant Fee Disclosure",
    "ForUsAll Participant Fee Disclosure",
    "QDIA Notice",
    "Blackout Notice",
    "Summary Annual Report",
    "Fund Information",
    "Plan Highlights",
    "Safe Harbor Notice",
    "Force Out Notice",
    "Fund Lineup Change Notice",
    "LT Force Out Form",
    "Year End Notice Packet",
    "Summary of Material Modifications",
    "Other",
  ],
  COMPLIANCE: ["Form 5500", "Other"],
  "OTHER DOCUMENTS": ["Other"],
  "AUDIT DOCUMENTS": ["Election History", "Pay Data", "Cash Transfer", "Other"],
};

export function oneLineMeta({
  planId,
  section,
  caption,
  status,
  effectiveDate,
  captionOtherText,
}) {
  const meta = {
    planId: planId?.value ? Number(planId.value) : undefined,
    formData: {
      section: (section.value || "").trim(),
      caption: (caption.value || "").trim(),
      status: (status.value || "").trim(),
      effectiveDate: (effectiveDate.value || "").trim(),
    },
  };
  const isOther = (meta.formData.caption || "").toLowerCase() === "other";
  if (isOther)
    meta.formData.captionOtherText = (captionOtherText.value || "").trim();
  return JSON.stringify(meta);
}
