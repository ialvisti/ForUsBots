// src/providers/forusall/config.js
// Config fija del proveedor ForUsAll: URLs, selectores y defaults del bot
module.exports.FIXED = {
  loginUrl: "https://employer.forusall.com/sign_in",
  uploadUrlTemplate:
    "https://employer.forusall.com/fv_documents_console/{planIdNumber}/manage_fv_document?add_new_document_record=true",
  selectors: {
    user: "#user_email",
    pass: "#user_password",
    loginButton: "#new_user > input.btn.btn-primary",
    otpInput: "#otp_attempt",
    otpSubmit:
      "body > main > div.container > div > div > div > div.panel-body > form > div:nth-child(4) > div > div > input",
    fileInput: "#fv_document_file",
    fileSubmit: "#add-new-document-record-form > div:nth-child(7) > input",
    form: {
      section: "#fv_header_title",
      caption: "#caption",
      status: "#status",
      effectiveDate: "#fv_document_effective_date",
      customCaption: "#fv_document_customized_caption",
      container: "form#add-new-document-record-form",
      // success: '.alert-success',
    },
  },
  options: {
    returnEvidenceBase64: false,
    saveEvidenceToTmp: true,

    // ✅ Nuevo flujo: tras Submit solo verificamos que el form quedó limpio
    clearWaitMs: 3000, // tiempo máximo para que los campos queden vacíos
    clearPollMs: 150, // frecuencia de chequeo mientras esperamos

    // opcional: tomar evidencia también en éxito
    evidenceOnSuccess: false,
  },
};
