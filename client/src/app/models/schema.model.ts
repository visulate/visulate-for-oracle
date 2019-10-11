import { Deserializable } from './deserializable.model';
import { ObjectTypeListItem } from './object-type-list.model';

export class SchemaModel implements Deserializable {
  public owner: string;
  public object_types: ObjectTypeListItem[];

  deserialize(input: any): this {
    Object.assign(this, input);
    this.object_types
     = input.object_types.map(
       object_type => new ObjectTypeListItem().deserialize(object_type));
    return this;
  }
}
