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
const router = new express.Router();
const controller = require('./controller.js');

router.route('/')
  .get(controller.getEndpoints);

router.route('/:db/:owner/:type/:name/:status')
  .get(controller.listObjects);  

router.route('/:db/:owner/:type/:name')
  .get(controller.showObject);    
module.exports = router;