'use strict'

module.exports = async (event, context) => {
  if (!event.body?.user?.length) {
    return context
      .status(400)
      .succeed("Missing required parameter: user");
  }

  const couchdbCredentials = await getCouchdbCredentials();

  if (!couchdbCredentials) {
    return context.fail("CouchDB credentials missing");
  }

  let db;
  try {
    db = await connectToCouchdb(couchdbCredentials);
  } catch (err) {
    return context.fail(err);
  }

  const totpSecret = generateTotpSecret();

  try {
    await storeTotpSecret(db, event.body.user, totpSecret);
  } catch (err) {
    if (err.error === "not_found") {
      return context
        .status(400)
        .succeed(`No user found for username ${event.body.user}`);
    } else {
      return context.fail(err);
    }
  }

  const qrCodeUrl = await generateTotpQrCode(event.body.user, totpSecret);

  return context
    .status(200)
    .succeed(qrCodeUrl);
}

/**
 * Generate a QR code to setup 2FA for the given user
 * @param {string} user 
 * @param {string} totpSecret 
 */
async function generateTotpQrCode(user, totpSecret) {
  const { generateURI } = require('otplib');
  const { toDataURL } = require('qrcode');

  const uri = generateURI({
    issuer: "COFRAP",
    label: user,
    secret: totpSecret,
  });

  return await toDataURL(uri);
}

/**
 * @param {string} user 
 * @param {string} totpSecret 
 */
async function storeTotpSecret(db, user, totpSecret) {
  const doc = await db.get(user);

  await db.insert({ ...doc, mfa: totpSecret });
}

/**
 * Generate a secret for 2FA
 */
function generateTotpSecret() {
  const { generateSecret } = require('otplib');

  return generateSecret();
}

/**
 * Connect to CouchDB with the provided credentials
 * @param {{ user: string, password: string }} credentials
 * @returns The database object
 */
async function connectToCouchdb(credentials) {
  const nano = require("nano")(process.env.COUCHDB_URL);
  await nano.auth(credentials.user, credentials.password);

  try {
    // Try to create db
    await nano.db.create("watchlist");
  } catch (err) {
    if (err.error !== "file_exists") {
      // Don't throw if database already exists
      throw err;
    }
  }

  return nano.db.use("watchlist");
}

/**
 * Get CouchDB credentials from OpenFaaS secrets
 */
async function getCouchdbCredentials() {
  const user = await getSecret("couchdb-user");
  const password = await getSecret("couchdb-password");

  if (!user?.length || !password?.length) return undefined;

  return { user, password };
}

/**
 * Get an OpenFaaS secret
 * @param {string} secretName
 */
async function getSecret(secretName) {
  const { readFile } = require('node:fs/promises');

  if (!secretName?.length) return undefined;

  try {
    return await readFile(`/var/openfaas/secrets/${secretName}`, { encoding: 'utf8' });
  } catch (err) {
    return undefined;
  }
}
