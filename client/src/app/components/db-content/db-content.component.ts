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

import { Component, OnInit, OnDestroy } from '@angular/core';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { EndpointListModel } from '../../models/endpoint.model';
import { CurrentContextModel } from '../../models/current-context.model';
import { DatabaseObjectModel } from '../../models/database-object.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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

  constructor(
    private restService: RestService,
    private state: StateService) { }

  processObject(objectDetails: DatabaseObjectModel) {
    this.objectDetails = objectDetails;
  }

  processContextChange(context: CurrentContextModel) {
    this.currentContext = context;
    if (context.endpoint && context.owner && context.objectType && context.objectName) {
      this.restService.getObjectDetails$
      (context.endpoint, context.owner, context.objectType, context.objectName)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.processObject(result); });
    } else if (context.endpoint && context.owner && !context.objectType && !context.objectName ) {
      this.restService.getSchemaProperties$(context.endpoint, context.owner)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => {this.processObject(result);});
    } else if (context.endpoint && !context.owner && !context.objectType && !context.objectName) {
      this.restService.getDatabaseProperties$(context.endpoint)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => {this.processObject(result);});
    }
  }

  ngOnInit() {
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
