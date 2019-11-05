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
import { Router } from '@angular/router'
import { StateService } from '../../services/state.service';
import { EndpointListModel, EndpointModel, SchemaModel, ObjectTypeListItem } from '../../models/endpoint.model';
import { CurrentContextModel } from '../../models/current-context.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-db-selection',
  templateUrl: './db-selection.component.html',
  styleUrls: ['./db-selection.component.css']
})

 /**
 * Code to Select: Database -> Schema -> Object Type
 */
export class DbSelectionComponent implements OnInit {
  public endpoints: EndpointListModel;
  public currentEndpoint: EndpointModel;
  public currentSchema: SchemaModel;
  public currentObjectType: ObjectTypeListItem; 
  public currentContext: CurrentContextModel;
  private unsubscribe$ = new Subject<void>();
  

  constructor(
    private state: StateService,
    private router: Router) { }

  setObjectType(objectType: ObjectTypeListItem) {
    this.currentObjectType = objectType;
    this.router.navigate
      ([`/database/${this.currentEndpoint.endpoint}/${this.currentSchema.owner}/${objectType.type}`]);
  }

  setSchema(schema: SchemaModel) {
    this.currentSchema = schema;
    this.router.navigate
      ([`/database/${this.currentEndpoint.endpoint}/${schema.owner}`]);
  }

  setEndpoint(endpoint: EndpointModel){
    this.currentEndpoint = endpoint;
    this.router.navigate([`/database/${endpoint.endpoint}`]);
  }

  /**
   * Update the object type selection form on initial load
   * @param endpoints - database endpoint list subscription
   */
  processEndpointListChange(endpoints: EndpointListModel) {
    this.endpoints = endpoints;
    if (this.currentContext && this.currentContext.endpoint && this.endpoints.databases) {
      this.currentEndpoint = this.currentContext.findCurrentEndpoint(this.endpoints);
    }   
    if (this.currentContext && this.currentEndpoint && this.currentEndpoint.schemas) {
      this.currentSchema = this.currentContext.findCurrentSchema(this.currentEndpoint);
    }
    if (this.currentContext && this.currentSchema && this.currentSchema.object_types) {
      this.currentObjectType = this.currentContext.findCurrentObjectType(this.currentSchema);
    }
  }

  /**
   * Update the object type selection form when the current context changes
   * @param context - Current context (db, schema, object type and name) subscription
   */
  processContextChange( context: CurrentContextModel ) {  
    this.currentContext = context;
    if (this.endpoints.databases) {
      this.currentEndpoint = this.currentContext.findCurrentEndpoint(this.endpoints);
    }
    if (this.currentEndpoint && this.currentEndpoint.schemas){
      this.currentSchema = this.currentContext.findCurrentSchema(this.currentEndpoint);
    }
    if (this.currentSchema && this.currentSchema.object_types){
      this.currentObjectType = this.currentContext.findCurrentObjectType(this.currentSchema);
    }
  }

  ngOnInit() {
     this.state.endpoints$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(endpoints => { this.processEndpointListChange(endpoints) });
    this.state.currentContext$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(context => { this.processContextChange(context); });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
