/*!
 * Copyright 2020 Visulate LLC. All Rights Reserved.
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
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Return true if arg1 == arg2 else false
handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
  return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});

// Return true if arg1 != arg2 else false
handlebars.registerHelper('unlessEquals', function (arg1, arg2, options) {
  return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
});

// Return true if arg appears in csv
handlebars.registerHelper('ifAppearsIn', function (arg, csv, options){
  const list = csv.split(',');
  return (list.includes(arg)) ? options.fn(this) : options.inverse(this);
});

// Return true if arg does not in csv
handlebars.registerHelper('unlessAppearsIn', function (arg, csv, options){
  const list = csv.split(',');
  return (list.includes(arg)) ? options.inverse(this): options.fn(this);
});

// Assign varName = varValue
handlebars.registerHelper('assign', function (varName, varValue, options) {
  if (!options.data.root) {
    options.data.root = {};
  }
  options.data.root[varName] = varValue;
});

// Append a value to an assigned variable
handlebars.registerHelper('append', function (varName, varValue, options) {
  if (!options.data.root) {
    options.data.root = {};
  }
  const appendedValue = options.data.root[varName] + varValue;
  options.data.root[varName] = appendedValue;
});

// Return true if value assigned to levelName is different to newLevel else false
handlebars.registerHelper('ifLevelChanged', function (levelName, newLevel, options) {
  if (!options.data.root) {
    options.data.root = {};
  }
  const oldLevel = options.data.root[levelName];
  if (oldLevel == newLevel) {
    return options.inverse(this);
  } else {
    options.data.root[levelName] = newLevel;
    return options.fn(this)
  }
});


/**
 * Mutate object by stripping space characters from keys
 * e.g. convert "Table Description" : [] to "TableDescription" : []
 *
 * @param {} object - the object to mutate
 */
function removeSpacesInKeys(object) {
  Object.keys(object).forEach(function (key) {
    const newKey = key.replace(/\s+/g, '');
    if (object[key] && typeof object[key] === 'object') {
      removeSpacesInKeys(object[key]);
    }
    if (key !== newKey) {
      object[newKey] = object[key];
      delete object[key];
    }
  });
}

/**
 * Refactor the showObject's return value for use in mustache template
 * @param {*} resultObject - objectDetails value from showObject
 */
function refactorResultObject(resultObject) {
  let refactoredObject = resultObject.map(obj => {
    let rObj = {};
    rObj[obj.title] = obj.rows;
    return rObj;
  });
  return refactoredObject
}

/**
 * Apply a handlebars template to the resultSet.
 *
 * applyTemplate can be called from the showObject function to format an object
 * report or listObjects to format a list of database objects. The resultType
 * parameter is used to indicate the source/type of data. Object report results are
 * refactored to simplify templating. Report results are passed in using the resultSet
 * parameter.
 *
 * The template is passed as a query parameter and references a handlebars or mustache
 * template in the {api-root}/config/templates directory. applyTemplate returns a promise
 * which resolves when the template has been applied or rejects if passed an invalid
 * template name. Passing a template value of 'none' resolves by returning the refactored
 * resultSet that gets passed to the template for formatting. This can be used during
 * template development.
 *
 * @param {*} resultType - 'object' or 'list'
 * @param {*} resultSet - data to pass to the template
 * @param {*} req - the http request object
 */
function applyTemplate(resultType, resultSet, req) {
  return new Promise(function (resolve, reject) {
    const template = req.query.template;
    let resultObject = new Object();
    resultObject.runDate = new Date().toDateString();
    resultObject.protocol = req.protocol;
    resultObject.host = req.headers.host;
    resultObject.url = req.url;
    resultObject.params = req.params;
    resultObject.queryParams = req.query;
    resultType === 'object' ?
      resultObject.results = refactorResultObject(resultSet) : resultObject.results = resultSet;
    removeSpacesInKeys(resultObject);

    if (template === 'none') {
      resolve(resultObject);
    } else {
      const templateFile = path.normalize(`${__dirname}/../config/templates/${template}`);
      fs.readFile(templateFile, 'utf8', (err, tpl) => {
        if (err) {
          reject(`Template ${template} not found`);
          return;
        }
        try {
          const compiledTemplate = handlebars.compile(tpl);
          const transformed = compiledTemplate(resultObject);
          resolve(transformed)
        } catch (error) {
          reject(`Template error: "${error}"`);
          return;
        }
      });
    }
  });
}

module.exports.applyTemplate = applyTemplate;