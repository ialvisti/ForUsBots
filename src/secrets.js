// src/secrets.js
const fs = require("fs");
const path = require("path");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

const SECRETS = ["SITE_USER", "SITE_PASS", "TOTP_SECRET", "SHARED_TOKEN"];
const TOKENS_SECRET = "TOKENS_JSON";
const TOKENS_PATH = "/tmp/tokens.json";

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

  if (!process.env.TOKENS_FILE) {
    try {
      const [v] = await client.accessSecretVersion({
        name: `projects/${project}/secrets/${TOKENS_SECRET}/versions/latest`,
      });
      fs.mkdirSync(path.dirname(TOKENS_PATH), { recursive: true });
      fs.writeFileSync(TOKENS_PATH, v.payload.data.toString("utf8"), { mode: 0o600 });
      process.env.TOKENS_FILE = TOKENS_PATH;
    } catch (err) {
      throw new Error(`Failed to load secret ${TOKENS_SECRET}: ${err.message}`);
    }
  }
}

module.exports = { loadSecrets };
