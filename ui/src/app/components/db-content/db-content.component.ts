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

import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChildren, QueryList, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MediaMatcher } from '@angular/cdk/layout';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { EndpointListModel, EndpointModel } from '../../models/endpoint.model';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { DatabaseObjectModel } from '../../models/database-object.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { hbsTemplates } from '../../../environments/hbs-templates';
import { MatExpansionPanel } from '@angular/material/expansion';


@Component({
  selector: 'app-db-content',
  templateUrl: './db-content.component.html',
  styleUrls: ['./db-content.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})

/**
 * Content to display in main body
 */
export class DbContentComponent implements OnInit, OnDestroy {
  @ViewChildren(MatExpansionPanel) panels: QueryList<MatExpansionPanel>;
  public endpointList: EndpointListModel;
  public currentContext: CurrentContextModel;
  public objectDetails: DatabaseObjectModel;
  public showLineNumbers = true;
  public schemaColumns: string[] = ['type', 'count'];
  public ddlBase = environment.ddlGenBase;
  public enableGitIntegration = environment.enableGitIntegration;
  public ddlLink: string;
  public downloadOptions = [];
  public connectString: string;
  public currentEndpoint: EndpointModel;
  public sqlEnabled: boolean;
  public queryPanelExpanded = false;
  public aiEnabled: boolean;
  public errorMessage: string;
  public isChatFullScreen$ = this.state.isChatFullScreen$;
  public copiedKey: string = '';
  private copiedTimeout: any;

  public copyToClipboard(text: string, key: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.onCopySuccess(key);
      }).catch(() => {
        if (this.fallbackCopy(text)) {
          this.onCopySuccess(key);
        }
      });
    } else {
      if (this.fallbackCopy(text)) {
        this.onCopySuccess(key);
      }
    }
  }

  private fallbackCopy(text: string): boolean {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (_) {
      return false;
    }
  }

  private onCopySuccess(key: string): void {
    this.copiedKey = key;
    clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.copiedKey = '';
    }, 2000);
  }

  get aiPanelExpanded(): boolean {
    return this.state.getAiPanelExpanded();
  }
  set aiPanelExpanded(value: boolean) {
    this.state.setAiPanelExpanded(value);
  }
  mobileQuery: MediaQueryList;
  private _mobileQueryListener: () => void;

  selectedOption = ''; // To store the selected option
  private unsubscribe$ = new Subject<void>();

  constructor(
    private restService: RestService,
    private state: StateService,
    public router: Router,
    media: MediaMatcher,
    changeDetectorRef: ChangeDetectorRef) {
    this.mobileQuery = media.matchMedia('(max-width: 600px)');
    this._mobileQueryListener = () => changeDetectorRef.detectChanges();
    this.mobileQuery.addEventListener('change', this._mobileQueryListener);
  }



  download() {
    if (this.selectedOption) {
      window.open(this.selectedOption, '_blank');
    }
  }

  processObject(objectDetails: DatabaseObjectModel) {
    if (objectDetails && objectDetails.objectProperties) {
      let firstFound = false;
      for (const prop of objectDetails.objectProperties) {
        if (!firstFound && prop.rows && prop.rows.length > 0) {
          prop.expanded = true;
          firstFound = true;
        } else {
          prop.expanded = false;
        }
      }
    }
    this.objectDetails = objectDetails;
  }

  toggleChatFullScreen(event: Event) {
    event.stopPropagation();
    this.aiPanelExpanded = true;
    this.state.toggleChatFullScreen();
  }


  setDdlLink(endpoint: string, owner: string, type: string, name: string) {
    const dbType = this.endpointList?.databases.find(d => d.endpoint === endpoint)?.dbType || 'oracle';
    const internalList = environment.internalSchemas[dbType] || [];
    if (internalList.includes(owner) || dbType === 'postgres') {
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
    this.updateAssociatedRepo();


    // Call the Endpoints API on startup and when the object filter changes
    const endpointsNotLoaded = !this.endpointList ||
      (!this.endpointList.databases?.length && !this.endpointList.errorMessage);

    if (endpointsNotLoaded || subjectContext.changeSummary.filterDiff) {
      this.restService.getEndpoints$(context.filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(endpoints => {
          if (endpoints.databases.length > 0) {
            endpoints.setErrorMessage(null);
            this.state.saveEndpoints(endpoints);
          } else {
            endpoints.setErrorMessage('No database objects match the current Object Filter');
            this.state.saveEndpoints(endpoints);
          }

        }, error => {
          const endpoints = new EndpointListModel();
          endpoints.setErrorMessage('Failed to connect to API server: ' + error.message);
          this.state.saveEndpoints(endpoints);
        });
    }

    // Call the database summary API when the user selects an endpoint
    if (context.endpoint && (!context.owner) && (!context.objectName)
      && (subjectContext.changeSummary.endpointDiff || subjectContext.changeSummary.ownerDiff)) {
      this.objectDetails = undefined as any;
      this.restService.getDatabaseProperties$(context.endpoint)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.processObject(result); });
    }

    // Call the schema summary API when the user selects a new schema or the object filter changes
    if (context.owner && (!context.objectName)
      && (subjectContext.changeSummary.ownerDiff || 
          subjectContext.changeSummary.filterDiff ||
          subjectContext.changeSummary.objectNameDiff)) {
      this.objectDetails = undefined as any;
      this.restService.getSchemaProperties$(context.endpoint, context.owner, context.filter)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.processObject(result); });
    }

    // Call the object list API when the object type selection changes or a new filter is applied.
    if ((context.endpoint && context.owner && context.objectType)
      && (subjectContext.changeSummary.objectTypeDiff || 
          subjectContext.changeSummary.filterDiff ||
          subjectContext.changeSummary.objectNameDiff)) {
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

      this.objectDetails = undefined as any;
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

      this.loadRelatedCodeFiles(context.endpoint, context.objectName);
    }

    if (!context.endpoint) {
      this.objectDetails = undefined as any;
      this.ddlLink = '';
      this.relatedCodeFiles = [];
      this.associatedRepo = '';
    } else if (!context.objectName) {
      this.ddlLink = '';
      this.relatedCodeFiles = [];
      this.associatedRepo = this.getLinkedRepo(context.endpoint);
    } else if (!this.associatedRepo) {
      this.associatedRepo = this.getLinkedRepo(context.endpoint);
    }
  }

  public relatedCodeFiles: string[] = [];
  public relatedRepositories: Array<{ repoFolder: string; owner?: string; type?: string; files: string[] }> = [];
  public associatedRepo: string = '';
  public associatedRepos: Array<{ db: string; repo: string; role: string }> = [];

  public getLinkedRepo(endpoint?: string): string {
    if (!endpoint) {
      return '';
    }
    return this.state.getAssociatedRepo(endpoint);
  }

  public getLinkedRepos(endpoint?: string): Array<{ db: string; repo: string; role: string }> {
    if (!endpoint) {
      return [];
    }
    return this.state.getReposForDb(endpoint);
  }

  public loadRelatedCodeFiles(endpoint: string, objectName: string): void {
    if (!this.enableGitIntegration || !endpoint || !objectName) return;

    this.associatedRepos = this.getLinkedRepos(endpoint);
    const primaryLinkedRepo = this.associatedRepos.length > 0 ? this.associatedRepos[0].repo : '';

    // Query across ALL indexed repositories in visulate-memory so cross-codebase impacts are visible
    this.restService.getObjectCodeDependencies$(endpoint, objectName).subscribe({
      next: (res) => {
        if (res && res.found && Array.isArray(res.files)) {
          this.relatedCodeFiles = res.files;
          this.relatedRepositories = Array.isArray(res.repositories) && res.repositories.length > 0
            ? res.repositories
            : [{ repoFolder: res.repoFolder || primaryLinkedRepo || '', files: res.files }];
          this.associatedRepo = res.repoFolder || primaryLinkedRepo || '';
        } else {
          this.relatedCodeFiles = [];
          this.relatedRepositories = [];
          this.associatedRepo = primaryLinkedRepo || '';
        }
      },
      error: () => {
        this.relatedCodeFiles = [];
        this.relatedRepositories = [];
        this.associatedRepo = primaryLinkedRepo || '';
      }
    });
  }

  public openInWorkbench(filePath: string, repoFolder?: string): void {
    if (!this.currentContext) return;
    const targetRepo = repoFolder || this.associatedRepo;
    const queryParams: any = {
      db: this.currentContext.endpoint,
      file: filePath
    };
    if (targetRepo) {
      queryParams.projectId = targetRepo;
    }
    this.state.setLastSelectedFile(filePath, targetRepo || undefined);
    this.state.setLastWorkbenchQueryParams(queryParams);
    this.router.navigate(['/workbench'], {
      queryParams
    });
  }

  public openRepoInWorkbench(event?: Event, repoFolder?: string): void {
    if (event) {
      event.stopPropagation();
    }
    const targetRepo = repoFolder || this.associatedRepo;
    if (!targetRepo) return;
    const queryParams: any = {
      projectId: targetRepo
    };
    if (this.currentContext?.endpoint) {
      queryParams.db = this.currentContext.endpoint;
    }
    this.state.setLastWorkbenchQueryParams(queryParams);
    this.router.navigate(['/workbench'], {
      queryParams
    });
  }

  public updateAssociatedRepo(): void {
    if (!this.currentContext?.endpoint) {
      this.associatedRepo = '';
      this.associatedRepos = [];
    } else {
      this.associatedRepos = this.state.getReposForDb(this.currentContext.endpoint);
      this.associatedRepo = this.associatedRepos.length > 0 ? this.associatedRepos[0].repo : '';
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
      .subscribe(sqlEnabled => { this.sqlEnabled = sqlEnabled; });
    this.state.aiEnabled$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(aiEnabled => { this.aiEnabled = aiEnabled; });
    this.updateAssociatedRepo();
    this.state.repoAssociation$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => {
        this.updateAssociatedRepo();
      });


    this.state.toggleAccordions$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(expanded => {
        this.aiPanelExpanded = expanded;
        if (this.objectDetails && this.objectDetails.objectProperties) {
          this.objectDetails.objectProperties.forEach(prop => prop.expanded = expanded);
        }
        if (this.panels) {
          this.panels.forEach(panel => {
            if (expanded) {
              panel.open();
            } else {
              panel.close();
            }
          });
        }
      });

    this.checkAiEnabled();
  }

  ngOnDestroy() {
    clearTimeout(this.copiedTimeout);
    this.mobileQuery.removeEventListener('change', this._mobileQueryListener);
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

  public isNewRoute(): boolean {
    return this.router.url.includes('/database/new');
  }

}
