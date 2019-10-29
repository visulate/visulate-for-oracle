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
import { RestService } from '../../services/rest.service';
import { CurrentContextModel } from '../../models/current-context.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-db-object-list',
  templateUrl: './db-object-list.component.html',
  styleUrls: ['./db-object-list.component.css']
})
export class DbObjectListComponent implements OnInit {
  /**
   * Shows result of `select object_name from dba_objects`
   * for current context selections
   */
  public currentContext: CurrentContextModel;
  private currentObjectType: string;
  public objectList: string[];
  private unsubscribe$ = new Subject<void>();

  constructor(
    private restService: RestService,
    private state: StateService) { }

  /**
   * Update the object list when the current context changes
   * @param context - current context subscription
   */
  processContextChange(context: CurrentContextModel) {
    this.currentContext = context;
    if (context.endpoint && context.owner && context.objectType && (this.currentObjectType != context.objectType)) {
      this.restService.getObjectList$(context.endpoint, context.owner, context.objectType)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.objectList = result; });
    }
    this.currentObjectType = context.objectType;
  }

  ngOnInit() {
    this.state.currentContext$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(context => { this.processContextChange(context); });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}