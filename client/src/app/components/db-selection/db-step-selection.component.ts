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

import { Component} from '@angular/core';
import { DbSelectionComponent } from './db-selection.component';

@Component({
  selector: 'app-db-step-selection',
  templateUrl: './db-step-selection.component.html',
  styleUrls: ['./db-selection.component.css']
})
 /**
 * Code to display the object selection menu in the content region when 
 * no object selected.
 */
export class DbStepSelectionComponent extends DbSelectionComponent { }

