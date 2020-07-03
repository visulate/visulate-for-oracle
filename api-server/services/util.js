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

 /**
  * Parse PL/SQL source code to find SQL statements. Returns an array of statements and line numbers
  * @param {*} source - source code to parse
  */
function extractSqlStatements(source) {
    let sqlStatements = [];
    let currentStatement = '';
    let currentLine = 0;
    const regexSql = /\b(?:select|insert|update|delete|create|alter|drop|truncate|lock|grant|revoke|merge)\b/gi;
    for (const l of source) {
        if (currentStatement) {
            if (l.Text.includes(';')) {
                currentStatement += l.Text;
                sqlStatements.push({'Line': currentLine, 'Statement': currentStatement});
                currentStatement = '';
            } else {
                currentStatement += l.Text;                
            }
        } else {
            if (l.Text.toLowerCase().match(regexSql)) {
                currentStatement = l.Text;
                currentLine = l.Line;
                if (l.Text.includes(';')) {                   
                    sqlStatements.push({'Line': currentLine, 'Statement': currentStatement});
                    currentStatement = '';
                }
            }
        }
    }
    return sqlStatements;
}

module.exports.extractSqlStatements = extractSqlStatements;
/**
 * Return the result of a promise if it completes before a timeout period
 * specified in milliseconds.
 * https://italonascimento.github.io/applying-a-timeout-to-your-promises/
 * 
 * @param {*} ms - timeout period
 * @param {*} message - timeout message
 * @param {*} promise - promise to execute
 */
function promiseTimeout(ms, message, promise){
    
    const timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            clearTimeout(id);
            reject({
                type: 'timeout',
                message: `${message} timed out in ${ms} ms`
            })
        }, ms)
        });

    return Promise.race([
    promise,
    timeout
    ]);
}
module.exports.promiseTimeout = promiseTimeout;    

