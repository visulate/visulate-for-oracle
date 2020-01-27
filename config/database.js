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
  * API endpoint and connection details for Oracle database user(s) with the 
  * `SELECT ANY DICTIONARY` privilege
  */
const endpoints = [
  { namespace: 'vis19pdb',
    description: '19c pluggable database instance running in a docker container',
    connect: { poolAlias: 'vis19pdb',
               user: 'visulate',
               password: 'visulate',
               connectString: 'sng2244.visulate.net:1521/ORCLPDB1',
               poolMin: 4,
               poolMax: 4,
               poolIncrement: 0
             }
  },
  { namespace: 'vis13',
    description: '11.2.0.4 sandbox instance',
    connect: { poolAlias: 'vis13',
               user: 'visulate',
               password: 'visList94542',
               connectString: 'hdy528.visulate.net:1521/VIS13',
               poolMin: 4,
               poolMax: 4,
               poolIncrement: 0
             }
  },
  { namespace: 'oracle18XE',
  description: '18c XE pluggable database instance running in a docker container',
  connect: { poolAlias: 'oracle18XE',
             user: 'visulate',
             password: '',
             connectString: 'db20.visulate.net:41521/XEPDB1',
             poolMin: 4,
             poolMax: 4,
             poolIncrement: 0
           }
},
{ namespace: 'oracle11XE',
  description: '11.2 XE database',
  connect: { poolAlias: 'oracle11XE',
             user: 'visulate',
             password: '',
             connectString: 'db20.visulate.net:49161/XE',
             poolMin: 4,
             poolMax: 4,
             poolIncrement: 0
           }
}
];
module.exports.endpoints = endpoints; 