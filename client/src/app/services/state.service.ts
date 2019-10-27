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
import { BehaviorSubject } from 'rxjs';
import { EndpointListModel, EndpointModel, SchemaModel } from '../models/endpoint.model';
import { CurrentContextModel } from '../models/current-context.model';


@Injectable({
  providedIn: 'root'
})
export class StateService {
  /**
   * Application State Service
   */
  private context = new CurrentContextModel('', '', '', '');
  private endpointList = new BehaviorSubject<EndpointListModel>(new EndpointListModel);
  private selectedEndpoint = new BehaviorSubject<EndpointModel>(new EndpointModel);
  private selectedSchema = new BehaviorSubject<SchemaModel>(new SchemaModel);
  private selectedContext = new BehaviorSubject<CurrentContextModel>(this.context);

  endpoints = this.endpointList.asObservable();
  currentEndpoint = this.selectedEndpoint.asObservable();
  currentSchema = this.selectedSchema.asObservable();
  currentContext = this.selectedContext.asObservable();

  constructor() { }

  setCurrentContext(context: CurrentContextModel) {
    this.selectedContext.next(context);
  }

  setCurrentObject(objectName: string){
    this.context.setObjectName(objectName);
    this.selectedContext.next(this.context);
  }

  setCurrentObjectType(objectType: string) {
    this.context.setObjectType(objectType);
    this.selectedContext.next(this.context);
  }

  setCurrentSchema(schema: SchemaModel) {
    this.selectedSchema.next(schema);
    this.context.setOwner(schema.owner);
    this.selectedContext.next(this.context);
  }

  setCurrentEndpoint(endpoint: EndpointModel) {
    if (endpoint) {
      this.selectedEndpoint.next(endpoint);
      this.context.setEndpoint(endpoint.endpoint);
      this.selectedContext.next(this.context);
    }
  }

  saveEndpoints(endpoints: EndpointListModel) {
    this.endpointList.next(endpoints);
    this.setCurrentEndpoint(endpoints[0]);
  }

}
