'use strict'

const generator = require('generate-password');
const qrcode = require('qrcode');

module.exports = async (event, context) => {
  const password = generatePassword();

  const qrCodeUrl = await generateQrCode(password);

  return context
    .status(200)
    .succeed(JSON.stringify(qrCodeUrl));
}

/**
 * Generate a password with 24 characters, uppercase letters, lowercases letters, numbers and special symbols
 */
function generatePassword() {
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
 * Generate a QR code from the given password
 * @param {string} password
 */
async function generateQrCode(password) {
  return await qrcode.toDataURL(password);
}
