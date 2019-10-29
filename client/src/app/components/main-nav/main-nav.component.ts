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

import { Component } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable, Subject } from 'rxjs';
import { map, shareReplay, takeUntil } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { StateService } from '../../services/state.service';
import { CurrentContextModel } from '../../models/current-context.model';

@Component({
  selector: 'app-main-nav',
  templateUrl: './main-nav.component.html',
  styleUrls: ['./main-nav.component.css']
})
/**
 * Navigation component
 * @remarks
 * Generated with
 * `ng generate @angular/material:materialNav --name main-nav`
 */
export class MainNavComponent {
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );

  constructor(
    private breakpointObserver: BreakpointObserver,
    private route: ActivatedRoute,
    private state: StateService
  ) { }

  private unsubscribe$ = new Subject<void>();


  /**
   * Extract parameter values from the router and pass them to the current context observable
   */
  setContext(): void {
    let context = new CurrentContextModel('', '', '', '');

    this.route.paramMap
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(params => {
        const db = params.get('db');
        const schema = params.get('schema');
        const type = params.get('type');
        const object = params.get('object');

        if (db != null) { context.setEndpoint(db); }
        if (schema != null) { context.setOwner(schema.toUpperCase()); }
        if (type != null) { context.setObjectType(type.toUpperCase()); }
        if (object != null) { context.setObjectName(object.toUpperCase()); }

        this.state.setCurrentContext(context);
      });

  }

  ngOnInit(): void {
    this.setContext();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

}
