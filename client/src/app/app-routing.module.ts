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

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MainNavComponent } from './components/main-nav/main-nav.component';

const routes: Routes = [
  { path: 'database', component: MainNavComponent },
  { path: 'database/:db', component: MainNavComponent },
  { path: 'database/:db/:schema', component: MainNavComponent },
  { path: 'database/:db/:schema/:type', component: MainNavComponent },
  { path: 'database/:db/:schema/:type/:object', component: MainNavComponent },
  { path: '', redirectTo: '/database', pathMatch: 'full'},
];

@NgModule({
  imports: [ 
    RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' }) 
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
