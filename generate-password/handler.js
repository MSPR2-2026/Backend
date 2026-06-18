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

  const password = generatePassword();

  const passwordHash = await hashPassword(password);

  try {
    await storeUserPassword(db, event.body.user, passwordHash, event.body.resetPassword ?? false);
  } catch (err) {
    if (err.error === "conflict") {
      return context
        .status(400)
        .succeed(`Username ${event.body.user} is already taken`);
    } else {
      return context.fail(err);
    }
  }

  const qrCodeUrl = await generateQrCode(password);

  return context
    .status(200)
    .succeed(JSON.stringify(qrCodeUrl));
}

/**
 * Generate a QR code from the given password
 * @param {string} password
 */
async function generateQrCode(password) {
  const qrcode = require('qrcode');

  return await qrcode.toDataURL(password);
}

/**
 * Store the user and its associated password hash to the db
 * @param {string} user
 * @param {string} passwordHash
 * @param {boolean} resetPassword
 */
async function storeUserPassword(db, user, passwordHash, resetPassword) {
  const gendate = new Date().toISOString();

  try {
    // Attempt to insert new user with the generated password
    await db.insert({ _id: user, password: passwordHash, gendate, expired: false });
  } catch (err) {
    // The user already exists but we want to reset their password,
    // update their password to the newly generated one
    // and reset the generation date and expired status
    if (err.error === "conflict" && resetPassword) {
      const doc = await db.get(user);

      await db.insert({ ...doc, password: passwordHash, gendate, expired: false });
    } else {
      throw err;
    }
  }
}

/**
 * Hash the given password
 * @param {string} password
 */
async function hashPassword(password) {
  const argon2 = require('argon2');

  return await argon2.hash(password);
}


/**
 * Generate a password with 24 characters, uppercase letters, lowercases letters, numbers and special symbols
 */
function generatePassword() {
  const generator = require('generate-password');

  return generator.generate({
    length: 24,
    numbers: true,
    symbols: true,
    lowercase: true,
    uppercase: true,
    excludeSimilarCharacters: true,
    strict: true,
  });
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
  const fs = require('node:fs/promises');

  if (!secretName?.length) return undefined;

  try {
    return await fs.readFile(`/var/openfaas/secrets/${secretName}`, { encoding: 'utf8' });
  } catch (err) {
    return undefined;
  }
}
