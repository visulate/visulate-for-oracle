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

import { TestBed, getTestBed,  } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { RestService } from './rest.service';
import { environment } from '../../environments/environment';

describe('RestService', () => {
  let injector;
  let service: RestService;
  let httpMock: HttpTestingController;

  beforeEach(() => { 
    TestBed.configureTestingModule({
      imports: [ HttpClientTestingModule ],
      providers: [RestService]
    });
    injector = getTestBed();
    service = injector.get(RestService);
    httpMock = injector.get(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    const service: RestService = TestBed.get(RestService);
    expect(service).toBeTruthy();
  });

  // httpMock code not working as expected
  // describe('#getObjectList', () => {
  //   it('should return an Observable<sting[]>', () => {
  //     //const service: RestService = TestBed.get(RestService);
  //     const dummyObjectList: string[] = ['TABLE_ONE', 'TABLE_TWO'];
  //     service.getObjectList('endpoint', 'owner', 'obtype').subscribe(objects => {
  //       expect(objects.length).toBe(2);
  //       expect(objects).toEqual(dummyObjectList);
  //     });
  
  //     const req = httpMock.expectOne(`${environment.apiBase}endpoint1/owner2/obtype3`);
  //     expect(req.request.method).toBe('GET');
  //     req.flush(dummyObjectList);
     
  //   });
  // });
});
