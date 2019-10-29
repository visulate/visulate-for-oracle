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
import { EndpointListModel } from '../models/endpoint.model';
import { CurrentContextModel } from '../models/current-context.model';


@Injectable({
  providedIn: 'root'
})
export class StateService {
  /**
   * Application State Service
   * @description The application uses 2 observables to maintain state:
   * `endpoint$` holds the current list of database endpoints returned from
   * the API server.
   * `currentContext$` holds the menu selection.
   */
  private endpointList = new BehaviorSubject<EndpointListModel>(new EndpointListModel);
  private selectedContext = 
          new BehaviorSubject<CurrentContextModel>(new CurrentContextModel('', '', '', ''));   

  endpoints$ = this.endpointList.asObservable();
  currentContext$ = this.selectedContext.asObservable();

  constructor() { }

  setCurrentContext(context: CurrentContextModel) {
    this.selectedContext.next(context);    
  }

  saveEndpoints(endpoints: EndpointListModel) {
    this.endpointList.next(endpoints);
  }
}
