import {Deserializable} from './deserializable.model';
export class ObjectTypeListItem implements Deserializable {
  public type: string;
  public count: number;

  deserialize(input: any): this {
    return Object.assign(this, input);
  }
}
