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
    res.status(200).json({enabled: true});
  } else {
    res.status(200).json({enabled: false});
  }
}
module.exports.aiEnabled = aiEnabled;


/**
 * Core function to call Google AI to generate text.
 * This is the business logic, independent of Express.js.
 * @param {object} args - The arguments from the MCP request
 */
async function generativeAIInternal(args) {
  if (!httpConfig.googleAiKey) {
    throw new Error("Google AI key is not set");
  }

  const genAI = new GoogleGenerativeAI(httpConfig.googleAiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
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
     join conditions to related tables in the response.`
  });

  let contextText;
  if (typeof args.context === 'object') {
    contextText = JSON.stringify(args.context);
  } else {
    contextText = args.context;
  }

  const prompt = `${args.message} \n\n ${contextText}`;
  const result = await model.generateContent(prompt);
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
  // console.log('Result from dbService.simpleExecute:', result);
  // console.log('Transformed result:', transformedResult);
  // console.log('Final transformed result being returned:', JSON.stringify(transformedResult, null, 2));
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
    logger.log('error', `MCP search failed for ${req.params.db}`);
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
  const { db, owner, type, name } = args;
  const poolAlias = endpointList[db];
  if (!poolAlias) {
    throw new Error("Requested database was not found");
  }

  const objectDetails = await getObjectDetails(poolAlias, owner, type, name, true);
  if (objectDetails === '404') {
    throw new Error('The specified starting object was not found.');
  }

  let relatedObjectLinks = [];
  objectDetails.forEach(section => {
    const keysToScan = ['Foreign Keys', 'Foreign Keys to this Table', 'Used By', 'Uses'];
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
    res.status(200).json(result);
  } catch (err) {
    logger.log('error', `MCP getContext failed for ${req.params.db}/${req.body.owner}/${req.body.type}/${req.body.name}`);
    logger.log('error', err);
    res.status(err.message === 'The specified starting object was not found.' ? 404 : 503).send(err.message);
    next(err);
  }
}
module.exports.getContext = getContext;

/**
 * Core function for the agent planner.
 * @param {object} args - The arguments from the MCP request
 */
async function agentPlannerInternal(args) {
  if (!httpConfig.googleAiKey) {
    throw new Error("Google AI key is not set");
  }
  const genAI = new GoogleGenerativeAI(httpConfig.googleAiKey);

  const tools = [
    {
      functionDeclarations: [
        {
          name: "searchObjects",
          description: "Searches a specific database for objects matching a user's natural language query. The tool will respond with an array of matching objects, ranked by a relevance score. After using this tool, call getContext with the owner, name, and type of the highest scoring object.",
          parameters: {
            type: "OBJECT",
            properties: {
              db: { type: "STRING", description: "The database to search in." },
              search_terms: { type: "ARRAY", items: { type: "STRING" }, description: "Keywords extracted from the user's query." },
              object_types: { type: "ARRAY", items: { type: "STRING" }, description: "A list of object types to search for. For example, ['TABLE', 'VIEW']" }
            },
            required: ["db", "search_terms"]
          }
        },
        {
          name: "getContext",
          description: "After finding a specific object with searchObjects, use this tool to get its full context, including details of all related objects.",
          parameters: {
            type: "OBJECT",
            properties: {
              db: { type: "STRING", description: "The database where the object resides." },
              owner: { type: "STRING", description: "The schema or owner of the object." },
              name: { type: "STRING", description: "The name of the object." },
              type: { type: "STRING", description: "The type of the object (e.g., TABLE, VIEW)." }
            },
            required: ["db", "owner", "name", "type"]
          }
        },
        {
          name: "finalAnswer",
          description: "Once you have gathered all necessary context, use this tool to generate the final, human-readable answer for the user.",
          parameters: {
            type: "OBJECT",
            properties: {
              message: { type: "STRING", description: "The final prompt or question to be answered." },
              context: { type: "OBJECT", description: "The full context object gathered from previous steps." }
            },
            required: ["message", "context"]
          }
        }
      ]
    }
  ];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: "You are an agentic planner. Your job is to determine the next step to fulfill a user's request by choosing the appropriate tool. You have a set of tools to interact with an Oracle database catalog. Do not ask clarifying questions. Choose the best tool based on the current information.",
    tools: tools
  });

  const { history, current_prompt } = args;
  // Sanitize history: remove any empty objects or entries without a 'role'
  const sanitizedHistory = (history || []).filter(entry => entry && entry.role);
  const chat = model.startChat({ history: sanitizedHistory });
  const result = await chat.sendMessage(current_prompt);
  return result.response;
}

/**
 * Express wrapper for agentPlannerInternal
 * Implements POST /mcp/plan endpoint. Uses Gemini Function Calling to decide the next step.
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function agentPlanner(req, res, next) {
  try {
    const result = await agentPlannerInternal(req.body);
    res.status(200).json(result);
  } catch (err) {
    logger.log('error', 'Agent planner request failed');
    logger.log('error', err);
    res.status(503).send(err.message);
    next(err);
  }
}
module.exports.agentPlanner = agentPlanner;

// #############################################################################
// SECTION: Entry Point for MCP Clients
// #############################################################################

async function handleMcpRequest(req, res, next) {
  const request = req.body;

  try {
    // 1. Handle the standard MCP methods first.
    if (request.method === 'initialize') {
      const capabilities = {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "visulate-for-oracle",
          version: "2.0.0"
        },
        capabilities: {
          tools: {
            "visulate.searchObjects": {
              description: "Searches a specific database for objects matching a user's natural language query.",
              parameters: {
                type: "object",
                properties: {
                  db: { type: "string", description: "The database to search in (e.g., 'pdb21')." },
                  search_terms: { type: "array", items: { type: "string" }, description: "Keywords extracted from the user's query." },
                  object_types: {
                    type: "array",
                    items: { type: "string" },
                    description: "A list of object types to search for. For example, ['TABLE', 'VIEW']"
                  }
                },
                required: ["db", "search_terms", "object_types"]
              },
              // CORRECTED: The output schema is a nested object
              outputSchema: {
                type: "object",
                properties: {
                  output: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        owner: { type: "string" },
                        name: { type: "string" },
                        type: { type: "string" },
                        table_comments: { type: "string", nullable: true },
                        column_comments: { type: "string", nullable: true },
                        relevance_score: { type: "number" }
                      }
                    }
                  }
                }
              }
            },
            "visulate.getContext": {
              description: "Get the full context, including details of all related objects for a given database object",
              parameters: { type: "object", properties: { db: { type: "string" }, owner: { type: "string" }, name: { type: "string" }, type: { type: "string" } }, required: ["db", "owner", "name", "type"] }
            }
          }
        }
      };
      const jsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        result: capabilities
      };
      return res.status(200).json(jsonRpcResponse);
    }

    if (request.method === 'tools/list') {
      const tools = [
        {
          name: "visulate.searchObjects",
          description: "Searches a specific database for objects matching a user's natural language query.",
          inputSchema: {
            type: "object",
            properties: {
              db: { type: "string", description: "The database to search in (e.g., 'pdb21')." },
              search_terms: { type: "array", items: { type: "string" }, description: "Keywords extracted from the user's query." },
              object_types: {
                type: "array",
                items: { type: "string" },
                description: "A list of object types to search for. For example, ['TABLE', 'VIEW']"
              }
            },
            required: ["db", "search_terms", "object_types"]
          },
          // The output schema is a nested object
          outputSchema: {
            type: "object",
            properties: {
              output: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    owner: { type: "string" },
                    name: { type: "string" },
                    type: { type: "string" },
                    table_comments: { type: "string", nullable: true },
                    column_comments: { type: "string", nullable: true },
                    relevance_score: { type: "number" }
                  }
                }
              }
            }
          }
        },
        {
          name: "visulate.getContext",
          description: "Get the full context, including details of all related objects for a given database object",
          inputSchema: { type: "object", properties: { db: { type: "string" }, owner: { type: "string" }, name: { type: "string" }, type: { type: "string" } }, required: ["db", "owner", "name", "type"] }
        }
      ];
      const jsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: tools
        }
      };
      return res.status(200).json(jsonRpcResponse);
    }

    if (request.method === 'tools/call') {
      const toolName = request.params.name;
      const args = request.params.arguments;
      let result;

      switch (toolName) {
        case 'visulate.searchObjects':
          result = await searchObjectsInternal(args.db, args);
          break;
        case 'visulate.getContext':
          result = await getContextInternal(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      const jsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        // The result is a nested object, which matches the schema above
        result: {
          output: result
        }
      };
      // console.log('tools/call response:', JSON.stringify(jsonRpcResponse, null, 2));
      return res.status(200).json(jsonRpcResponse);
    }

    if (request.method === 'notifications/initialized') {
      logger.log('info', 'MCP client initialized');
      return res.status(200).end();
    }

    // ADDED: The direct method call handler (catch-all for custom methods)
    if (request.method) {
      const toolName = request.method;
      const args = request.params;
      let result;

      switch (toolName) {
        case 'visulate.searchObjects':
          result = await searchObjectsInternal(args.db, args);
          break;
        case 'visulate.getContext':
          result = await getContextInternal(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      const jsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        // The result is a nested object, which matches the schema above
        result: {
          output: result
        }
      };
      return res.status(200).json(jsonRpcResponse);
    }

    throw new Error(`Unsupported MCP method: ${request.method}`);

  } catch (err) {
    logger.log('error', `MCP Request Error: ${err.message}`);
    const errorResponse = {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32603,
        message: err.message
      }
    };
    res.status(500).json(errorResponse);
  }
}
module.exports.handleMcpRequest = handleMcpRequest;