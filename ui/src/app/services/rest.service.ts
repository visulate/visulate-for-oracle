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
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EndpointListModel } from '../models/endpoint.model';
import { DatabaseObjectModel } from '../models/database-object.model';
import { FindObjectModel } from '../models/find-object.model';
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
  public getEndpoints$( filter: string = '*'): Observable<EndpointListModel> {
    const filterParam: any = {'filter': filter};
    return this.http.get<EndpointListModel>(`${environment.apiBase}/`, {params: filterParam}).pipe(
      map(data => new EndpointListModel().deserialize(data))
    );
  }

  /**
   * Get database summary
   * @param endpoint - the database endpoint
   */
  public getDatabaseProperties$(
    endpoint: string
  ): Observable<DatabaseObjectModel> {

    return this.http.get<DatabaseObjectModel>
    (`${environment.apiBase}/${endpoint}`);
  }

  /**
   * Get database summary
   * @param endpoint - the database endpoint
   */
  public getSchemaProperties$(
    endpoint: string,
    owner: string,
    filter: string = '*'
  ): Observable<DatabaseObjectModel> {
    const filterParam: any = {'filter': filter};
    return this.http.get<DatabaseObjectModel>
    (`${environment.apiBase}/${endpoint}/${owner}`, {params: filterParam});
  }


 /**
 * Find objects in each registered database
 * @param searchTerm - database object name (DBA_OBJECTS.OBJECT_NAME)
 */
  public getSearchResults$(searchTerm: string): Observable<FindObjectModel> {
    return this.http.get<FindObjectModel>(`${environment.findObjectBase}/${encodeURIComponent(searchTerm)}`);
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
        (`${environment.apiBase}/${endpoint}/${owner}/${objectType}/${encodeURIComponent(objectName)}/${objectStatus}`);
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
    objectName: string ): Observable<DatabaseObjectModel> {
      return this.http.get<DatabaseObjectModel>
        (`${environment.apiBase}/${endpoint}/${owner}/${objectType}/${encodeURIComponent(objectName)}`);
    }

  /**
   * Get connect string for a given endpoint. Used to verify the endpoint has been registered with the query engine
   * @param endpoint - database endpoint
   */
  public getConnectString$(
    endpoint: string
  ): Observable<string> {
    return this.http.get
      (`${environment.queryBase}/${endpoint}`, {responseType: 'text'} );
  }


  public sql2csv$(
    url: string,
    basicAuth: string,
    sql: string,
    binds: JSON): Observable<any> {

      const httpOptions: Object = {
        headers: new HttpHeaders({
          'Content-Type':  'application/json',
          'Authorization': `Basic ${basicAuth}`,
          'Accept': 'application/json',
          observe: 'response'

        })
      };
      const bodycontent = {
        'sql': sql,
        'binds': binds
      };

     return this.http.post(`${url}`, JSON.stringify(bodycontent), httpOptions );

    }

}
