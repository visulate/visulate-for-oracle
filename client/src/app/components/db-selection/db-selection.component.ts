// Code to Select: Database -> Schema -> Object Type
import { Component, OnInit } from '@angular/core';
import { StateService } from '../../services/state.service';
import { EndpointModel } from '../../models/endpoint.model';
import { SchemaModel } from '../../models/schema.model';

@Component({
  selector: 'app-db-selection',
  templateUrl: './db-selection.component.html',
  styleUrls: ['./db-selection.component.css']
})
export class DbSelectionComponent implements OnInit {
  public endpoints: EndpointModel[];
  public currentEndpoint: EndpointModel;
  public currentSchema: SchemaModel;

  constructor(private state: StateService) { }

  setObjectType(objectType: String) {
    this.state.setCurrentObjectType(objectType);
  }

  setSchema(schema: SchemaModel) {
    this.state.setCurrentSchema(schema);
  }

  setEndpoint(endpoint: EndpointModel){
    this.state.setCurrentEndpoint(endpoint);
  }

  ngOnInit() {
     this.state.endpoints.subscribe(
       endpoints => { this.endpoints = endpoints; });
     this.state.currentEndpoint.subscribe(
       currentEndpoint => { this.currentEndpoint = currentEndpoint;} );
     this.state.currentSchema.subscribe(
       currentSchema => { this.currentSchema = currentSchema;} );
  }

}
