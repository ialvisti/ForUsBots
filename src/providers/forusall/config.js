// src/providers/forusall/config.js
// Config fija del proveedor ForUsAll: URLs, selectores y defaults del bot
module.exports.FIXED = {
  loginUrl: "https://employer.forusall.com/sign_in",
  uploadUrlTemplate:
    "https://employer.forusall.com/fv_documents_console/{planIdNumber}/manage_fv_document?add_new_document_record=true",

  // URL del participante
  participantUrlTemplate:
    "https://employer.forusall.com/participants/{participantId}",

  selectors: {
    user: "#user_email",
    pass: "#user_password",
    loginButton: "#new_user > input.btn.btn-primary",

    // OTP primario histórico
    otpInput: "#otp_attempt",
    otpSubmit:
      "body > main > div.container > div > div > div > div.panel-body > form > div:nth-child(4) > div > div > input",

    // ⬇️ Alternativos de OTP (no rompen compatibilidad)
    otpInputsAlt: [
      'input[name="otp_attempt"]',
      "#otp_code",
      'input[name="otp_code"]',
      'input[type="tel"][autocomplete="one-time-code"]',
      "#two_factor_code",
      'input[name="two_factor_code"]',
      'input[name*="otp"]',
      'input[id*="otp"]',
    ],
    otpSubmitAlt: ['button[type="submit"]', 'input[type="submit"]'],

    // Upload (existente)
    fileInput: "#fv_document_file",
    fileSubmit: "#add-new-document-record-form > div:nth-child(7) > input",
    form: {
      section: "#fv_header_title",
      caption: "#caption",
      status: "#status",
      effectiveDate: "#fv_document_effective_date",
      customCaption: "#fv_document_customized_caption",
      container: "form#add-new-document-record-form",
    },

    // MFA Reset selectors
    mfaReset: {
      panel: "#mfa", // contenedor del tab
      panelDetails: "#mfa-details", // bloque interno
      status: "#mfa_status", // “not enrolled” / otros
      resetButton: "#reset-mfa", // botón Reset MFA
      refreshLink: "#refresh_mfa", // enlace “Refresh”
      navLink: 'a[href="#mfa"]', // pestaña de navegación
    },
  },

  options: {
    returnEvidenceBase64: false,
    saveEvidenceToTmp: true,

    // Verificación post-submit del bot de upload
    clearWaitMs: 3000,
    clearPollMs: 150,

    // Evidencia opcional en éxito (upload)
    evidenceOnSuccess: false,
  },

  // Parámetros del flujo MFA reset
  mfaReset: {
    successMessage:
      "MFA was successfully reset for the user. Please contact this person and ask them to set up MFA from the start.",
    timeouts: {
      pageLoad: 15000, // cargar participante / pestañas
      buttonWait: 6000, // subir un poco para UIs lentas
      confirmWait: 7000, // esperar el confirm()
      alertWait: 7000, // esperar el alert() final
      statusSettle: 8000, // esperar que #mfa_status cambie a “not enrolled”
    },
  },

  // ==== View Participants (search) ====
  participantSearch: {
    url: "https://employer.forusall.com/view_participants",
    selectors: {
      shell: "#search-table",
      inputs: {
        planName: "#plan_name",
        fullName: "#full_name",
        ssn: "#ssn",
        phone: "#phone",
        email: "#email",
        participantId: "#participant_id",
      },
      searchBtn: "#search",
      table: "#search_list",
      emptyCell: "td.dataTables_empty",
      processing: "#search_list_processing",
      info: "#search_list_info",
      nextBtn: "#search_list_next a",
    },
  },
};
