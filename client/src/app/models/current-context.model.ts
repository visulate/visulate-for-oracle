export class CurrentContextModel {
  constructor(
    public endpoint: String,
    public owner: String,
    public objectType: String ) { }

  public setEndpoint(endpoint: String) {
    this.endpoint = endpoint;
    this.owner = '';
    this.objectType = '';
  }

  public setOwner(owner: String) {
    this.owner = owner;
  }

  public setObjectType(objectType: String) {
    this.objectType = objectType;
  }
}
