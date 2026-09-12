/* !
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

import { EndpointModel } from './endpoint.model';

describe('Endpoint', () => {
  it('should create an instance', () => {
    expect(new EndpointModel()).toBeTruthy();
  });

  it('should compute schema counts and aggregate object types on deserialize', () => {
    const mockInput = {
      endpoint: 'test-db',
      dbType: 'oracle',
      schemas: {
        'SYS': [
          { OWNER: 'SYS', OBJECT_TYPE: 'TABLE', OBJECT_COUNT: 10, INTERNAL: 1 },
          { OWNER: 'SYS', OBJECT_TYPE: 'VIEW', OBJECT_COUNT: 5, INTERNAL: 1 }
        ],
        'HR': [
          { OWNER: 'HR', OBJECT_TYPE: 'TABLE', OBJECT_COUNT: 2, INTERNAL: 0 },
          { OWNER: 'HR', OBJECT_TYPE: 'INDEX', OBJECT_COUNT: 4, INTERNAL: 0 }
        ],
        'SALES': [
          { OWNER: 'SALES', OBJECT_TYPE: 'TABLE', OBJECT_COUNT: 8, INTERNAL: 0 }
        ]
      }
    };

    const endpoint = new EndpointModel().deserialize(mockInput);

    // SYS is internal, HR and SALES are user schemas
    expect(endpoint.internalSchemaCount).toBe(1);
    expect(endpoint.userSchemaCount).toBe(2);
    expect(endpoint.userSchemas.length).toBe(2);
    expect(endpoint.userSchemas[0].owner).toBe('HR');
    expect(endpoint.userSchemas[1].owner).toBe('SALES');

    // Only user schemas are aggregated: HR (TABLE: 2, INDEX: 4) + SALES (TABLE: 8)
    // TABLES: 2 + 8 = 10, INDEX: 4 (SYS's TABLE: 10 and VIEW: 5 are excluded)
    expect(endpoint.aggregatedObjectTypes).toEqual([
      { type: 'TABLE', count: 10 },
      { type: 'INDEX', count: 4 }
    ]);
  });

  it('should generate appropriate cliCommand and cliLabel for Oracle and Postgres', () => {
    const oracleEp = new EndpointModel().deserialize({
      endpoint: 'pdb21',
      dbType: 'oracle',
      connectString: '192.168.1.170:1522/pdb21.goldthorp.org',
      schemas: {}
    });
    expect(oracleEp.cliLabel).toBe('sqlplus');
    expect(oracleEp.cliCommand).toBe('sqlplus <username>@192.168.1.170:1522/pdb21.goldthorp.org');

    const oracleDescEp = new EndpointModel().deserialize({
      endpoint: 'vis25adb',
      dbType: 'oracle',
      connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=host)(PORT=1521)))',
      schemas: {}
    });
    expect(oracleDescEp.cliCommand).toBe("sqlplus <username>@'(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=host)(PORT=1521)))'");

    const pgEp = new EndpointModel().deserialize({
      endpoint: 'cmbs',
      dbType: 'postgres',
      connectString: 'localhost:5432/cmbs',
      schemas: {}
    });
    expect(pgEp.cliLabel).toBe('psql');
    expect(pgEp.cliCommand).toBe('psql -h localhost -p 5432 -d cmbs -U <username>');

    const pgUriEp = new EndpointModel().deserialize({
      endpoint: 'pguri',
      dbType: 'postgres',
      connectString: 'postgresql://db.corp:5433/prod',
      schemas: {}
    });
    expect(pgUriEp.cliCommand).toBe('psql "postgresql://<username>@db.corp:5433/prod"');

    const pgUriWithUserEp = new EndpointModel().deserialize({
      endpoint: 'pguri2',
      dbType: 'postgres',
      connectString: 'postgresql://myuser@db.corp:5433/prod',
      schemas: {}
    });
    expect(pgUriWithUserEp.cliCommand).toBe('psql "postgresql://myuser@db.corp:5433/prod"');
  });
});

