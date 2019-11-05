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
import { FormsModule } from '@angular/forms';
import { LayoutModule } from '@angular/cdk/layout';
import { CdkTableModule } from '@angular/cdk/table';
import { CdkAccordionModule } from '@angular/cdk/accordion';

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
import { HighlightModule} from 'ngx-highlightjs';


import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DbSelectionComponent } from './components/db-selection/db-selection.component';
import { DbStepSelectionComponent } from './components/db-selection/db-step-selection.component';

import { MainNavComponent } from './components/main-nav/main-nav.component';
import { DbObjectListComponent } from './components/db-object-list/db-object-list.component';
import { DbContentComponent } from './components/db-content/db-content.component';

import pgsql from 'highlight.js/lib/languages/pgsql';
import sql from 'highlight.js/lib/languages/sql';

export function hljsLanguages() {
  return [
    {name: 'sql', func: sql},
    {name: 'pgsql', func: pgsql}
  ];
}

@NgModule({
  declarations: [
    AppComponent,
    DbSelectionComponent,
    DbStepSelectionComponent,
    MainNavComponent,
    DbObjectListComponent,
    DbContentComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    CdkTableModule,
    CdkAccordionModule,   
    HttpClientModule,
    FormsModule,   
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
   
    HighlightModule.forRoot({
      languages: hljsLanguages
    })
    ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
