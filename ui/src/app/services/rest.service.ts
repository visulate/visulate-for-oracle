/* !
 * Copyright 2019, 2025 Visulate LLC. All Rights Reserved.
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
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { EndpointListModel } from '../models/endpoint.model';
import { DatabaseObjectModel } from '../models/database-object.model';
import { FindObjectModel } from '../models/find-object.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})

export class RestService {
  private cache = new Map<string, unknown>();
  private readonly MAX_CACHE_SIZE = 50;

  private getFromCache(key: string): unknown | null {
    if (!this.cache.has(key)) {
      return null;
    }
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value); // Moves to most recent position
    return value;
  }

  private addToCache(key: string, value: unknown): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  /**
   * Makes requests to API server
   *
   * @param http - http client
   */
  constructor(private http: HttpClient) { }

  /**
   * Gets a list of database endpoints + object type summary
   */
  public getEndpoints$(filter: string = '*'): Observable<EndpointListModel> {
    const filterParam: any = { filter };
    return this.http.get<EndpointListModel>(`${environment.apiBase}/`, { params: filterParam }).pipe(
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
    const url = `${environment.apiBase}/${endpoint}`;
    const cached = this.getFromCache(url);
    if (cached) {
      return of<DatabaseObjectModel>(cached as DatabaseObjectModel);
    }
    return this.http.get<DatabaseObjectModel>(url).pipe(
      map(data => new DatabaseObjectModel().deserialize(data)),
      tap(data => this.addToCache(url, data))
    );
  }

  /**
   * Get schema summary
   * @param endpoint - the database endpoint
   * @param owner - the schema owner
   * @param filter - the object filter
   */
  public getSchemaProperties$(
    endpoint: string,
    owner: string,
    filter: string = '*'
  ): Observable<DatabaseObjectModel> {
    const url = `${environment.apiBase}/${endpoint}/${owner}?filter=${filter}`;
    const cached = this.getFromCache(url);
    if (cached) {
      return of<DatabaseObjectModel>(cached as DatabaseObjectModel);
    }
    const filterParam: any = { filter };
    return this.http.get<DatabaseObjectModel>
      (`${environment.apiBase}/${endpoint}/${owner}`, { params: filterParam }).pipe(
        map(data => new DatabaseObjectModel().deserialize(data)),
        tap(data => this.addToCache(url, data))
      );
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
    if (!objectType) {
      throw new Error('Object type is required');
    }
    const url = `${environment.apiBase}/${endpoint}/${owner}/${objectType}/${encodeURIComponent(objectName)}/${objectStatus}`;
    const cached = this.getFromCache(url);
    if (cached) {
      return of<string[]>(cached as string[]);
    }
    return this.http.get<string[]>(url).pipe(
      tap(data => this.addToCache(url, data))
    );
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
    objectName: string): Observable<DatabaseObjectModel> {
    const url = `${environment.apiBase}/${endpoint}/${owner}/${objectType}/${encodeURIComponent(objectName)}`;
    const cached = this.getFromCache(url);
    if (cached) {
      return of<DatabaseObjectModel>(cached as DatabaseObjectModel);
    }
    return this.http.get<DatabaseObjectModel>(url).pipe(
      map(data => new DatabaseObjectModel().deserialize(data)),
      tap(data => this.addToCache(url, data))
    );
  }

  /**
   * Get connect string for a given endpoint. Used to verify the endpoint has been registered with the query engine
   * @param endpoint - database endpoint
   */
  public getConnectString$(
    endpoint: string
  ): Observable<string> {
    return this.http.get
      (`${environment.queryBase}/${endpoint}`, { responseType: 'text' });
  }

  /**
   * Check if AI is enabled
   */
  public getAiEnabled$(): Observable<{ enabled: boolean }> {
    return this.http.get<{ enabled: boolean }>(`${environment.aiBase}`);
  }


  public sql2csv$(
    url: string,
    dbCredentials: string,
    sql: string,
    binds: JSON,
    options: JSON): Observable<any> {

    const httpOptions: Object = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'X-DB-Credentials': `${dbCredentials}`,
        Accept: 'application/json',
        observe: 'response'

      })
    };
    const bodycontent = {
      sql,
      binds,
      options
    };

    return this.http.post(`${url}`, JSON.stringify(bodycontent), httpOptions);

  }

  public async chatStream(
    message: string,
    context: any,
    agent: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: any) => void,
    onSessionId?: (id: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const apiUrl = `${environment.aiBase}/`;
    const payload = {
      message,
      context,
      agent,
      session_id: context.session_id // Include session_id in payload
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/plain'
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Capture session ID from header
      const sessionId = response.headers.get('X-Session-ID');
      if (sessionId && onSessionId) {
        onSessionId(sessionId);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
      }
      onComplete();

    } catch (e) {
      if (e.name === 'AbortError') {
        // Cancellation handled by caller
        onComplete(); // Or specific handling
      } else {
        onError(e);
      }
    }
  }

  generateToken(database: string, username: string, password: string): Observable<any> {
    const apiUrl = `${environment.apiBase}/token`;
    return this.http.post<any>(apiUrl, { database, username, password });
  }

}
