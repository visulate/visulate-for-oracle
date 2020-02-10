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
import { EndpointListModel, EndpointModel, SchemaModel, ObjectTypeListItem} from './endpoint.model';

export class CurrentContextModel {
  /**
   * Maintains the current database, schema and object type selection
   *
   * @param endpoint - API endpoint for a database connection
   * @param owner - database schema
   * @param objectType - object type (as returned by DBA_OBJECTS)
   * @param objectName - an object name
   * @param filter - object name filter e.g. 'dba_*'
   */
  constructor(
    public endpoint: string,
    public owner: string,
    public objectType: string,
    public objectName: string,
    public filter: string) { }

  public setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
    this.owner = '';
    this.objectType = '';
    this.objectName = '';
  }

  public setOwner(owner: string) {
    this.owner = owner;
    this.objectType = '';
    this.objectName = '';
  }

  public setObjectType(objectType: string) {
    this.objectType = objectType;
    this.objectName = '';
  }

  public setObjectName(objectName: string) {
    this.objectName = objectName;
  }

  public setFilter(filter: string) {
    this.filter = filter;
  }

  public findCurrentEndpoint(endpointList: EndpointListModel): EndpointModel {
    return endpointList.databases.find(database => database.endpoint === this.endpoint);
  }

  public findCurrentSchema(endpoint: EndpointModel): SchemaModel {
    return endpoint.schemas.find(schema => schema.owner === this.owner);
  }

  public findCurrentObjectType(schema: SchemaModel): ObjectTypeListItem {
    return schema.objectTypes.find(objectType => objectType.type === this.objectType);
  }
}

export class ContextBehaviorSubjectModel {
  constructor(
    public currentContext: CurrentContextModel,
    public priorContext: CurrentContextModel,
    public changeSummary: any
  ){}
}

