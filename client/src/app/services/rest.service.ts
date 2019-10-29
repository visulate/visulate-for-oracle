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

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EndpointListModel } from '../models/endpoint.model';
import { DatabaseObjectModel } from '../models/database-object.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})

export class RestService {
  /**
   * Makes requests to API server 
   * 
   * @param http - http client
   */
  constructor(private http: HttpClient) { }

  /**
   * Gets a list of database endpoints + object type summary
   */
  public getEndpoints$(): Observable<EndpointListModel> {
    return this.http.get<EndpointListModel>(environment.apiBase).pipe(
      map(data => new EndpointListModel().deserialize(data))
    );
  }

  /**
   * Gets a list of objects 
   * @param endpoint - the database endpoint
   * @param owner - a database user
   * @param objectType - object type
   * @param objectName - object name or wildcard pattern
   * @param objectStatus - Status (VALID, INVALID or *)
   */
  public getObjectList$(
    endpoint: string,
    owner: string,
    objectType: string,
    objectName: string = '*',
    objectStatus: string = '*'): Observable<string[]> {
      return this.http.get<string[]>
        (`${environment.apiBase}${endpoint}/${owner}/${objectType}/${objectName}/${objectStatus}/`);
  }

  /**
   * Gets details for a given object
   * @param endpoint - the database endpoint
   * @param owner - a database user
   * @param objectType - object type
   * @param objectName - object name
   */
  public getObjectDetails$(
    endpoint: string,
    owner: string,
    objectType: string,
    objectName: string ): Observable<DatabaseObjectModel>{
      return this.http.get<DatabaseObjectModel>
        (`${environment.apiBase}${endpoint}/${owner}/${objectType}/${objectName}/`);
    }


}
