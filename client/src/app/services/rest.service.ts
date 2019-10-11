// REST API Service
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EndpointModel } from '../models/endpoint.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})

export class RestService {
  constructor(private http: HttpClient) { }

  public getEndpoints(): Observable<EndpointModel[]> {
    return this.http.get<EndpointModel[]>(environment.apiBase).pipe(
      map(data => data.endpoints.map(data => new EndpointModel().deserialize(data)))
    );
  }

  public getObjectList(
    endpoint: String, owner: String, objectType: string): Observable<String[]> {
      return this.http.get<String[]>(`${environment.apiBase}${endpoint}/${owner}/${objectType}/*/*/`);

    }
}
