// Application State Service
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { EndpointModel } from '../models/endpoint.model';
import { SchemaModel } from '../models/schema.model';
import { CurrentContextModel } from '../models/current-context.model';

@Injectable({
  providedIn: 'root'
})
export class StateService {
  private endpointList = new BehaviorSubject<EndpointModel[]>([]);
  private selectedEndpoint = new BehaviorSubject<EndpointModel>({});
  private selectedSchema = new BehaviorSubject<SchemaModel>({});
  private selectedContext = new BehaviorSubject<CurrentContextModel>({});

  private context = new CurrentContextModel();

  endpoints = this.endpointList.asObservable();
  currentEndpoint = this.selectedEndpoint.asObservable();
  currentSchema = this.selectedSchema.asObservable();
  currentContext = this.selectedContext.asObservable();

  constructor() { }

  setCurrentObjectType(objectType: String) {
    this.context.setObjectType(objectType);
    this.selectedContext.next(this.context);
  }

  setCurrentSchema(schema: SchemaModel) {
    this.selectedSchema.next(schema);
    this.context.setOwner(schema.owner);
    this.selectedContext.next(this.context);
  }

  setCurrentEndpoint(endpoint: EndpointModel) {
    this.selectedEndpoint.next(endpoint);
    this.context.setEndpoint(endpoint.endpoint);
    this.selectedContext.next(this.context);
  }

  saveEndpoints(endpoints: EndpointModel[]) {
    this.endpointList.next(endpoints);
    this.setCurrentEndpoint(endpoints[0]);
  }
}
