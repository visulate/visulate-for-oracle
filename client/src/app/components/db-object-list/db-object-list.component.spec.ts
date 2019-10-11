import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DbObjectListComponent } from './db-object-list.component';

describe('DbObjectListComponent', () => {
  let component: DbObjectListComponent;
  let fixture: ComponentFixture<DbObjectListComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DbObjectListComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DbObjectListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
