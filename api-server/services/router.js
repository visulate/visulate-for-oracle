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
router.use(express.json());

const { Validator, ValidationError } = require('express-json-validator-middleware');
const validator = new Validator({ allErrors: true });
const validate = validator.validate;
const util = require('util');

const YAML = require('yamljs');
const path = require("path");
const swaggerUi = require('swagger-ui-express');
const swaggerDoc = YAML.load(path.resolve(__dirname,'../openapi.yaml'));

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
    context: { type: ['object', 'array'],
      items: {
        type: 'object'
      }
    }
  }
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
  type: 'array'
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
  .post(validate({body: aiSchema}), aiService.generativeAI);

router.route('/mcp')
  .get(aiService.handleMcpRequest)
  .post(aiService.handleMcpRequest)
  .delete(aiService.handleMcpRequest);

router.route('/mcp/context/:db')
  .post(validate({body: mcpContextSchema}), aiService.getContext);

router.route('/mcp/search-objects/:db')
  .post(validate({body: mcpSearchSchema}), aiService.searchObjects);


// Error handler JSON Schema errors
router.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    res.status(400).json(util.inspect(err.validationErrors, { showHidden: false, depth: null }));
    next();
  }
  else next(err); // pass error on if not a validation error
});

module.exports = router;