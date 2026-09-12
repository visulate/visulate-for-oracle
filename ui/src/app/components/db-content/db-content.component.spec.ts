/* !
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
import { MatTableModule } from '@angular/material/table';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule, ReactiveFormsModule} from '@angular/forms';
import { MatListModule} from '@angular/material/list';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HighlightModule} from 'ngx-highlightjs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule} from '@angular/material/input';

import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { DbContentComponent } from './db-content.component';
import { DbSelectionComponent } from '../db-selection/db-selection.component';
import { DbStepSelectionComponent } from '../db-selection/db-step-selection.component';
import { DbObjectListComponent} from '../db-object-list/db-object-list.component';
import { FilterObjectsComponent } from '../filter-objects/filter-objects.component';
import { RegistrationHelperComponent } from '../registration-helper/registration-helper.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

describe('DbContentComponent', () => {
  let component: DbContentComponent;
  let fixture: ComponentFixture<DbContentComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [DbContentComponent, DbSelectionComponent, DbStepSelectionComponent, DbObjectListComponent, FilterObjectsComponent, RegistrationHelperComponent],
      imports: [MatTableModule,
        BrowserAnimationsModule,
        MatExpansionModule,
        MatSlideToggleModule,
        HighlightModule,
        FormsModule,
        MatCardModule,
        MatListModule,
        MatSelectModule, ReactiveFormsModule,
        MatAutocompleteModule, MatInputModule,
        MatDialogModule,
        MatIconModule,
        RouterTestingModule],
      providers: [provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting()]
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

  it('should have aiPanelExpanded default to false', () => {
    expect(component.aiPanelExpanded).toBe(false);
  });

  it('should expand only the first property with rows on processObject', () => {
    const mockDetails = {
      objectProperties: [
        { title: 'Empty Section', description: 'No rows', display: [], link: '', rows: [] },
        { title: 'Columns', description: 'Table columns', display: ['name'], link: '', rows: [{ name: 'ID' }, { name: 'NAME' }] },
        { title: 'Constraints', description: 'Table constraints', display: ['name'], link: '', rows: [{ name: 'PK_EMP' }] },
        { title: 'Indexes', description: 'Table indexes', display: ['name'], link: '', rows: [{ name: 'IDX_EMP' }] }
      ]
    } as any;

    component.processObject(mockDetails);

    expect(mockDetails.objectProperties[0].expanded).toBe(false);
    expect(mockDetails.objectProperties[1].expanded).toBe(true);
    expect(mockDetails.objectProperties[2].expanded).toBe(false);
    expect(mockDetails.objectProperties[3].expanded).toBe(false);
  });

  it('should preserve aiPanelExpanded state during navigation / subsequent processObject calls', () => {
    expect(component.aiPanelExpanded).toBe(false);

    // User expands Agentic AI tile
    component.aiPanelExpanded = true;
    expect(component.aiPanelExpanded).toBe(true);

    // User navigates to a new page (processObject called with new details)
    const page1Details = {
      objectProperties: [
        { title: 'Columns', description: '', display: [], link: '', rows: [{ a: 1 }] },
        { title: 'Constraints', description: '', display: [], link: '', rows: [{ b: 2 }] }
      ]
    } as any;
    component.processObject(page1Details);

    // Agentic AI remains open during navigation
    expect(component.aiPanelExpanded).toBe(true);
    // Only the first property on the new page is open
    expect(page1Details.objectProperties[0].expanded).toBe(true);
    expect(page1Details.objectProperties[1].expanded).toBe(false);

    // User closes Agentic AI tile
    component.aiPanelExpanded = false;

    // User navigates to another page
    const page2Details = {
      objectProperties: [
        { title: 'Tables', description: '', display: [], link: '', rows: [{ c: 3 }] },
        { title: 'Views', description: '', display: [], link: '', rows: [{ d: 4 }] }
      ]
    } as any;
    component.processObject(page2Details);

    // Agentic AI remains closed
    expect(component.aiPanelExpanded).toBe(false);
    expect(page2Details.objectProperties[0].expanded).toBe(true);
    expect(page2Details.objectProperties[1].expanded).toBe(false);
  });

  it('should clear objectDetails, ddlLink, and relatedCodeFiles when navigating to home page with no endpoint', () => {
    component.objectDetails = {
      objectProperties: [
        { title: 'Columns', description: '', display: [], link: '', rows: [{ a: 1 }] }
      ]
    } as any;
    component.ddlLink = 'http://some-ddl';
    component.relatedCodeFiles = ['file1.sql'];
    component.associatedRepo = 'my-repo';

    const homeContext = {
      currentContext: {
        endpoint: '',
        owner: '',
        objectType: '',
        objectName: '',
        filter: '',
        showInternal: false,
        objectList: []
      },
      changeSummary: {
        endpointDiff: true,
        ownerDiff: true,
        objectTypeDiff: true,
        objectNameDiff: true,
        filterDiff: false,
        showInternalDiff: false
      }
    } as any;

    component.processContextChange(homeContext);

    expect(component.objectDetails).toBeUndefined();
    expect(component.ddlLink).toBe('');
    expect(component.relatedCodeFiles.length).toBe(0);
    expect(component.associatedRepo).toBe('');
  });

  it('should copy text to clipboard and track copiedKey', () => {
    if (navigator.clipboard) {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    }
    spyOn(document, 'execCommand').and.callFake(() => true);
    component.copyToClipboard('psql -h localhost', 'ep1-cli');
    expect(component.copiedKey).toBe('ep1-cli');
  });
});

