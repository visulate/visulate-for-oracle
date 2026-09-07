/*!
 * Copyright 2019, 2021 Visulate LLC. All Rights Reserved.
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

const express = require('express');
const router = new express.Router();
const controller = require('./controller.js');
const aiService = require('./ai-service.js');
const downloadService = require('./download-service.js');
const gitService = require('./gitService.js');
const dependencyIndexer = require('./dependencyIndexer.js');
const dbConfig = require('../config/database.js');
router.use(express.json());

const { Validator, ValidationError } = require('express-json-validator-middleware');
const validator = new Validator({ allErrors: true });
const validate = validator.validate;
const util = require('util');

const YAML = require('yamljs');
const path = require("path");
const swaggerUi = require('swagger-ui-express');
const swaggerDoc = YAML.load(path.resolve(__dirname, '../openapi.yaml'));

const collectionSchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['owner', 'type', 'name', 'status'],
    properties: {
      owner: { type: 'string' },
      type: { type: 'string' },
      name: { type: 'string' },
      status: { type: 'string' }
    }
  }
};

const objectListSchema = {
  type: 'object',
  required: ['object', 'baseUrl', 'baseDB', 'baseOwner', 'baseType', 'baseObject', 'relatedObjects'],
  properties: {
    object: { type: 'string' },
    baseUrl: { type: 'string' },
    baseDB: { type: 'string' },
    baseOwner: { type: 'string' },
    baseType: { type: 'string' },
    baseObject: { type: 'string' },
    relatedObjects: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

const aiSchema = {
  type: 'object',
  required: ['message', 'context'],
  properties: {
    message: { type: 'string' },
    agent: { type: 'string' },
    context: {
      type: ['object', 'array'],
      items: {
        type: 'object'
      }
    }
  }
};

const jsonRpcSchema = {
  type: 'object',
  required: ['jsonrpc', 'method'],
  properties: {
    jsonrpc: { type: 'string', enum: ['2.0'] },
    method: { type: 'string' }
  }
};

const aiBodySchema = {
  oneOf: [
    aiSchema,
    jsonRpcSchema
  ]
};

const mcpContextSchema = {
  type: 'object',
  required: ['owner', 'name', 'type'],
  properties: {
    owner: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' }
  }
};

const mcpSearchSchema = {
  type: 'object',
  required: ['search_terms', 'object_types'],
  properties: {
    search_terms: {
      type: 'array',
      items: { type: 'string' }
    },
    object_types: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

const transformSchema = {
  oneOf: [
    {
      type: 'array',
      items: {
        type: 'object'
      }
    },
    {
      type: 'object',
      required: ['objectProperties'],
      properties: {
        objectProperties: {
          type: 'array',
          items: {
            type: 'object'
          }
        }
      }
    }
  ]
}

router.route('/')
  .get(controller.getEndpoints);

router.route('/api')
  .get(controller.getEndpoints);

router.route('/endpoints')
  .get(controller.getEndpointConnections);

router.use('/api-docs', swaggerUi.serve);
router.route('/api-docs')
  .get(swaggerUi.setup(swaggerDoc));

router.route('/find/:name')
  .get(controller.dbSearch);

/* Database Connection Configs Endpoint */
router.route('/api/database-connections')
  .get((req, res) => {
    try {
      const list = (dbConfig.endpoints || []).map(ep => ({
        endpoint: ep.namespace,
        description: ep.description || ep.namespace,
        dbType: ep.connect?.dbType || 'oracle'
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

/* Feature Flag Middleware for Git Integration and File Editing */
const checkGitFeatureEnabled = (req, res, next) => {
  const isEnabled = process.env.ENABLE_GIT_INTEGRATION === 'true';
  if (!isEnabled) {
    return res.status(403).json({ error: 'Git integration and file editing features are disabled.' });
  }
  next();
};

router.use('/api/git', checkGitFeatureEnabled);

/* Git Session & User Context Middleware */
router.use('/api/git', (req, res, next) => {
  const gitMode = (process.env.GIT_MODE || 'local').toLowerCase();

  // Trusted authenticated principal (from session middleware or authenticating reverse proxy)
  const principal = req.user?.username || req.user?.id || req.user?.sub
    || req.headers['x-authenticated-user']
    || req.headers['x-forwarded-user']
    || req.headers['remote-user']
    || req.headers['x-user']
    || null;

  if (gitMode === 'server') {
    if (!principal) {
      return res.status(401).json({ error: 'Authentication required for server-mode git operations' });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(principal)) {
      return res.status(400).json({ error: 'Invalid authenticated user identity' });
    }
  }

  req.userContext = { username: principal };
  req.authContext = {
    username: req.headers['x-git-user'] || null,
    token: req.headers['x-git-token'] || null,
    authorName: req.headers['x-git-author-name'] || null,
    authorEmail: req.headers['x-git-author-email'] || null
  };
  next();
});

/* Git REST Endpoints */
router.route('/api/git/repositories')
  .get((req, res) => {
    try {
      const baseDir = gitService.getBaseReposDir(req.userContext);
      const repos = gitService.listLocalRepositories(req.userContext);
      res.json({ baseDir, repositories: repos });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/clone')
  .post(async (req, res) => {
    try {
      const { remoteUrl, folderName, branch } = req.body;
      if (!remoteUrl || !folderName) {
        return res.status(400).json({ error: 'remoteUrl and folderName are required' });
      }
      const result = await gitService.cloneRepoToFolder(remoteUrl, folderName, branch, req.userContext, req.authContext);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/diff')
  .get(async (req, res) => {
    try {
      const projectId = req.query.projectId || 'default-project';
      const filePath = req.query.path || '';
      const diff = await gitService.getDiff(projectId, filePath, req.userContext);
      res.json({ diff });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/file')
  .get(async (req, res) => {
    try {
      const projectId = req.query.projectId || 'default-project';
      const filePath = req.query.path || '';
      const revision = req.query.revision || null;
      const content = await gitService.getFileContent(projectId, filePath, revision, req.userContext);
      res.json({ content, projectId, path: filePath, revision });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  })
  .put(async (req, res) => {
    try {
      const { projectId = 'default-project', filePath, content } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }
      const result = await gitService.saveFileContent(projectId, filePath, content, req.userContext);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/files')
  .get(async (req, res) => {
    try {
      const projectId = req.query.projectId || 'default-project';
      const subDir = req.query.subDir || '';
      const files = await gitService.listProjectFiles(projectId, subDir, req.userContext);
      res.json({ files, projectId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/branches')
  .get(async (req, res) => {
    try {
      const projectId = req.query.projectId || 'default-project';
      const branchInfo = await gitService.getRepoBranches(projectId, req.userContext);
      res.json(branchInfo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/checkout')
  .post(async (req, res) => {
    try {
      const { projectId = 'default-project', branchName, createIfMissing = false } = req.body;
      if (!branchName) {
        return res.status(400).json({ error: 'branchName is required' });
      }
      const result = await gitService.switchBranch(projectId, branchName, createIfMissing, req.userContext);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/commit-push')
  .post(async (req, res) => {
    try {
      const { projectId = 'default-project', branchName, commitMessage = 'Visulate Workbench commit' } = req.body;
      const result = await gitService.commitAndPush(projectId, branchName, commitMessage, req.userContext, req.authContext);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/pull')
  .post(async (req, res) => {
    try {
      const { projectId = 'default-project', branchName } = req.body;
      const result = await gitService.pullRepo(projectId, branchName, req.authContext, req.userContext);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/index-dependencies')
  .post(async (req, res) => {
    try {
      const { projectId = 'default-project', owner, dbConnectionId } = req.body;
      const map = await dependencyIndexer.indexProjectDependencies(projectId, owner, req.userContext, dbConnectionId);
      res.json(map);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/git/code-dependencies')
  .get(async (req, res) => {
    try {
      const { db, name, repo, owner } = req.query;
      if (!db || !name) {
        return res.status(400).json({ error: 'db and name query parameters are required' });
      }
      const result = await dependencyIndexer.getObjectCodeDependencies(db, name, req.userContext, repo, owner);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

router.route('/api/:db')
  .get(controller.getDbDetails);

router.route('/api/:db/:owner')
  .get(controller.getSchemaDetails);

router.route('/api/:db/:owner/:type')
  .get(controller.listObjects);

router.route('/api/:db/:owner/:type/:name/:status')
  .get(controller.listObjects);

router.route('/ddl/:db/:owner/:type')
  .get(controller.generateDDL);

router.route('/ddl/:db/:owner/:type/:name/:status')
  .get(controller.generateDDL);

router.route('/api/:db/:owner/:type/:name')
  .get(controller.showObject)
  .post(validate({ body: transformSchema }), controller.transformObject);

router.route('/api/collection')
  .post(validate({ body: objectListSchema }), controller.getObjectReferences);

router.route('/api/collection/:db')
  .post(validate({ body: collectionSchema }), controller.getCollection);


router.route('/ai')
  .get(aiService.aiEnabled)
  .post(validate({ body: aiBodySchema }), aiService.generativeAI);

router.route('/mcp')
  .get(aiService.handleMcpRequest)
  .post(aiService.handleMcpRequest)
  .delete(aiService.handleMcpRequest);

router.route('/api/token')
  .post(aiService.generateToken)
  .delete(aiService.revokeToken);

router.route('/mcp/context/:db')
  .post(validate({ body: mcpContextSchema }), aiService.getContext);

router.route('/mcp/search-objects/:db')
  .post(validate({ body: mcpSearchSchema }), aiService.searchObjects);

router.route('/mcp/schema-summary/:db')
  .post(aiService.getSchemaSummary);

router.route('/mcp/schema-relationships/:db')
  .post(aiService.getSchemaRelationships);

router.route('/mcp/schema-columns/:db')
  .post(aiService.getSchemaColumns);

router.route('/download/:sessionId/:filename')
  .get(downloadService.serveFile);


// Error handler JSON Schema errors
router.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    res.status(400).json(util.inspect(err.validationErrors, { showHidden: false, depth: null }));
    next();
  }
  else next(err); // pass error on if not a validation error
});

module.exports = router;