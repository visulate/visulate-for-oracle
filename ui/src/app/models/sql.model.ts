import { Deserializable } from './deserializable.model';

export class SqlModel implements Deserializable {
  public columns: string[];
  public rows: any[];
  public message: string;

  deserialize(input: any): this {
    Object.assign(this, input);
    return this;
  }
}