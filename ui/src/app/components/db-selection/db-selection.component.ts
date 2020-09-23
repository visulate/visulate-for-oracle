/*!
 * Copyright 2019, 2020 Visulate LLC. All Rights Reserved.
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

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { EndpointListModel, EndpointModel, SchemaModel, ObjectTypeListItem } from '../../models/endpoint.model';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-db-selection',
  templateUrl: './db-selection.component.html',
  styleUrls: ['./db-selection.component.css']
})



 /**
  * Code to maintain the Database -> Schema -> Object Type form
  * Displays the current selections on startup and triggers a router
  * navigation event when the current selection changes.
  */
export class DbSelectionComponent implements OnInit, OnDestroy {
  public endpoints: EndpointListModel;
  public currentEndpoint: EndpointModel;
  public currentSchema: SchemaModel;
  public currentObjectType: ObjectTypeListItem;
  public currentContext: CurrentContextModel;
  private unsubscribe$ = new Subject<void>();
  public ddlLink: string;
  public showInternal: boolean;


  constructor(
    private state: StateService,
    private router: Router,
    private restService: RestService) { }

  setDdlLink(){
    if (this.currentContext && this.currentSchema && !(environment.internalSchemas.includes(this.currentSchema.owner))) {
      const filter = (this.currentContext.filter === '')? '*': this.currentContext.filter;
      this.ddlLink = (this.currentObjectType && this.currentSchema && this.currentEndpoint && this.currentObjectType.count > 0)?
        `${environment.ddlGenBase}/${this.currentEndpoint.endpoint}/${this.currentSchema.owner}/${this.currentObjectType.type}/${filter}/*` : ''
    }
  }

  setObjectType(objectType: ObjectTypeListItem) {
    this.currentObjectType = objectType;
    if (this.currentContext.filter !== ''){
      this.router.navigate
        ([`/database/${this.currentEndpoint.endpoint}/${this.currentSchema.owner}/${objectType.type}`],
          {queryParams: {filter: this.currentContext.filter}});
    } else {
      this.router.navigate
        ([`/database/${this.currentEndpoint.endpoint}/${this.currentSchema.owner}/${objectType.type}`]);
    }
  }

  setShowInternal(value: boolean){
    this.currentContext.setShowInternal(value);
    this.state.setCurrentContext(this.currentContext);
  }

  setSchema(schema: SchemaModel) {
    this.currentSchema = schema;
    if (this.currentContext.filter !== '') {
      this.router.navigate
        ([`/database/${this.currentEndpoint.endpoint}/${schema.owner}`],
          {queryParams: {filter: this.currentContext.filter}});
    } else {
      this.router.navigate
        ([`/database/${this.currentEndpoint.endpoint}/${schema.owner}`]);
    }
  }

  setEndpoint(endpoint: EndpointModel) {
    this.currentEndpoint = endpoint;
    if (this.currentContext.filter !== '') {
      this.router.navigate([`/database/${endpoint.endpoint}`],
        {queryParams: {filter: this.currentContext.filter}});
    } else {
      this.router.navigate([`/database/${endpoint.endpoint}`]);
    }
  }

  /**
   * Set the SQL enabled flag = true if the endpoint connect string
   * is registered in the query engine
   * @param endpoint - current endpoint name
   * @param connectString - current connect string
   */
  setSqlEnabled(endpoint: string, connectString: string){
      this.restService.getConnectString$(endpoint)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(qeConnectString => {
        this.state.saveSqlEnabled((connectString === qeConnectString))
      });
  }

  /**
   * Update the object type selection form on initial load
   * @param endpoints - database endpoint list subscription
   */
  processEndpointListChange(endpoints: EndpointListModel) {
    this.endpoints = endpoints;

    if (this.currentContext && this.currentContext.endpoint && this.endpoints.databases) {
      this.currentEndpoint = this.currentContext.findCurrentEndpoint(this.endpoints);
      this.setSqlEnabled(this.currentEndpoint.endpoint, this.currentEndpoint.connectString);
    }
    if (this.currentContext && this.currentEndpoint && this.currentEndpoint.schemas) {
      this.currentSchema = this.currentContext.findCurrentSchema(this.currentEndpoint);
    }
    if (this.currentContext && this.currentSchema && this.currentSchema.objectTypes) {
      this.currentObjectType = this.currentContext.findCurrentObjectType(this.currentSchema);
    }
    this.setDdlLink();
  }

  /**
   * Update the object type selection form when the current context changes
   * @param context - Current context (db, schema, object type and name) subscription
   */
  processContextChange( subjectContext: ContextBehaviorSubjectModel ) {
    this.currentContext = subjectContext.currentContext;

    if (this.endpoints.databases) {
      this.currentEndpoint = this.currentContext.findCurrentEndpoint(this.endpoints);
      if (this.currentEndpoint) {
        this.setSqlEnabled(this.currentEndpoint.endpoint, this.currentEndpoint.connectString);
      }
    }
    if (this.currentEndpoint && this.currentEndpoint.schemas) {
      this.currentSchema = this.currentContext.findCurrentSchema(this.currentEndpoint);
    }
    if (this.currentSchema && this.currentSchema.objectTypes) {
      this.currentObjectType = this.currentContext.findCurrentObjectType(this.currentSchema);
    }
    this.setDdlLink();
  }

  ngOnInit() {
    this.state.endpoints$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(endpoints => { this.processEndpointListChange(endpoints); });
    this.state.currentContext$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(context => { this.processContextChange(context); });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
