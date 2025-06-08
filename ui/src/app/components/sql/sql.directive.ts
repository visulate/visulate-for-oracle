/* !
 * Copyright 2020 Visulate LLC. All Rights Reserved.
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

import { Directive } from '@angular/core';
import { Validator, UntypedFormControl, NG_VALIDATORS } from '@angular/forms';
@Directive({
    selector: '[validSql][ngModel]',
    providers: [
        { provide: NG_VALIDATORS, useExisting: SqlValidatorDirective, multi: true }
    ],
    standalone: false
})
export class SqlValidatorDirective implements Validator {
  validate(control: UntypedFormControl): {[key: string]: any} {
    const sql = control.value;
    if (sql && sql.match('.*(\/|;)$'))
    {return {
      invalidCharacter: ';'
    }; }
    else {return null; }
  }
}
