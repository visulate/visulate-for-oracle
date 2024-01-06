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

import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';
import { MatLegacyTableModule as MatTableModule } from '@angular/material/legacy-table';
import { MatExpansionModule } from '@angular/material/expansion'
import { MatLegacySlideToggleModule as MatSlideToggleModule } from '@angular/material/legacy-slide-toggle';
import { MatLegacyCardModule as MatCardModule } from '@angular/material/legacy-card';
import { MatLegacySelectModule as MatSelectModule } from '@angular/material/legacy-select';
import { FormsModule, ReactiveFormsModule} from '@angular/forms';
import { MatLegacyListModule as MatListModule} from '@angular/material/legacy-list';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HighlightModule} from 'ngx-highlightjs';
import { MatLegacyAutocompleteModule as MatAutocompleteModule } from '@angular/material/legacy-autocomplete';
import { MatLegacyInputModule as MatInputModule} from '@angular/material/legacy-input';

import { HttpClientTestingModule  } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { DbContentComponent } from './db-content.component';
import { DbSelectionComponent } from '../db-selection/db-selection.component';
import { DbStepSelectionComponent } from '../db-selection/db-step-selection.component';
import { DbObjectListComponent} from '../db-object-list/db-object-list.component';
import { FilterObjectsComponent } from '../filter-objects/filter-objects.component'

describe('DbContentComponent', () => {
  let component: DbContentComponent;
  let fixture: ComponentFixture<DbContentComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ MatTableModule,
                 HttpClientTestingModule,
                 BrowserAnimationsModule,
                 MatExpansionModule,
                 MatSlideToggleModule,
                 HighlightModule,
                 FormsModule,
                 MatCardModule,
                 MatListModule,
                 MatSelectModule, ReactiveFormsModule,
                 MatAutocompleteModule, MatInputModule,
                 RouterTestingModule],
      declarations: [ DbContentComponent, DbSelectionComponent, DbStepSelectionComponent, DbObjectListComponent, FilterObjectsComponent  ]
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
