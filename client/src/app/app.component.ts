import { Component } from '@angular/core';
import { RestService } from './services/rest.service';
import { StateService } from './services/state.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  constructor(
     private restService: RestService,
     private state: StateService
   ) { }

  ngOnInit(): void {
    // call REST API to get list of databases 
     this.restService.getEndpoints()
      .subscribe(endpoints => {
        this.state.saveEndpoints(endpoints)
      });
  }
}
