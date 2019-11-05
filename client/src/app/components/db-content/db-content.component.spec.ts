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

import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { MatTableModule, MatExpansionModule} from '@angular/material'
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatListModule} from '@angular/material/list'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; 

import { HttpClientTestingModule  } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { DbContentComponent } from './db-content.component';
import { DbSelectionComponent } from '../db-selection/db-selection.component';
import { DbStepSelectionComponent } from '../db-selection/db-step-selection.component';
import { DbObjectListComponent} from '../db-object-list/db-object-list.component';

describe('DbContentComponent', () => {
  let component: DbContentComponent;
  let fixture: ComponentFixture<DbContentComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [ MatTableModule, 
                 HttpClientTestingModule, 
                 BrowserAnimationsModule,               
                 MatExpansionModule,
                 MatSlideToggleModule,
                 FormsModule,
                 MatCardModule,
                 MatListModule,
                 MatSelectModule,
                 RouterTestingModule],
      declarations: [ DbContentComponent, DbSelectionComponent, DbStepSelectionComponent, DbObjectListComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DbContentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
