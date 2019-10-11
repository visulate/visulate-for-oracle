// show result of `select object_name from dba_objects`
import { Component, OnInit } from '@angular/core';
import { StateService } from '../../services/state.service';
import { RestService } from '../../services/rest.service';

@Component({
  selector: 'app-db-object-list',
  templateUrl: './db-object-list.component.html',
  styleUrls: ['./db-object-list.component.css']
})
export class DbObjectListComponent implements OnInit {
  public currentContext: CurrentContextModel;
  public objectList: String[];

  constructor(
    private restService: RestService,
    private state: StateService) { }

  processContextChange( context: CurrentContextModel ) {
    this.currentContext = context;
    if (context.endpoint && context.owner && context.objectType){
      this.restService.getObjectList(context.endpoint, context.owner, context.objectType)
        .subscribe(result => {this.objectList = result;});
    }
  }

  ngOnInit() {
    this.state.currentContext
      .subscribe(context => { this.processContextChange(context); });
  }

}
