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
import { StateService } from '../../services/state.service';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-db-object-list',
  templateUrl: './db-object-list.component.html',
  styleUrls: ['./db-object-list.component.css']
})
export class DbObjectListComponent implements OnInit, OnDestroy {
  /**
   * Shows result of `select object_name from dba_objects`
   * for current context selections
   */
  public currentContext: CurrentContextModel;
  public objectList: string[];
  private unsubscribe$ = new Subject<void>();

  constructor(
    private state: StateService) { }

  /**
   * Update the object list when the current context changes
   * @param context - current context subscription
   */
  processContextChange(subjectContext: ContextBehaviorSubjectModel) {
    const context = subjectContext.currentContext;
    this.currentContext = context;
    this.objectList = context.objectList;
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
