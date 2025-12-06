/*!
 * Copyright 2024, 2025 Visulate LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const httpConfig = require('../config/http-server.js');
const logger = require('./logger.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dbConfig = require('../config/database.js');
const dbService = require('./database.js');
const { getObjectDetails } = require('./controller.js');
const templateEngine = require('./template-engine');

/**
 * Gets a list of endpoints
 * @returns an endpoint to pool alias  dictionary
 */
function getEndpointList(endpoints) {
  let endpointList = [];
  endpoints.forEach(endpoint => {
    endpointList[endpoint.namespace] = endpoint.connect.poolAlias;
  });
  return endpointList;
}
const endpointList = getEndpointList(dbConfig.endpoints);


/**
 * Implements GET /ai endpoint.
 * Returns true if httpConfig.googleAiKey is set and false otherwise
 * @param {*} req - request
 * @param {*} res - response
 */
function aiEnabled(req, res) {
  if (httpConfig.googleAiKey) {
    res.status(200).json({ enabled: true });
  } else {
    res.status(200).json({ enabled: false });
  }
}
module.exports.aiEnabled = aiEnabled;


/**
 * Retry function with exponential backoff for API calls
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.log('warn', `API call attempt ${attempt} failed: ${error.message}`);

      // Don't retry on authentication or invalid request errors
      if (error.status === 401 || error.status === 400 || error.status === 404) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        logger.log('error', `All ${maxRetries} API call attempts failed`);
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      logger.log('info', `Retrying API call in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

const axios = require('axios');

/**
 * Proxy request to an agent service
 * @param {string} agent - The agent name ('visulate_agent' or 'comment_generator')
 * @param {object} payload - The request body
 */
async function proxyToAgent(agent, payload) {
  let agentUrl;
  if (agent === 'visulate_agent') {
    agentUrl = process.env.VISULATE_AGENT_URL || 'http://vissql:10000/agent/generate';
  } else if (agent === 'comment_generator') {
    agentUrl = process.env.COMMENT_GENERATOR_URL || 'http://vissql:10001/agent/generate';
  } else {
    throw new Error(`Unknown agent: ${agent}`);
  }

  try {
    const response = await axios.post(agentUrl, payload);
    return response.data;
  } catch (error) {
    logger.log('error', `Error calling agent ${agent}: ${error.message}`);
    throw error;
  }
}

/**
 * Core function to call Google AI to generate text.
 * This is the business logic, independent of Express.js.
 * @param {object} args - The arguments from the MCP request
 */
async function generativeAIInternal(args) {
  if (args.agent) {
    return await proxyToAgent(args.agent, args);
  }

  if (!httpConfig.googleAiKey) {
    throw new Error("Google AI key is not set");
  }

  const genAI = new GoogleGenerativeAI(httpConfig.googleAiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `You are a database architect called Visulate. You responsible for the design of an oracle database.
     You have access to a tool that generates json documents describing database objects and
     their related objects. The json documents follow a predictable structure for each database object.
     Each object comprises an array of properties. These properties vary by object type. but follow a
     consistent pattern. Title, description and display elements are followed by a list of rows. The display
     property lists items from the rows that should be displayed in a user interface.

     The context object for this exercise will include 2 objects. The first one will be called "objectDetails"
     and will contain the details of a database object that the user would like to ask questions about.
     The second object will be called "relatedObjects". It will contain a list of objects that are related to the
     objectDetails object. An additional object called "chatHistory" will contain the conversation history.

     Do not mention the JSON document in your response.

     Assume any questions the user asks are be about the objectDetails object unless the question states otherwise.
     Use the relatedObjects objects to provide context for the answers. Try to be expansive in your answers where
     appropriate. For example, if the user asks for a SQL statement for a table include the table's columns and
     join conditions to related tables in the response.`,
    // Add generation config to control timeouts and behavior
    generationConfig: {
      temperature: 0.1,
      topK: 40,
      topP: 0.95
    }
  });

  let contextText;
  if (typeof args.context === 'object') {
    contextText = JSON.stringify(args.context);
  } else {
    contextText = args.context;
  }

  const prompt = `${args.message} \n\n ${contextText}`;

  // Use retry mechanism for API calls
  const result = await retryWithBackoff(async () => {
    logger.log('debug', 'Making Gemini API call...');
    const response = await model.generateContent(prompt);
    logger.log('debug', 'Gemini API call successful');
    return response;
  }, 3, 2000); // 3 retries, starting with 2 second delay

  return result.response.text();
}

/**
 * Express wrapper for generativeAIInternal
 * Implements POST /ai/ endpoint.  Calls Google AI to generate text
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function generativeAI(req, res, next) {
  try {
    const result = await generativeAIInternal(req.body);
    res.status(200).json(result);
  } catch (err) {
    logger.log('error', 'Generative AI request failed');
    logger.log('error', err);
    res.status(503).send(err.message);
    next(err);
  }
}
module.exports.generativeAI = generativeAI;

/**
 * Core function to search for objects.
 * @param {string} db - The database to search in
 * @param {object} args - The arguments from the MCP request
 */
async function searchObjectsInternal(db, args) {
  const { search_terms, object_types } = args;
  const poolAlias = endpointList[db];
  if (!poolAlias) {
    throw new Error("Requested database was not found");
  }

  if (!search_terms || search_terms.length === 0) {
    throw new Error('search_terms array is required');
  }

  const sanitizedTerms = search_terms.map(term => term.toLowerCase().replace(/'/g, "''"));

  const searchConditions = sanitizedTerms.map(term => `
    (LOWER(o.object_name) LIKE '%${term}%' OR
     LOWER(tc.comments) LIKE '%${term}%' OR
     LOWER(cc.comments) LIKE '%${term}%')
  `).join(' OR ');

  const rankingLogic = sanitizedTerms.map(term => `
    (CASE WHEN LOWER(o.object_name) LIKE '%${term}%' THEN 10 ELSE 0 END) +
    (CASE WHEN LOWER(tc.comments) LIKE '%${term}%' THEN 5 ELSE 0 END) +
    (CASE WHEN LOWER(cc.comments) LIKE '%${term}%' THEN 1 ELSE 0 END)
  `).join(' + ');

  const sql = `
    SELECT
      o.owner,
      o.object_name as name,
      o.object_type as type,
      tc.comments as table_comments,
      LISTAGG(cc.column_name || ': ' || cc.comments, '; ') WITHIN GROUP (ORDER BY cc.column_name) as column_comments,
      SUM(${rankingLogic}) as relevance_score
    FROM
      dba_objects o
    LEFT JOIN
      dba_tab_comments tc ON o.owner = tc.owner AND o.object_name = tc.table_name
    LEFT JOIN
      dba_col_comments cc ON o.owner = cc.owner AND o.object_name = cc.table_name
    WHERE
      o.object_type IN ('${object_types.join("','")}') AND
      (${searchConditions})
    GROUP BY
      o.owner, o.object_name, o.object_type, tc.comments
    HAVING
      SUM(${rankingLogic}) > 0
    ORDER BY
      relevance_score DESC
    FETCH FIRST 7 ROWS ONLY
  `;
  const result = await dbService.simpleExecute(poolAlias, sql, {});
  const transformedResult = result.map(row => {
    const newRow = {};
    for (const key in row) {
      newRow[key.toLowerCase()] = row[key];
    }
    if (newRow.relevance_score) {
      newRow.relevance_score = Number(newRow.relevance_score);
    }
    return newRow;
  });

  return transformedResult;
}

/**
 * Express wrapper for searchObjectsInternal
 * Implements POST /mcp/search-objects/:db endpoint.
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function searchObjects(req, res, next) {
  try {
    const db = req.params.db;
    const result = await searchObjectsInternal(db, req.body);
    res.status(200).json(result);
  } catch (err) {
    logger.log('error', `Search failed for ${req.params.db}`);
    logger.log('error', err);
    res.status(err.message === 'Requested database was not found' ? 404 : 503).send(err.message);
    next(err);
  }
}
module.exports.searchObjects = searchObjects;


/**
 * Core function to get object context.
 * @param {object} args - The arguments from the MCP request
 */
async function getContextInternal(args) {
  const { db, owner, type, name, relationship_types } = args;
  const poolAlias = endpointList[db];
  if (!poolAlias) {
    throw new Error("Requested database was not found");
  }

  const objectDetails = await getObjectDetails(poolAlias, owner, type, name, true);
  if (objectDetails === '404') {
    throw new Error('The specified starting object was not found.');
  }

  let keysToScan = [];
  switch (relationship_types) {
    case 'NONE':
      // No related objects
      return {
        objectDetails: objectDetails,
        relatedObjects: {},
        chatHistory: []
      };
    case 'ALL':
      // All related objects
      keysToScan = ['Foreign Keys', 'Foreign Keys to this Table', 'Used By', 'Uses'];
      break;
    case 'FK':
    default:
      // Only Foreign Key related objects (default behavior)
      keysToScan = ['Foreign Keys', 'Foreign Keys to this Table'];
      break;
  }

  let relatedObjectLinks = [];
  objectDetails.forEach(section => {
    if (keysToScan.includes(section.title) && section.rows) {
      section.rows.forEach(row => {
        if (row.LINK) {
          relatedObjectLinks.push(row.LINK);
        }
      });
    }
  });
  const uniqueLinks = [...new Set(relatedObjectLinks)];

  const relatedObjectsMap = {};
  await Promise.all(
    uniqueLinks.map(async (link) => {
      const [objOwner, objType, objName] = link.split('/');
      const details = await getObjectDetails(poolAlias, objOwner, objType, objName, false);
      if (details !== '404') {
        const key = `${db}.${objOwner}.${objType}.${objName}`;
        relatedObjectsMap[key] = details;
      }
    })
  );

  const contextPayload = {
    objectDetails: objectDetails,
    relatedObjects: relatedObjectsMap,
    chatHistory: []
  };
  return contextPayload;
}

/**
 * Express wrapper for getContextInternal
 * Implements POST /mcp/context/:db endpoint
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function getContext(req, res, next) {
  try {
    const result = await getContextInternal({ ...req.params, ...req.body });
    if (req.query.template) {
      try {
        const templateResult = await templateEngine.applyTemplate('context', result, req);
        if (typeof (templateResult) === "string") { res.type('txt'); }
        res.status(200).send(templateResult);
      } catch (err) {
        logger.log('error', `Template application failed for ${req.query.template}`);
        logger.log('error', err);
        res.status(404).send(err);
        next(err);
      }
    } else {
      res.status(200).json(result);
    }
  } catch (err) {
    logger.log('error', `getContext failed for ${req.params.db}/${req.body.owner}/${req.body.type}/${req.body.name}`);
    logger.log('error', err);
    res.status(err.message === 'The specified starting object was not found.' ? 404 : 503).send(err.message);
    next(err);
  }
}
module.exports.getContext = getContext;

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { randomUUID } = require('node:crypto');

// #############################################################################
// SECTION: Entry Point for MCP Clients
// #############################################################################

// In-memory session store for MCP connections
const mcpSessions = {};

// Keep-alive mechanism for SSE connections
const KEEP_ALIVE_INTERVAL_MS = 25000; // Send keep-alive every 25 seconds (before 30s timeout)
const KEEP_ALIVE_TIMEOUT_CHECK_MS = 5000; // Check connection health every 5 seconds
const sseConnections = new Map(); // Track active SSE connections and their keep-alive intervals

// Connection limits and resource management
const MAX_CONCURRENT_SESSIONS = 50; // Maximum number of concurrent MCP sessions
const MAX_SSE_CONNECTIONS = 20; // Maximum number of active SSE connections with keep-alive
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout
const SSE_CONNECTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for SSE connections

// Periodic cleanup of stale sessions (run every 2 minutes for better resource management)
setInterval(() => {
  const now = Date.now();
  let cleanedSessions = 0;
  let cleanedSSEConnections = 0;

  logger.log('debug', `Starting periodic cleanup - Sessions: ${Object.keys(mcpSessions).length}, SSE connections: ${sseConnections.size}`);

  // Clean up stale sessions
  Object.keys(mcpSessions).forEach(sessionId => {
    const session = mcpSessions[sessionId];
    if (!session || !session.transport || session.transport.closed) {
      cleanupSession(sessionId);
      cleanedSessions++;
      return;
    }

    // Check for idle timeout
    const lastActivity = session.lastActivity || session.createdAt;
    const idleTime = now - lastActivity.getTime();

    if (idleTime > SESSION_IDLE_TIMEOUT_MS) {
      logger.log('info', `Session ${sessionId} idle for ${Math.round(idleTime / 60000)} minutes, cleaning up`);
      cleanupSession(sessionId);
      cleanedSessions++;
    }
  });

  // Clean up stale SSE connections (additional safety check)
  sseConnections.forEach((connection, sessionId) => {
    if (!mcpSessions[sessionId] ||
      (connection.res && connection.res.writableEnded) ||
      (connection.startTime && (now - connection.startTime) > SSE_CONNECTION_TIMEOUT_MS)) {
      cleanupSSEConnection(sessionId);
      cleanedSSEConnections++;
    }
  });

  if (cleanedSessions > 0 || cleanedSSEConnections > 0) {
    logger.log('info', `Periodic cleanup completed - Cleaned ${cleanedSessions} sessions, ${cleanedSSEConnections} SSE connections`);
  }

  logger.log('debug', `After cleanup - Sessions: ${Object.keys(mcpSessions).length}, SSE connections: ${sseConnections.size}`);
}, 2 * 60 * 1000); // Run every 2 minutes

// Function to check and enforce connection limits
function enforceConnectionLimits() {
  const totalSessions = Object.keys(mcpSessions).length;
  const totalSSEConnections = sseConnections.size;

  logger.log('debug', `Current sessions: ${totalSessions}/${MAX_CONCURRENT_SESSIONS}, SSE connections: ${totalSSEConnections}/${MAX_SSE_CONNECTIONS}`);

  // If we're at the session limit, remove the oldest inactive session
  if (totalSessions >= MAX_CONCURRENT_SESSIONS) {
    let oldestSession = null;
    let oldestTime = Date.now();

    Object.entries(mcpSessions).forEach(([sessionId, session]) => {
      const lastActivity = session.lastActivity || session.createdAt;
      if (lastActivity < oldestTime) {
        oldestTime = lastActivity;
        oldestSession = sessionId;
      }
    });

    if (oldestSession) {
      logger.log('info', `Removing oldest session ${oldestSession} to make room for new connection`);
      cleanupSession(oldestSession);
    }
  }

  // If we're at the SSE connection limit, remove the oldest SSE connection
  if (totalSSEConnections >= MAX_SSE_CONNECTIONS) {
    const oldestConnection = Array.from(sseConnections.keys())[0]; // Map maintains insertion order
    if (oldestConnection) {
      logger.log('info', `Removing oldest SSE connection ${oldestConnection} to make room for new connection`);
      cleanupSSEConnection(oldestConnection);
    }
  }
}

// Function to clean up a specific session
function cleanupSession(sessionId) {
  // Clean up keep-alive interval first
  cleanupSSEConnection(sessionId);

  // Clean up session
  if (mcpSessions[sessionId]) {
    delete mcpSessions[sessionId];
    logger.log('info', `Cleaned up session ${sessionId}`);
  }
}

// Function to clean up a specific SSE connection
function cleanupSSEConnection(sessionId) {
  const connection = sseConnections.get(sessionId);
  if (connection && connection.intervalId) {
    clearInterval(connection.intervalId);
    sseConnections.delete(sessionId);
    logger.log('info', `Cleaned up SSE connection ${sessionId}`);
  }
}

// Function to start keep-alive mechanism for SSE connections
function startKeepAlive(sessionId, transport, res, isSSE = true) {
  // Only start keep-alive for SSE connections (GET requests)
  if (!res || !isSSE) {
    logger.log('debug', `Skipping keep-alive for session ${sessionId} - not an SSE connection`);
    return;
  }

  // Check if we're already at the SSE connection limit
  if (sseConnections.size >= MAX_SSE_CONNECTIONS) {
    logger.log('warn', `SSE connection limit reached (${MAX_SSE_CONNECTIONS}), not starting keep-alive for session ${sessionId}`);
    return;
  }

  logger.log('info', `Starting keep-alive for SSE session ${sessionId} (${sseConnections.size + 1}/${MAX_SSE_CONNECTIONS})`);

  const startTime = Date.now();
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  const intervalId = setInterval(() => {
    try {
      // Check if connection has exceeded timeout
      if (Date.now() - startTime > SSE_CONNECTION_TIMEOUT_MS) {
        logger.log('info', `SSE connection ${sessionId} exceeded timeout, cleaning up`);
        clearInterval(intervalId);
        sseConnections.delete(sessionId);
        return;
      }

      // Additional safety checks
      if (!sseConnections.has(sessionId)) {
        logger.log('debug', `SSE connection ${sessionId} no longer tracked, stopping keep-alive`);
        clearInterval(intervalId);
        return;
      }

      if (!mcpSessions[sessionId]) {
        logger.log('debug', `Session ${sessionId} no longer exists, stopping keep-alive`);
        clearInterval(intervalId);
        sseConnections.delete(sessionId);
        return;
      }

      // Check if response is still writable
      if (res.writableEnded || res.destroyed) {
        logger.log('info', `Response for session ${sessionId} is no longer writable, cleaning up`);
        clearInterval(intervalId);
        sseConnections.delete(sessionId);
        return;
      }

      // Update last activity time
      if (mcpSessions[sessionId]) {
        mcpSessions[sessionId].lastActivity = new Date();
      }

      // Send SSE keep-alive comment (this is the standard SSE keep-alive format)
      res.write(': keepalive\n\n');
      logger.log('debug', `Sent keep-alive for session ${sessionId}`);

      // Update connection health info
      const connection = sseConnections.get(sessionId);
      if (connection) {
        connection.lastKeepAlive = Date.now();
        connection.errorCount = 0;
      }

      // Reset error counter on successful write
      consecutiveErrors = 0;

    } catch (error) {
      consecutiveErrors++;

      // Update connection health info
      const connection = sseConnections.get(sessionId);
      if (connection) {
        connection.errorCount = (connection.errorCount || 0) + 1;
      }

      logger.log('error', `Keep-alive error for session ${sessionId} (${consecutiveErrors}/${maxConsecutiveErrors}): ${error.message}`);

      // If we've hit too many consecutive errors, give up
      if (consecutiveErrors >= maxConsecutiveErrors) {
        logger.log('error', `Too many consecutive keep-alive errors for session ${sessionId}, cleaning up`);
        clearInterval(intervalId);
        sseConnections.delete(sessionId);
        return;
      }

      // For recoverable errors (like EPIPE), we'll try again next interval
      if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
        logger.log('warn', `Recoverable connection error for session ${sessionId}, will retry`);
      } else {
        // For non-recoverable errors, clean up immediately
        logger.log('error', `Non-recoverable error for session ${sessionId}, cleaning up`);
        clearInterval(intervalId);
        sseConnections.delete(sessionId);
      }
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  // Store connection details with start time and health info
  sseConnections.set(sessionId, {
    res,
    intervalId,
    transport,
    startTime,
    lastKeepAlive: Date.now(),
    errorCount: 0
  });
}

// Factory function to create a new MCP server instance
function createMcpServer() {
  const server = new McpServer({
    name: 'visulate-for-oracle',
    version: '2.0.0',
    capabilities: {
      tools: { listChanged: true },
    }
  });

  // Register the search objects tool
  server.tool(
    'searchObjects',
    'Search Oracle database objects matching a natural language query',
    {
      db: z.string().describe("The database to search in (e.g., 'pdb21')."),
      search_terms: z.array(z.string()).describe("Keywords extracted from the user's query."),
      object_types: z.array(z.string()).describe("A list of object types to search for. For example, ['TABLE', 'VIEW']"),
    },
    async ({ db, search_terms, object_types }) => {
      try {
        const result = await searchObjectsInternal(db, { search_terms, object_types });
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) }
          ]
        };
      } catch (error) {
        logger.log('error', `MCP searchObjects tool failed: ${error.message}`);
        logger.log('error', error.stack);
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message, type: 'searchObjectsError' }, null, 2) }
          ]
        };
      }
    },
  );

  server.tool(
    'getContext',
    'Get detailed context for a specific Oracle database object',
    {
      db: z.string().describe("The database where the object resides."),
      owner: z.string().describe("The database schema/owner of the database object."),
      name: z.string().describe("The name of the database object."),
      type: z.string().describe("The type of the database object."),
    },
    async ({ db, owner, name, type, relationship_types = 'FK', format = 'FORMATTED' }) => {
      try {
        const result = await getContextInternal({ db, owner, name, type, relationship_types });

        // Apply formatting based on format parameter
        if (format === 'FORMATTED') {
          try {
            // Create a mock request object for template engine
            const mockReq = {
              query: { template: 'ai-context.hbs' },
              headers: { host: 'localhost' },
              protocol: 'http',
              get: function (name) {
                if (name === 'host') return this.headers.host;
                return '';
              }
            };

            const templateResult = await templateEngine.applyTemplate('context', result, mockReq);
            // Return as text if template returns a string, otherwise JSON
            if (typeof templateResult === "string") {
              return {
                content: [
                  { type: 'text', text: templateResult }
                ]
              };
            } else {
              return {
                content: [
                  { type: 'text', text: JSON.stringify(templateResult, null, 2) }
                ]
              };
            }
          } catch (templateError) {
            logger.log('error', `Template application failed for ai-context.hbs: ${templateError.message}`);
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `Template error: ${templateError.message}`, type: 'templateError' }, null, 2) }
              ]
            };
          }
        }

        // RAW format - return JSON response
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) }
          ]
        };
      } catch (error) {
        logger.log('error', `MCP getContext tool failed: ${error.message}`);
        logger.log('error', error.stack);
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message, type: 'getContextError' }, null, 2) }
          ]
        };
      }
    },
  );

  server.tool(
    'generativeAI',
    'Use Google Gemini AI to answer questions about Oracle database objects. This tool should be used when you have a large context object that needs to be processed by AI, especially when the context exceeds token limits for direct processing.',
    {
      message: z.string().describe("The user's question or prompt about the database object."),
      context: z.any().describe("The context object containing objectDetails, relatedObjects, and chatHistory. This can handle large contexts that exceed normal token limits.")
    },
    async ({ message, context }) => {
      try {
        const result = await generativeAIInternal({ message, context });
        return {
          content: [
            { type: 'text', text: result }
          ]
        };
      } catch (error) {
        logger.log('error', `MCP generativeAI tool failed: ${error.message}`);
        logger.log('error', error.stack);

        // Provide detailed error response based on error type
        let errorMessage = `Error: ${error.message}`;
        let errorType = 'generalError';

        if (error.status === 503) {
          errorMessage = `Google Gemini API is currently unavailable (503 Service Unavailable). This is typically a temporary issue. Please try again in a few moments.`;
          errorType = 'apiUnavailable';
        } else if (error.status === 429) {
          errorMessage = `Google Gemini API rate limit exceeded. Please wait a moment before trying again.`;
          errorType = 'rateLimited';
        } else if (error.status === 401) {
          errorMessage = `Google AI API key authentication failed. Please check your API key configuration.`;
          errorType = 'authenticationError';
        } else if (error.message && error.message.includes('timeout')) {
          errorMessage = `Request timed out while processing your query. This might be due to a large context or temporary service issues. Please try with a shorter query or try again later.`;
          errorType = 'timeoutError';
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: errorMessage,
                type: errorType,
                retryable: ['apiUnavailable', 'rateLimited', 'timeoutError'].includes(errorType),
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }
    },
  );

  return server;
}

async function handleMcpRequest(req, res, next) {
  try {
    const sessionIdHeader = req.headers['mcp-session-id'];
    let sessionEntry = null;

    // Log the request details for debugging
    logger.log('debug', `MCP ${req.method} request, session: ${sessionIdHeader || 'none'}, body method: ${req.body?.method || 'none'}`);

    // Clean up any expired or invalid sessions before processing
    Object.keys(mcpSessions).forEach(sessionId => {
      const session = mcpSessions[sessionId];
      if (!session || !session.transport || session.transport.closed) {
        logger.log('info', `Cleaning up invalid session ${sessionId}`);
        delete mcpSessions[sessionId];
      }
    });

    // Handle GET and DELETE requests (for SSE and session termination)
    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionIdHeader || !mcpSessions[sessionIdHeader]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      const { transport } = mcpSessions[sessionIdHeader];

      // Add validation to ensure transport is still active
      if (!transport || transport.closed) {
        logger.log('error', `Transport is closed or invalid for session ${sessionIdHeader}`);
        res.status(410).send('Session transport is no longer available');
        // Clean up the invalid session
        cleanupSession(sessionIdHeader);
        return;
      }

      // Start keep-alive for GET requests (SSE connections) if not already started
      if (req.method === 'GET' && !sseConnections.has(sessionIdHeader)) {
        startKeepAlive(sessionIdHeader, transport, res, true);
      }

      try {
        await transport.handleRequest(req, res);
      } catch (transportError) {
        logger.log('error', `Transport handleRequest failed for ${req.method} ${sessionIdHeader}: ${transportError.message}`);
        logger.log('error', transportError.stack);
        if (!res.headersSent) {
          res.status(500).send('Transport error occurred');
        }
        // Clean up the problematic session
        cleanupSession(sessionIdHeader);
        throw transportError;
      }
      return;
    }

    // Handle POST requests
    // Case 1: Existing session found
    if (sessionIdHeader && mcpSessions[sessionIdHeader]) {
      sessionEntry = mcpSessions[sessionIdHeader];
      // Update last activity time
      sessionEntry.lastActivity = new Date();

      // Case 2: Initialization request → create new transport + server
    } else if (!sessionIdHeader && req.body && req.body.method === 'initialize') {
      // Enforce connection limits before creating new session
      enforceConnectionLimits();

      const newSessionId = randomUUID();

      // Create a new transport for this session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          // Store the Transport and Server instance once session is initialized
          logger.log('info', `MCP session initialized: ${sid}`);
          mcpSessions[sid] = {
            server,
            transport,
            createdAt: new Date(),
            lastActivity: new Date()
          };

          // Start keep-alive mechanism for SSE connections
          // Note: res is from the outer scope, and this is an initialization request (likely GET for SSE)
          startKeepAlive(sid, transport, res, true);
        }
      });

      // When this transport closes, clean up the session entry
      transport.onclose = () => {
        const sessionId = transport.sessionId;
        logger.log('info', `MCP transport closed for session ${sessionId}`);
        cleanupSession(sessionId);
      };

      // Add error handler for transport errors
      transport.onerror = (error) => {
        const sessionId = transport.sessionId;
        logger.log('error', `MCP transport error for session ${sessionId}: ${error?.message || 'Unknown error'}`);
        if (error?.stack) {
          logger.log('error', error.stack);
        }
        cleanupSession(sessionId);
      };

      // Create and configure the new McpServer
      const server = createMcpServer();
      await server.connect(transport);

      // Store the session with metadata
      mcpSessions[newSessionId] = {
        server,
        transport,
        createdAt: new Date(),
        lastActivity: new Date()
      };
      sessionEntry = mcpSessions[newSessionId];
      logger.log('info', `Created new MCP session: ${newSessionId}`);

      // Add response close event handler for proper cleanup
      res.on('close', () => {
        logger.log('info', `Response closed for session ${newSessionId}`);
        cleanupSSEConnection(newSessionId);
      });

    } else {
      // Neither a valid session nor an initialize request → return error
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null
      });
      return;
    }

    // Forward the request to the transport of the retrieved/created session
    // Add validation to ensure transport is still active
    if (!sessionEntry.transport || sessionEntry.transport.closed) {
      logger.log('error', `Transport is closed or invalid for session ${sessionEntry.transport?.sessionId || 'unknown'}`);
      res.status(410).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session transport is no longer available' },
        id: req.body?.id || null
      });
      // Clean up the invalid session
      if (sessionEntry.transport?.sessionId) {
        cleanupSession(sessionEntry.transport.sessionId);
      }
      return;
    }

    try {
      await sessionEntry.transport.handleRequest(req, res, req.body);
    } catch (transportError) {
      logger.log('error', `Transport handleRequest failed for POST ${sessionEntry.transport?.sessionId || 'unknown'}: ${transportError.message}`);
      logger.log('error', transportError.stack);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32002, message: 'Transport error occurred during request processing' },
          id: req.body?.id || null
        });
      }
      // Clean up the problematic session
      if (sessionEntry.transport?.sessionId) {
        cleanupSession(sessionEntry.transport.sessionId);
      }
      throw transportError;
    }

  } catch (err) {
    logger.log('error', `MCP Request Error: ${err.message}`);
    logger.log('error', err.stack);
    if (!res.headersSent) {
      res.status(500).send('An internal error occurred in the MCP server.');
    }
    next(err);
  }
}
module.exports.handleMcpRequest = handleMcpRequest;

/**
 * Get MCP server session statistics for monitoring
 * @param {*} req - request
 * @param {*} res - response
 */
function getMcpStats(req, res) {
  const now = Date.now();
  const sessionStats = {
    totalSessions: Object.keys(mcpSessions).length,
    maxSessions: MAX_CONCURRENT_SESSIONS,
    totalSSEConnections: sseConnections.size,
    maxSSEConnections: MAX_SSE_CONNECTIONS,
    sessionDetails: [],
    sseConnectionDetails: []
  };

  // Session details
  Object.entries(mcpSessions).forEach(([sessionId, session]) => {
    const lastActivity = session.lastActivity || session.createdAt;
    const idleTime = now - lastActivity.getTime();
    sessionStats.sessionDetails.push({
      sessionId: sessionId.substring(0, 8) + '...', // Truncate for privacy
      createdAt: session.createdAt,
      lastActivity: lastActivity,
      idleTimeMinutes: Math.round(idleTime / 60000),
      hasTransport: !!session.transport,
      transportClosed: session.transport?.closed || false
    });
  });

  // SSE connection details
  sseConnections.forEach((connection, sessionId) => {
    const uptime = connection.startTime ? now - connection.startTime : 0;
    const timeSinceLastKeepAlive = connection.lastKeepAlive ? now - connection.lastKeepAlive : 0;
    sessionStats.sseConnectionDetails.push({
      sessionId: sessionId.substring(0, 8) + '...', // Truncate for privacy
      uptimeMinutes: Math.round(uptime / 60000),
      hasResponse: !!connection.res,
      responseWritable: connection.res ? !connection.res.writableEnded : false,
      lastKeepAliveSecondsAgo: Math.round(timeSinceLastKeepAlive / 1000),
      errorCount: connection.errorCount || 0,
      healthy: connection.res && !connection.res.writableEnded && timeSinceLastKeepAlive < KEEP_ALIVE_INTERVAL_MS * 2
    });
  });

  res.status(200).json(sessionStats);
}
module.exports.getMcpStats = getMcpStats;
