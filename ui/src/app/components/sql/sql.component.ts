import { Component, OnInit } from '@angular/core';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { StateService } from '../../services/state.service';
import { RestService } from '../../services/rest.service';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SqlModel } from '../../models/sql.model'


@Component({
  selector: 'app-sql',
  templateUrl: './sql.component.html',
  styleUrls: ['./sql.component.css']
})
export class SqlComponent implements OnInit {

  public currentContext: CurrentContextModel;
  public queryBase: string = environment.queryBase
  public queryUrl: string;
  public password: string;
  public basicAuthCredentials: string;
  public sqlStatement: string;
  public bindVariables: string = '[ ]';
  private unsubscribe$ = new Subject<void>();
  public resultSet: SqlModel;
  public errorMessage: string;


  constructor(
    private state: StateService,
    private restService: RestService) { }


  processContextChange(subjectContext: ContextBehaviorSubjectModel) {
      let context = subjectContext.currentContext;
      this.currentContext = context;

      if (this.currentContext.objectName &&
        (this.currentContext.objectType === 'TABLE' ||
         this.currentContext.objectType === 'VIEW'||
         this.currentContext.objectType === 'MATERIALIZED VIEW')) {
           this.sqlStatement = `select * from ${this.currentContext.objectName} where rownum < :maxrows`;
           this.bindVariables = '{"maxrows": 10 }'
           this.resultSet = new SqlModel();
         }

    }

  public processPassword(password: string){
    this.password = password;
    this.basicAuthCredentials = btoa(`${this.currentContext.owner}:${password}`);
  }


  public executeSql(){
    this.resultSet = new SqlModel();
    this.errorMessage = '';
    const bindVars = this.bindVariables? JSON.parse(this.bindVariables): JSON.parse('[]');
    this.restService.sql2csv$(this.queryUrl, this.basicAuthCredentials, this.sqlStatement, bindVars)
     .pipe(takeUntil(this.unsubscribe$))
     .subscribe(result => {  this.showResult(result); },
                error => { console.log(error); this.showError(error);}
     );
  }

  public showResult(result: any){
    this.resultSet = result
  }

  public showError(error: any) {
    this.errorMessage = error.error.error;
  }

  ngOnInit(): void {
    this.currentContext = this.state.getCurrentContext();
    this.queryUrl = `${this.queryBase}/${this.currentContext.endpoint}`

    this.state.currentContext$
    .pipe(takeUntil(this.unsubscribe$))
    .subscribe(context => { this.processContextChange(context); });

  }


  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

}
