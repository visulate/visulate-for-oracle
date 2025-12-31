/* !
 * Copyright 2020 Visulate LLC. All Rights Reserved.
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

import { Component, OnInit, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { StateService } from '../../services/state.service';
import { RestService } from '../../services/rest.service';
import { MatDialog } from '@angular/material/dialog';
import { CredentialDialogComponent } from '../../components/credential-dialog/credential-dialog.component';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SqlModel } from '../../models/sql.model';


@Component({
  selector: 'app-sql',
  templateUrl: './sql.component.html',
  styleUrls: ['./sql.component.css'],
  standalone: false
})
export class SqlComponent implements OnInit, OnDestroy {

  public currentContext: CurrentContextModel;
  public queryBase: string = environment.queryBase;
  public queryUrl: string;
  public password: string;
  public dbCredentials: string;
  public sqlStatement: string;
  public curlSql: string;
  public bindVariables = '[ ]';
  public queryOptions: string;
  private unsubscribe$ = new Subject<void>();
  public resultSet: SqlModel;
  public errorMessage: string;
  public dbUser: string;


  constructor(
    private state: StateService,
    private restService: RestService,
    private dialog: MatDialog
  ) { }

  /**
   * Update query form to reflect the current context
   * @param subjectContext - currentContext$ observable
   */
  processContextChange(subjectContext: ContextBehaviorSubjectModel) {
    const context = subjectContext.currentContext;
    this.currentContext = context;
    this.dbUser = this.currentContext.owner ? this.currentContext.owner : 'VISULATE';

    if (this.currentContext.objectName &&
      (this.currentContext.objectType === 'TABLE' ||
        this.currentContext.objectType === 'VIEW' ||
        this.currentContext.objectType === 'MATERIALIZED VIEW')) {
      this.setSql(`select * from ${this.currentContext.objectName} where rownum < :maxrows`);
      this.bindVariables = '{"maxrows": 10 }';
      this.queryOptions = '{"download_lobs": "N", "csv_header": "N"}';
      this.resultSet = new SqlModel();
    }
    this.loadSavedCredentials();
  }

  setSql(sql) {
    this.sqlStatement = sql;
    // escape $ in sql with \$ in curl request
    this.curlSql = sql.split('$').join('\\$');
  }


  /**
   * Generate basic auth header for request
   * @param password - database password for current user
   */
  public processPassword(password: string) {
    this.password = password;
    this.dbCredentials = btoa(`${this.dbUser}/${password}@${this.currentContext.endpoint}`);
  }

  /**
   * Load credentials from session storage if available
   */
  private loadSavedCredentials() {
    if (!this.currentContext || !this.currentContext.endpoint) return;
    const database = this.currentContext.endpoint;
    const saved = sessionStorage.getItem('visulate-credentials');
    if (saved) {
      try {
        const credentials = JSON.parse(saved);
        const dbCreds = credentials[database];
        if (dbCreds && dbCreds.username && dbCreds.password) {
          this.dbUser = dbCreds.username;
          this.password = dbCreds.password;
          this.dbCredentials = btoa(`${this.dbUser}/${this.password}@${database}`);
          return;
        }
      } catch (e) {
        console.error("Error parsing saved credentials", e);
      }
    }
    // Default/Reset state if no credentials found
    this.dbUser = this.currentContext.owner ? this.currentContext.owner : 'VISULATE';
    this.password = '';
    this.dbCredentials = '';
  }


  /**
   * Call the query engine API
   */
  public executeSql() {
    this.resultSet = new SqlModel();
    this.errorMessage = '';
    try {
      const bindVars = this.bindVariables ? JSON.parse(this.bindVariables) : JSON.parse('[]');
      const options = this.queryOptions ? JSON.parse(this.queryOptions) : JSON.parse('{}');
      this.restService.sql2csv$(this.queryUrl, this.dbCredentials, this.sqlStatement, bindVars, options)
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe(result => { this.showResult(result); },
          error => { this.showError(error); }
        );
    } catch (error) {
      this.errorMessage = error;
    }
  }

  public showResult(result: any) {
    this.resultSet = result;
  }

  public showError(error: any) {
    this.errorMessage = error.error.error;
  }

  ngOnInit(): void {
    this.currentContext = this.state.getCurrentContext();
    this.queryUrl = `${this.queryBase}/${this.currentContext.endpoint}`;

    this.state.currentContext$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(context => { this.processContextChange(context); });

    this.state.credentialsChanged$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => { this.loadSavedCredentials(); });
  }

  public openCredentialsDialog(): void {
    const dialogRef = this.dialog.open(CredentialDialogComponent, {
      width: '400px',
      data: { database: this.currentContext?.endpoint || '' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.token) {
        this.state.setAuthToken(result.database, result.token);
      }
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

}

@Pipe({
  name: 'trim',
  standalone: false
})
export class TrimPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return value;
    return value.replace(/\s+/g, ' ').trim();
  }
}
