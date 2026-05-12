import { Component, Input, Optional } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-registration-helper',
  templateUrl: './registration-helper.component.html',
  styleUrls: ['./registration-helper.component.css'],
  standalone: false
})
export class RegistrationHelperComponent {
  @Input() isTile: boolean = false;
  public dbType: 'oracle' | 'postgres' = 'oracle';
  public host: string = '';
  public port: number = 1521;
  public serviceName: string = '';
  public sid: string = '';
  public useFullConnectString: boolean = false;
  public fullConnectString: string = '';
  public password: string = '';
  public showInstructions: boolean = false;

  constructor(
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<RegistrationHelperComponent>
  ) {}

  public openDialog() {
    this.dialog.open(RegistrationHelperComponent, {
      width: '800px',
      maxHeight: '90vh'
    });
  }

  public generateInstructions() {
    this.showInstructions = true;
  }

  public get oracleSql(): string {
    return `create user visulate identified by "${this.password}";
alter user visulate account unlock;
grant create session to visulate;
grant select any dictionary to visulate;
grant select_catalog_role to visulate;`;
  }

  public get postgresSql(): string {
    return `CREATE ROLE visulate WITH LOGIN PASSWORD '${this.password}';
GRANT pg_read_all_data TO visulate;
GRANT pg_read_all_stats TO visulate;`;
  }

  public get databaseJs(): string {
    const connStr = this.useFullConnectString && this.dbType === 'oracle'
      ? this.fullConnectString
      : `${this.host}:${this.port}/${this.serviceName}`;
    
    const poolConfig = this.dbType === 'oracle' 
      ? `,\n             poolMin: 4,
             poolMax: 4,
             poolIncrement: 0`
      : '';

    return `{
  namespace: '${this.serviceName}',
  description: '${this.serviceName} Database',
  connect: { poolAlias: '${this.serviceName}',
             dbType: '${this.dbType}',
             user: 'visulate',
             password: '${this.password}',
             connectString: '${connStr}'${poolConfig}
           }
}`;
  }

  public get endpointsJson(): string {
    const connStr = this.useFullConnectString && this.dbType === 'oracle'
      ? this.fullConnectString
      : `${this.host}:${this.port}/${this.serviceName}`;

    if (this.dbType === 'oracle') {
      return `"${this.serviceName}": "${connStr}"`;
    } else {
      return `"${this.serviceName}": {
  "dsn": "${connStr}",
  "dbType": "postgres"
}`;
    }
  }
}
