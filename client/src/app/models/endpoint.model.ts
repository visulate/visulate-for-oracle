import { Deserializable } from './deserializable.model';
import { SchemaModel } from './schema.model';

export class EndpointModel implements Deserializable {
  public endpoint: string;
  public schemas: SchemaModel[];

  deserialize(input: any): this {
    Object.assign(this, input);
    this.schemas = input.schemas.map (
      schema => new SchemaModel().deserialize(schema)
    );
    return this;
  }

}
