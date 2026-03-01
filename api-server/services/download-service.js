const path = require('path');
const fs = require('fs');
const logger = require('./logger.js');

const DOWNLOAD_ROOT = process.env.VISULATE_DOWNLOADS || path.resolve(__dirname, '../downloads');

/**
 * Validates session ID and filename to prevent path traversal
 */
function validatePath(sessionId, filename) {
  // Allow alphanumeric, dashes, and underscores for session ID (UUID format)
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
    throw new Error('Invalid session ID format');
  }

  // Basic filename validation (no slashes, typical extensions)
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes('..') || filename.includes('/')) {
    throw new Error('Invalid filename format');
  }

  return path.join(DOWNLOAD_ROOT, sessionId, filename);
}

/**
 * serveFile
 * Serves a file from the download directory with validation
 */
async function serveFile(req, res, next) {
  const { sessionId, filename } = req.params;

  try {
    const filePath = validatePath(sessionId, filename);

    // Check if file exists and is within root
    if (!filePath.startsWith(DOWNLOAD_ROOT)) {
      throw new Error('Path traversal attempt');
    }

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        logger.log('warn', `File not found: ${filePath}`);
        return res.status(404).send('File not found');
      }

      logger.log('info', `Serving file: ${filePath}`);
      res.download(filePath, filename, (err) => {
        if (err) {
          logger.log('error', `Error sending file: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).send('Error downloading file');
          }
        }
      });
    });

  } catch (error) {
    logger.log('error', `Download error: ${error.message}`);
    res.status(400).send(error.message);
  }
}

module.exports = {
  serveFile
};
