import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SqlComponent } from './sql.component';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import {TextFieldModule} from '@angular/cdk/text-field';


describe('SqlComponent', () => {
  let component: SqlComponent;
  let fixture: ComponentFixture<SqlComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule, TextFieldModule],
      declarations: [ SqlComponent ]
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
});
