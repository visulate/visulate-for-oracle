/* !
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

import { Deserializable } from './deserializable.model';

export class DatabaseObjectModel implements Deserializable {
  public objectProperties: ObjectPropertyModel[];
  deserialize(input: any): this {
    // Handle both array response (from object details API) and object response (from other APIs)
    const propertiesArray = Array.isArray(input) ? input : (input.endpoints || []);
    this.objectProperties = propertiesArray.map(
      property => new ObjectPropertyModel().deserialize(property)
    );
    return this;
  }
}

export class ObjectPropertyModel implements Deserializable {
  public title: string;
  public description: string;
  public display: string[];
  public link: string;
  public rows: any[];

  deserialize(input: any): this {
    Object.assign(this, input);
    return this;
  }
}
