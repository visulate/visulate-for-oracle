/*!
 * Copyright 2019 Visulate LLC. All Rights Reserved.
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
const bodyparser = require("body-parser");
const router = new express.Router();
const controller = require('./controller.js');
router.use(bodyparser.json());

const { Validator, ValidationError } = require('express-json-validator-middleware');
const validator = new Validator({ allErrors: true });
const validate = validator.validate;
const util = require('util');

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

router.route('/')
  .get(controller.getEndpoints);

router.route('/:db')
  .get(controller.getDbDetails);

router.route('/:db/:owner')
  .get(controller.getSchemaDetails);

router.route('/:db/:owner/:type')
  .get(controller.listObjects);  

router.route('/:db/:owner/:type/:name/:status')
  .get(controller.listObjects);

router.route('/:db/:owner/:type/:name')
  .get(controller.showObject);

router.route('/collection/:db')
  .post(validate({ body: collectionSchema }), controller.getCollection);

// Error handler JSON Schema errors
router.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    res.status(400).json(util.inspect(err.validationErrors, { showHidden: false, depth: null }));
    next();
  }
  else next(err); // pass error on if not a validation error
});

module.exports = router;