'use strict'

/**
 * @typedef {Object} UserDoc
 * @prop {string} passwordHash
 * @prop {string} totpSecret
 * @prop {import("dayjs").Dayjs} gendate
 * @prop {boolean} expired
 */

module.exports = async (event, context) => {
  if (!event.body?.user?.length) {
    return context
      .status(400)
      .succeed("Missing required parameter: user");
  }

  if (!event.body?.password?.length) {
    return context
      .status(400)
      .succeed("Missing required parameter: password");
  }

  if (!event.body?.totp?.length) {
    return context
      .status(400)
      .succeed("Missing required parameter: totp");
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

  let userDoc;
  try {
    userDoc = await getUserDoc(db, event.body.user);
  } catch (err) {
    if (err.error === "not_found") {
      return context
        .status(400)
        .succeed(`No user found for username ${event.body.user}`);
    } else {
      return context.fail(err);
    }
  }

  if (await userPasswordExpired(db, userDoc)) {
    return context
      .status(400)
      .succeed("Password is expired, please reset your password");
  }

  // Verify password and 2FA
  try {
    if (!(await verifyPassword(event.body.password, userDoc)) || !(await verifyTotp(event.body.totp, userDoc))) {
      return context
        .status(400)
        .succeed("Either password or 2FA token is invalid, please try again");
    }
  } catch (err) {
    return context.fail(err);
  }

  return context.status(200);
}

/**
 * Verify that the 2FA token is valid
 * @param {string} totp
 * @param {UserDoc} userDoc
 */
async function verifyTotp(totp, userDoc) {
  const { verify } = require("otplib");

  const result = await verify({ secret: userDoc.totpSecret, token: totp });

  return result.valid;
}

/**
 * Verify that the password is valid
 * @param {string} password
 * @param {UserDoc} userDoc
 */
function verifyPassword(password, userDoc) {
  const { verify } = require("argon2");

  return verify(userDoc.passwordHash, password);
}

/**
 * Check if the user's password is older than six month and update its expired status db
 * @param {UserDoc} userDoc
 * @returns the expired status
 */
async function userPasswordExpired(db, userDoc) {
  const dayjs = require("dayjs");

  if (userDoc.expired) {
    return true;
  }

  // Check if password generation date is older than 6 months
  if (userDoc.gendate.add(6, 'months').isBefore(dayjs())) {
    await db.insert({ ...userDoc, expired: true });

    return true;
  }

  return false;
}

/**
 * Get the user in db
 * @param {string} user
 * @returns {Promise<UserDoc>}
 */
async function getUserDoc(db, user) {
  const dayjs = require("dayjs");

  const doc = await db.get(user);

  return {
    passwordHash: doc.password,
    totpSecret: doc.mfa,
    gendate: dayjs(doc.gendate),
    expired: doc.expired,
  };
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
