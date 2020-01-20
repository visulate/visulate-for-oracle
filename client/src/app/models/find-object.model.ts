/*!
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

import { Deserializable } from './deserializable.model';

export class FindObjectModel implements Deserializable {
  public find: string;
  public result: ResultModel[];

  deserialize(input: any): this {
    Object.assign(this, input);
    this.result = input.required.map(
      result => new ResultModel().deserialize(result));
    return this;
  }
}

export class ResultModel implements Deserializable {
  public database: string;
  public objects: ObjectModel[];
  
  deserialize(input: any): this {
    Object.assign(this, input);
    this.objects = input.objects.map(object => new ObjectModel().deserialize(object));
    return this;
  }
}


export class ObjectModel implements Deserializable {
  object_id: number;
  owner: string;
  object_name: string;
  object_type: string;
  status: string;
  
  deserialize(input: any): this {
    Object.assign(this, input);
    return this;
  }
}