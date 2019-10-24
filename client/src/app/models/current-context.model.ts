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
export class CurrentContextModel {
  /**
   * Maintains the current database, schema and object type selection
   * 
   * @param endpoint - API endpoint for a database connection 
   * @param owner - database schema
   * @param objectType - object type (as returned by DBA_OBJECTS)
   * @param objectName - an object name
   */
  constructor(
    public endpoint: string,
    public owner: string,
    public objectType: string, 
    public objectName: string) { }

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
}
