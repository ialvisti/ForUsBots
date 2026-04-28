// src/secrets.js
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

const SECRETS = ["SITE_USER", "SITE_PASS", "TOTP_SECRET", "SHARED_TOKEN"];

async function loadSecrets() {
  const project = process.env.GCP_PROJECT;
  if (!project) {
    return; // dev local: read from .env
  }

  const client = new SecretManagerServiceClient();
  await Promise.all(
    SECRETS.map(async (name) => {
      if (process.env[name]) return; // manual override
      try {
        const [v] = await client.accessSecretVersion({
          name: `projects/${project}/secrets/${name}/versions/latest`,
        });
        process.env[name] = v.payload.data.toString("utf8");
      } catch (err) {
        throw new Error(`Failed to load secret ${name}: ${err.message}`);
      }
    })
  );
}

module.exports = { loadSecrets };
