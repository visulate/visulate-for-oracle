/* !
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
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { StateService } from '../../services/state.service';
import { CurrentContextModel } from 'src/app/models/current-context.model';


@Component({
  selector: 'app-main-nav',
  templateUrl: './main-nav.component.html',
  styleUrls: ['./main-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class MainNavComponent implements OnInit, OnDestroy {

  mobileQuery: MediaQueryList;
  opened: String = null;
  public activeTab: 'database' | 'application' = 'database';
  public currentContext: CurrentContextModel;
  private lastDatabaseUrl: string = '';
  private lastWorkbenchQueryParams: any = { db: 'pdb21' };

  constructor(
    media: MediaMatcher,
    private route: ActivatedRoute,
    private router: Router,
    private state: StateService) {
    this.mobileQuery = media.matchMedia('(max-width: 600px)');
  }

  private unsubscribe$ = new Subject<void>();
  public showObjectListInBody: boolean;
  public displaySearchForm = false;


  /**
   * Extract parameter values from the router and pass them to the current context observable
   */
  setContext(): void {
    combineLatest([
      this.route.paramMap,
      this.route.queryParamMap,
      this.state.endpoints$.pipe(filter(e => e.databases.length > 0 || !!e.errorMessage))
    ]).pipe(takeUntil(this.unsubscribe$))
      .subscribe(([params, queryParams, endpoints]) => {
        const context = this.state.getCurrentContext();
        const priorContext = new CurrentContextModel
          (context.endpoint, context.owner, context.objectType,
            context.objectName, context.filter, context.showInternal, context.objectList);

        const db = params.get('db') || queryParams.get('db');
        const schema = params.get('schema');
        const type = params.get('type');
        const object = params.get('object');
        const filterParam = queryParams.get('filter');

        const endpoint = endpoints.databases.find(d => d.endpoint === db);
        const dbType = endpoint ? endpoint.dbType : 'oracle';
        const useUpper = dbType === 'oracle';

        if (this.router.url === '/database' || this.router.url === '/') {
          context.setEndpoint('');
          context.setOwner('');
          context.setObjectType('');
          context.setObjectName('');
        } else if (this.router.url.includes('/database') || params.get('db')) {
          if (db) { context.setEndpoint(db); } else { context.setEndpoint(''); }
          context.setOwner(schema != null ? (useUpper ? schema.toUpperCase() : schema) : '');
          context.setObjectType(type != null ? type.toUpperCase() : '');
          context.setObjectName(object != null ? (useUpper ? object.toUpperCase() : object) : '');
          if (object != null) {
            this.opened = this.mobileQuery.matches ? null : 'opened';
          }
        }

        if (filterParam != null) { context.setFilter(filterParam); }

        // Preserve the current object list if context has not changed
        // (e.g when navigating from one object to the next)
        const changeSummary = this.state.getContextDiff(context, priorContext);
        if ((!changeSummary.objectTypeDiff) && (!changeSummary.filterDiff)) {
          context.setObjectList(priorContext.objectList);
        }

        this.state.setCurrentContext(context);
      });
  }

  toggleSearchForm() {
    this.displaySearchForm = !this.displaySearchForm;
  }

  hideSearchForm() {
    this.displaySearchForm = false;
  }

  isDarkMode = false;

  ngOnInit(): void {
    this.setContext();

    const initialUrl = this.router.url;
    if (initialUrl.includes('/workbench')) {
      this.activeTab = 'application';
      const tree = this.router.parseUrl(initialUrl);
      if (tree.queryParams && Object.keys(tree.queryParams).length > 0) {
        this.state.setLastWorkbenchQueryParams(tree.queryParams);
      }
    } else {
      this.activeTab = 'database';
      this.state.setLastDatabaseUrl(initialUrl);
    }

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.unsubscribe$)
    ).subscribe((event) => {
      const url = event.urlAfterRedirects || event.url;
      if (url.includes('/workbench')) {
        this.activeTab = 'application';
        const tree = this.router.parseUrl(url);
        if (tree.queryParams && Object.keys(tree.queryParams).length > 0) {
          this.state.setLastWorkbenchQueryParams(tree.queryParams);
        } else if (this.currentContext?.endpoint) {
          this.state.setLastWorkbenchQueryParams({ db: this.currentContext.endpoint });
        }
      } else if (url.includes('/database')) {
        this.activeTab = 'database';
        this.state.setLastDatabaseUrl(url);
      }
    });

    this.state.currentContext$.pipe(takeUntil(this.unsubscribe$)).subscribe(ctxModel => {
      if (ctxModel && ctxModel.currentContext) {
        this.currentContext = ctxModel.currentContext;
        if (ctxModel.currentContext.endpoint) {
          this.state.setLastWorkbenchQueryParams({ db: ctxModel.currentContext.endpoint });
        }
      }
    });

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      this.isDarkMode = true;
      document.body.classList.add('dark-theme');
    }
    this.state.setDarkMode(this.isDarkMode);
  }

  public resetDatabaseSelection(): void {
    this.state.deselectDatabase();
    this.activeTab = 'database';
    this.router.navigateByUrl('/database');
  }

  public selectTab(tab: 'database' | 'application'): void {
    this.activeTab = tab;
    if (tab === 'database') {
      const targetUrl = this.getDatabaseRoute();
      this.router.navigateByUrl(targetUrl);
    } else if (tab === 'application') {
      const queryParams = this.getWorkbenchQueryParams();
      this.router.navigate(['/workbench'], { queryParams });
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
    this.state.setDarkMode(this.isDarkMode);
  }

  public getDatabaseRoute(): string {
    const savedUrl = this.state.getLastDatabaseUrl();
    if (savedUrl && savedUrl.startsWith('/database') && savedUrl !== '/database') {
      return savedUrl;
    }
    if (!this.currentContext || !this.currentContext.endpoint) {
      return '/database';
    }
    const c = this.currentContext;
    if (c.endpoint && c.owner && c.objectType && c.objectName) {
      return `/database/${c.endpoint}/${c.owner}/${c.objectType}/${c.objectName}`;
    }
    if (c.endpoint && c.owner && c.objectType) {
      return `/database/${c.endpoint}/${c.owner}/${c.objectType}`;
    }
    if (c.endpoint && c.owner) {
      return `/database/${c.endpoint}/${c.owner}`;
    }
    return `/database/${c.endpoint}`;
  }

  public getWorkbenchQueryParams(): any {
    return this.state.getLastWorkbenchQueryParams();
  }

  expandAll() {
    this.state.setAccordionsState(true);
  }

  collapseAll() {
    this.state.setAccordionsState(false);
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
