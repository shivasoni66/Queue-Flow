'use strict';

const QRCode = require('qrcode');

/**
 * Get today's date as YYYY-MM-DD in local time.
 * Used as the queue's date partition key.
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a token code from prefix and number.
 * e.g. ('A', 47) → 'A-047'
 * @param {string} prefix - Token prefix (e.g. 'A')
 * @param {number} number - Token number
 * @returns {string}
 */
function formatTokenCode(prefix, number) {
  return `${prefix.toUpperCase()}-${String(number).padStart(3, '0')}`;
}

/**
 * Generate a compact QR data string for a token.
 * The QR contains a verification URL/string that staff can scan.
 * @param {string} tokenId - MongoDB _id of the token
 * @param {string} tokenCode - Human-readable token code (e.g. 'A-047')
 * @param {string} centerId - MongoDB _id of the service center
 * @returns {string} QR data string
 */
function generateQRData(tokenId, tokenCode, centerId) {
  return JSON.stringify({
    type: 'QUEUEFLOW_TOKEN',
    id: tokenId,
    code: tokenCode,
    center: centerId,
    ts: Date.now(),
  });
}

/**
 * Generate a base64-encoded PNG QR code image from a data string.
 * @param {string} data
 * @returns {Promise<string>} data URL (data:image/png;base64,...)
 */
async function generateQRCodeImage(data) {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#070b09',
      light: '#ffffff',
    },
  });
}

module.exports = {
  getTodayDateString,
  formatTokenCode,
  generateQRData,
  generateQRCodeImage,
};
