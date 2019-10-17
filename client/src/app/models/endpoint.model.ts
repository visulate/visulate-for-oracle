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

import { Deserializable } from './deserializable.model';
export class EndpointListModel implements Deserializable {
  /**
   * Container for array of API endpoints.  Each endpoint
   * corresponds to a database connection.
   */
  public endpoints: EndpointModel[];
  deserialize(input: any): this {
    this.endpoints = input.endpoints.map (
      endpoint => new EndpointModel().deserialize(endpoint)
    );
    return this;
  }
}

export class EndpointModel implements Deserializable { 
  /**
   * API endpoint corresponding to a database connection. 
   */
  public endpoint: string;
  public schemas: SchemaModel[];

  deserialize(input: any): this {
    Object.assign(this, input);
    const convertedSchema = convertSchema(input.schemas);
     this.schemas = convertedSchema.map (
       schema => new SchemaModel().deserialize(schema)
     );
    return this;
  }
}

export class SchemaModel implements Deserializable {
  /**
   * Database user/owner and count of objects by type.
   */
  public owner: string;
  public object_types: ObjectTypeListItem[];

  deserialize(input: any): this {
    Object.assign(this, input);
    this.object_types
     = input.object_types.map(
       object_type => new ObjectTypeListItem().deserialize(object_type));
    return this;
  }
}

function convertSchema(input: any): SchemaModel[] {
/**
   * Converts schema object from REST API to display model.  
   * @remarks
   * Example convert:
   * ```
   * "schemas": {
   * "PUBLIC": [
   *   {
   *     "OWNER": "PUBLIC",
   *     "OBJECT_TYPE": "SYNONYM",
   *     "OBJECT_COUNT": 11520
   *   }
   * ],
   * "RNTMGR2": [
   *   {
   *     "OWNER": "RNTMGR2",
   *     "OBJECT_TYPE": "INDEX",
   *     "OBJECT_COUNT": 268
   *   },
   *   {
   *     "OWNER": "RNTMGR2",
   *     "OBJECT_TYPE": "TABLE",
   *     "OBJECT_COUNT": 78
   *   }
   *  ]
   * }
   *```
   * to:
   *```
   * "schemas" : [
   * {
   *   "owner": "PUBLIC"
   *   "object_types": [
   *     {"type": "SYNONYM", "count": 11520}
   *   ]
   *  },
   *  {
   *   "owner": "RNTMGR"
   *   "object_types": [
   *     {"type": "INDEX", "count": 268},
   *     {"type": "TABLE", "count": 78}
   *   ]
   *  }
   * ]
   * ```
   * @param input - schemas object from REST API
   * @returns array of SchemaModels
   * 
   */
  let outputSchemas = [];
  Object.keys(input).forEach((schema) => {
    const objectTypes = input[schema].map((t) => {
      return {type: t.OBJECT_TYPE, count: t.OBJECT_COUNT};
    })
    outputSchemas.push(
      {owner: schema,
       object_types: objectTypes}
    );
  });
  return(outputSchemas);
}

 class ObjectTypeListItem  implements Deserializable {
  public type: string;
  public count: number;

  deserialize(input: any): this {
    return Object.assign(this, input);
  }
}






