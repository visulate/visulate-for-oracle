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

    // TABLES: 10 + 2 + 8 = 20, VIEW: 5, INDEX: 4
    // Should be sorted by count descending
    expect(endpoint.aggregatedObjectTypes).toEqual([
      { type: 'TABLE', count: 20 },
      { type: 'VIEW', count: 5 },
      { type: 'INDEX', count: 4 }
    ]);
  });
});
