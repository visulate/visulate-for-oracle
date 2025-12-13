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
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { MediaMatcher } from '@angular/cdk/layout';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { StateService } from '../../services/state.service';
import { CurrentContextModel } from 'src/app/models/current-context.model';


@Component({
  selector: 'app-main-nav',
  templateUrl: './main-nav.component.html',
  styleUrls: ['./main-nav.component.css'],
  standalone: false
})
/**
 * Navigation component
 * The app-routing module routes all requests to this component. It parses the route's path and query
 * parameters to extract the database, schema, object type, object name and filter then sets the
 * current context observable.
 * @remarks
 * Generated with
 * `ng generate @angular/material:materialNav --name main-nav`
 * Follows Responsive sidenav example from https://material.angular.io/components/sidenav/examples
 */
export class MainNavComponent implements OnInit, OnDestroy {

  mobileQuery: MediaQueryList;
  opened: String = null;

  constructor(
    media: MediaMatcher,
    private route: ActivatedRoute,
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
      this.route.queryParamMap
    ]).pipe(takeUntil(this.unsubscribe$))
      .subscribe(([params, queryParams]) => {
        const context = this.state.getCurrentContext();
        const priorContext = new CurrentContextModel
          (context.endpoint, context.owner, context.objectType,
            context.objectName, context.filter, context.showInternal, context.objectList);

        const db = params.get('db');
        const schema = params.get('schema');
        const type = params.get('type');
        const object = params.get('object');
        const filter = queryParams.get('filter');

        context.setEndpoint(db);
        if (schema != null) { context.setOwner(schema.toUpperCase()); }
        if (type != null) { context.setObjectType(type.toUpperCase()); }
        if (object != null) {
          context.setObjectName(object.toUpperCase());
          this.opened = this.mobileQuery.matches ? null : 'opened';
        }
        if (filter != null) { context.setFilter(filter); }

        // Preserve the current object list if context has not changed
        // (e.g when navigating from one object to the next)
        const changeSummary = this.state.getContextDiff(context, priorContext);
        if ((!changeSummary.objectTypeDiff) && (!changeSummary.filterDiff)) { context.setObjectList(priorContext.objectList); }

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

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      this.isDarkMode = true;
      document.body.classList.add('dark-theme');
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
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
