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

function extractSqlStatements(source) {
    let sqlStatements = [];
    let currentStatement = '';
    let currentLine = 0;
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
            if (l.Text.toLowerCase().includes(' select ') ||
                l.Text.toLowerCase().includes(' insert ') ||
                l.Text.toLowerCase().includes(' update ') ||
                l.Text.toLowerCase().includes(' delete ') ||
                l.Text.toLowerCase().includes(' create ') ||
                l.Text.toLowerCase().includes(' alter ') ||
                l.Text.toLowerCase().includes(' drop ') ||
                l.Text.toLowerCase().includes(' truncate ') ||
                l.Text.toLowerCase().includes(' lock table ') ||               
                l.Text.toLowerCase().includes(' grant ') ||
                l.Text.toLowerCase().includes(' revoke ') ||
                l.Text.toLowerCase().includes(' merge ')
            ) {
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