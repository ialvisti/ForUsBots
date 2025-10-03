// Js/articleBuilder.js
// Main coordinator for Article Builder

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // Verificar módulos
    if (
      !window.BuilderUtils ||
      !window.BuilderState ||
      !window.BuilderUI ||
      !window.BuilderBlocks ||
      !window.BuilderPreview
    ) {
      console.error(
        "Article Builder: Missing required modules. Please ensure all builder*.js files are loaded."
      );
      return;
    }

    // === Login único para acceder al builder (cualquier rol) ===
    const token = await window.BuilderUtils.promptTokenForAction(
      "open builder"
    );
    if (!token) return; // cancelado por el usuario

    const who = await window.BuilderAPI.whoAmI(token);
    if (!who || !who.ok) {
      alert("Invalid or unauthorized token.");
      return;
    }

    // Guardar token de acceso para lecturas iniciales (listas / users)
    window.BuilderAccessToken = token;

    // Mostrar panel e inicializar UI
    document.getElementById("startPanel").style.display = "flex";
    window.BuilderUI.initStartPanel();
    window.BuilderUI.initTabsUI();
    window.BuilderUI.wireBasicsTab();
    window.BuilderUI.wireGroupsTab();
    window.BuilderBlocks.wireDetailTab();
    window.BuilderUI.wireReviewTab();
    window.BuilderUI.wireShortcuts();
  } catch (e) {
    console.error("[builder boot] ", e);
  }
});
