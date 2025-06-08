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

import { Component, OnInit, OnDestroy } from '@angular/core';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { EndpointListModel, EndpointModel } from '../../models/endpoint.model';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { DatabaseObjectModel } from '../../models/database-object.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { hbsTemplates } from '../../../environments/hbs-templates';


@Component({
    selector: 'app-db-content',
    templateUrl: './db-content.component.html',
    styleUrls: ['./db-content.component.css'],
    standalone: false
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
  public ddlBase = environment.ddlGenBase;
  public ddlLink: string;
  public downloadOptions = [];
  public connectString: string;
  public currentEndpoint: EndpointModel;
  public sqlEnabled: boolean;
  public queryPanelExpanded = false;
  public aiEnabled: boolean;
  public errorMessage: string;

  selectedOption = ''; // To store the selected option
  private unsubscribe$ = new Subject<void>();

  constructor(
    private restService: RestService,
    private state: StateService) {
  }



  download() {
    if (this.selectedOption) {
      window.open(this.selectedOption, '_blank');
    }
  }

  processObject(objectDetails: DatabaseObjectModel) {
    this.objectDetails = objectDetails;
  }


  setDdlLink(endpoint: string, owner: string, type: string, name: string) {
    if (environment.internalSchemas.includes(owner)) {
      this.ddlLink = '';
    } else {
      this.ddlLink = `${environment.ddlGenBase}/${endpoint}/${owner}/${type}/${name}/*`;

      if (hbsTemplates.has(type)) {
        this.downloadOptions = [];
        hbsTemplates.get(type).forEach(template => {
          this.downloadOptions.push({
            name: template.title,
            url: `${environment.apiBase}/${endpoint}/${owner}/${type}/${name}?template=${template.template}`
          });
        });
      } else {
        this.downloadOptions = [];
      }
    }
  }

  /**
   * Respond to state changes in the currentContext$ observable
   * @param subjectContext - the Current behavior subject context
   * The context state changes when the user selects items in the db-selection component.
   */
  processContextChange(subjectContext: ContextBehaviorSubjectModel) {
    const context = subjectContext.currentContext;
    this.currentContext = context;
    this.sqlEnabled = this.state.getSqlEnabled();

    // Call the Endpoints API on startup and when the object filter changes
    if (subjectContext.priorContext.endpoint === '' ||
      subjectContext.changeSummary.filterDiff ||
      subjectContext.currentContext.endpoint === '') {
      this.restService.getEndpoints$(context.filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(endpoints => {
          if (endpoints.databases.length > 0){
            endpoints.setErrorMessage(null);
            this.state.saveEndpoints(endpoints);
          } else {
            endpoints.setErrorMessage('No database objects match the current Object Filter');
            this.state.saveEndpoints(endpoints);
          }

        });
    }

    // Call the database summary API when the user selects an endpoint
    if (context.endpoint && (!context.objectName)
      && subjectContext.changeSummary.endpointDiff) {
      this.restService.getDatabaseProperties$(context.endpoint)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.processObject(result); });
    }

    // Call the schema summary API when the user selects a new schema or the object filter changes
    if (context.owner && (!context.objectName)
      && (subjectContext.changeSummary.ownerDiff || subjectContext.changeSummary.filterDiff)) {
      this.restService.getSchemaProperties$(context.endpoint, context.owner, context.filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.processObject(result); });
    }

    // Call the object list API when the object type selection changes or a new filter is applied.
    if ((context.endpoint && context.owner && context.objectType)
      && (subjectContext.changeSummary.objectTypeDiff || subjectContext.changeSummary.filterDiff)) {
      const filter = (context.filter) ? context.filter : '*';
      this.restService.getObjectList$(context.endpoint, context.owner, context.objectType, filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => {
          context.objectList = result;
          this.state.setCurrentContext(context);
        });
    }

    // Call the database object API on object selection
    //
    if ((context.endpoint && context.owner && context.objectType && context.objectName)
      && (subjectContext.changeSummary.objectNameDiff ||
        subjectContext.changeSummary.objectTypeDiff && !subjectContext.changeSummary.objectNameDiff)) {

      this.setDdlLink(context.endpoint, context.owner, context.objectType, context.objectName);
      // Un-comment the following lines to expand the query panel when a table, view or materialized view is selected
      // if ( context.objectType === 'TABLE' ||
      //      context.objectType === 'VIEW' ||
      //      context.objectType === 'MATERIALIZED VIEW') {
      //   this.queryPanelExpanded = true;
      //}

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
        .subscribe(endpoints => { this.endpointList = endpoints; });
      this.state.currentContext$
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(context => { this.processContextChange(context); });
      this.state.sqlEnabled$
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(sqlEnabled => {this.sqlEnabled = sqlEnabled; });
      this.state.aiEnabled$
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(aiEnabled => { this.aiEnabled = aiEnabled; });

      this.checkAiEnabled();
    }

    ngOnDestroy() {
      this.unsubscribe$.next();
      this.unsubscribe$.complete();
    }

    private checkAiEnabled(): void {
      this.restService.getAiEnabled$().pipe(takeUntil(this.unsubscribe$)).subscribe(
        (data: { enabled: boolean }) => {
          this.state.saveAiEnabled(data.enabled);
        },
        error => {
          this.errorMessage = error.message;
        }
      );
    }

  }
