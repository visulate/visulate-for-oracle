import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';

import { SqlComponent, TrimPipe } from './sql.component';
import { FormsModule } from '@angular/forms';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TextFieldModule } from '@angular/cdk/text-field';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('SqlComponent', () => {
  let component: SqlComponent;
  let fixture: ComponentFixture<SqlComponent>;
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [SqlComponent, TrimPipe],
      imports: [FormsModule, TextFieldModule, MatCardModule, MatFormFieldModule, MatInputModule, MatIconModule, BrowserAnimationsModule],
      providers: [provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting()]
    })
      .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SqlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default username to schema owner for Oracle and set isPostgres to false', () => {
    component.endpointList = {
      databases: [{ endpoint: 'pdb21', dbType: 'oracle' }]
    };

    const oracleContext = {
      currentContext: {
        endpoint: 'pdb21',
        owner: 'HR',
        objectType: 'TABLE',
        objectName: 'EMPLOYEES'
      },
      changeSummary: {}
    } as any;

    component.processContextChange(oracleContext);

    expect(component.isPostgres).toBe(false);
    expect(component.dbUser).toBe('HR');
  });

  it('should default username to postgres for PostgreSQL and allow updating username', () => {
    component.endpointList = {
      databases: [{ endpoint: 'postgres_db', dbType: 'postgres' }]
    };

    const pgContext = {
      currentContext: {
        endpoint: 'postgres_db',
        owner: 'public',
        objectType: 'TABLE',
        objectName: 'customers'
      },
      changeSummary: {}
    } as any;

    component.processContextChange(pgContext);

    expect(component.isPostgres).toBe(true);
    expect(component.dbUser).toBe('postgres');

    // Updating username and password should compute credentials
    component.processUser('app_user');
    expect(component.dbUser).toBe('app_user');

    component.processPassword('secret');
    expect(component.password).toBe('secret');
    expect(component.dbCredentials).toBe(btoa('app_user/secret@postgres_db'));
  });
});
