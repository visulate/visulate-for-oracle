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
import { environment } from '../../environments/environment';
import { Deserializable } from './deserializable.model';

export class EndpointListModel implements Deserializable {
  /**
   * Container for array of API endpoints.  Each endpoint
   * corresponds to a database connection.
   */
  public databases: EndpointModel[] = [];
  public errorMessage: string;
  deserialize(input: any): this {
    this.databases = input.endpoints.map(
      endpoint => new EndpointModel().deserialize(endpoint)
    );
    return this;
  }
  setErrorMessage(message: string) {
    this.errorMessage = message;
  }
}

export class EndpointModel implements Deserializable {
  /**
   * API endpoint corresponding to a database connection
   */
  public endpoint: string;
  public description: string;
  public connectString: string;
  public ebsInstance: boolean;
  public schemas: SchemaModel[];

  deserialize(input: any): this {
    Object.assign(this, input);
    const convertedSchema = convertSchema(input.schemas);
    this.ebsInstance = ((input.schemas.APPLSYS) ? true : false);
    this.schemas = convertedSchema.map(
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
  public internal: boolean;
  public objectTypes: ObjectTypeListItem[];

  deserialize(input: any): this {
    Object.assign(this, input);
    this.objectTypes
      = input.objectTypes.map(
        objectType => new ObjectTypeListItem().deserialize(objectType));
    return this;
  }
}

function convertSchema(input: any): SchemaModel[] {
  /**
   * Converts schema object from REST API to display model
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
   * ```
   * to:
   * ```
   * "schemas" : [
   * {
   *   "owner": "PUBLIC"
   *   "objectTypes": [
   *     {"type": "SYNONYM", "count": 11520}
   *   ]
   *  },
   *  {
   *   "owner": "RNTMGR"
   *   "objectTypes": [
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
  const outputSchemas = [];
  Object.keys(input).forEach((schema) => {
    let internal = environment.internalSchemas.includes(schema);
    // If the API provided an INTERNAL flag, use it.
    // The API returns 1 for internal, 0 for user.
    if (input[schema][0] && input[schema][0].hasOwnProperty('INTERNAL')) {
      internal = internal || (input[schema][0].INTERNAL === 1);
    }
    const objectTypes = input[schema].map((t) => ({ type: t.OBJECT_TYPE, count: t.OBJECT_COUNT }));
    outputSchemas.push(
      { owner: schema, internal, objectTypes }
    );
  });
  return (outputSchemas);
}

export class ObjectTypeListItem implements Deserializable {
  public type: string;
  public count: number;

  deserialize(input: any): this {
    return Object.assign(this, input);
  }
}
