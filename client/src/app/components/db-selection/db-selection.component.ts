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

import { Component, OnInit } from '@angular/core';
import { StateService } from '../../services/state.service';
import { EndpointListModel, EndpointModel, SchemaModel } from '../../models/endpoint.model';

@Component({
  selector: 'app-db-selection',
  templateUrl: './db-selection.component.html',
  styleUrls: ['./db-selection.component.css']
})
export class DbSelectionComponent implements OnInit {
  /**
   * Code to Select: Database -> Schema -> Object Type
   */
  public endpoints: EndpointListModel;
  public currentEndpoint: EndpointModel;
  public currentSchema: SchemaModel;

  constructor(private state: StateService) { }

  setObjectType(objectType: string) {
    this.state.setCurrentObjectType(objectType);
  }

  setSchema(schema: SchemaModel) {
    this.state.setCurrentSchema(schema);
  }

  setEndpoint(endpoint: EndpointModel){
    this.state.setCurrentEndpoint(endpoint);
  }

  ngOnInit() {
     this.state.endpoints.subscribe(
       endpoints => { this.endpoints = endpoints; });
     this.state.currentEndpoint.subscribe(
       currentEndpoint => { this.currentEndpoint = currentEndpoint;} );
     this.state.currentSchema.subscribe(
       currentSchema => { this.currentSchema = currentSchema;} );
  }
}
