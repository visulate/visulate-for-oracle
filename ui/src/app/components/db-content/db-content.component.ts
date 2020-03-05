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
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { EndpointListModel } from '../../models/endpoint.model';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { DatabaseObjectModel } from '../../models/database-object.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';


@Component({
  selector: 'app-db-content',
  templateUrl: './db-content.component.html',
  styleUrls: ['./db-content.component.css']
})

/**
 * Content to display in main body
 */
export class DbContentComponent implements OnInit, OnDestroy {
  public endpointList: EndpointListModel;
  public currentContext: CurrentContextModel;
  public objectDetails: DatabaseObjectModel;
  public showLineNumbers = true;
  public schemaColumns: string[] = ['type', 'count'];
  private unsubscribe$ = new Subject<void>();
  public ddlBase = environment.ddlGenBase;

  constructor(
    private restService: RestService,
    private state: StateService) {      

    }

  processObject(objectDetails: DatabaseObjectModel) {
    this.objectDetails = objectDetails;
  }

  /**
   * Respond to state changes in the currentContext$ observable
   * @param subjectContext - the Current behavior subject context
   * The context state changes when the user selects items in the db-selection component.
   */
  processContextChange(subjectContext: ContextBehaviorSubjectModel) {
    let context = subjectContext.currentContext;    
    this.currentContext = context;   

    // Call the Endpoints API on startup and when the object filter changes
    if (subjectContext.priorContext.endpoint === '' || 
        subjectContext.changeSummary.filterDiff ||
        subjectContext.currentContext.endpoint === '') {
          this.restService.getEndpoints$(context.filter)
            .pipe(takeUntil(this.unsubscribe$))
            .subscribe(endpoints => { this.state.saveEndpoints(endpoints); });
    }

    // Call the database summary API when the user selects an endpoint
    if (context.endpoint  && (! context.objectName)
        && subjectContext.changeSummary.endpointDiff) {
      this.restService.getDatabaseProperties$(context.endpoint)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => {this.processObject(result);});
    }

    // Call the schema summary API when the user selects a new schema or the object filter changes
    if (context.owner && (! context.objectName)
        && (subjectContext.changeSummary.ownerDiff || subjectContext.changeSummary.filterDiff) ) {
      this.restService.getSchemaProperties$(context.endpoint, context.owner, context.filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => {this.processObject(result);});
    }

    // Call the object list API when the object type selection changes or a new filter is applied.
    if (context.endpoint && context.owner && context.objectType 
         && (subjectContext.changeSummary.objectTypeDiff || subjectContext.changeSummary.filterDiff)) {
      const filter = (context.filter)? context.filter: '*';
      this.restService.getObjectList$(context.endpoint, context.owner, context.objectType, filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { 
          context.objectList = result; 
          this.state.setCurrentContext(context);        
        });
    }

    // Call the database object API on on object selection
    if (context.endpoint && context.owner && context.objectType && context.objectName 
        && (subjectContext.changeSummary.objectNameDiff ||
          subjectContext.changeSummary.objectTypeDiff && !subjectContext.changeSummary.objectNameDiff )) {
      this.restService.getObjectDetails$
      (context.endpoint, context.owner, context.objectType, context.objectName)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.processObject(result); });
    } 
    
  }

  ngOnInit() {    
    this.currentContext = this.state.getCurrentContext();
    this.state.endpoints$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(endpoints => { this.endpointList = endpoints; } );
    this.state.currentContext$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe( context => { this.processContextChange(context); } );
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
