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
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule,  ReactiveFormsModule} from '@angular/forms';
import { LayoutModule } from '@angular/cdk/layout';
import { CdkTableModule } from '@angular/cdk/table';

import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {MatGridListModule} from '@angular/material/grid-list';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DbSelectionComponent } from './components/db-selection/db-selection.component';
import { DbStepSelectionComponent } from './components/db-selection/db-step-selection.component';
import { MainNavComponent } from './components/main-nav/main-nav.component';
import { DbObjectListComponent } from './components/db-object-list/db-object-list.component';
import { DbContentComponent } from './components/db-content/db-content.component';
import { FindObjectComponent } from './components/find-object/find-object.component';
import { HideInternalPipe } from './models/hide-internal.pipe';

import { HighlightModule, HIGHLIGHT_OPTIONS } from 'ngx-highlightjs';
import { FilterObjectsComponent } from './components/filter-objects/filter-objects.component';
import { SqlComponent } from './components/sql/sql.component';
import { SqlValidatorDirective } from './components/sql/sql.directive';

@NgModule({
  declarations: [
    AppComponent,
    DbSelectionComponent,
    DbStepSelectionComponent,
    MainNavComponent,
    DbObjectListComponent,
    DbContentComponent,
    FindObjectComponent,
    FilterObjectsComponent,
    HideInternalPipe,
    SqlComponent,
    SqlValidatorDirective
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    CdkTableModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatToolbarModule,
    MatSelectModule,
    MatSidenavModule,
    MatTableModule,
    LayoutModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatGridListModule,
    HighlightModule
    ],
  providers: [
    {
      provide: HIGHLIGHT_OPTIONS,
      useValue: {
        coreLibraryLoader: () => import('highlight.js/lib/core'),
        languages: {
          pgsql: () => import('highlight.js/lib/languages/pgsql'),
          sql: () => import('highlight.js/lib/languages/sql')
        }
      }
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
