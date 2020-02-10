import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { FilterObjectsComponent } from './filter-objects.component';

describe('FilterObjectsComponent', () => {
  let component: FilterObjectsComponent;
  let fixture: ComponentFixture<FilterObjectsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FilterObjectsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FilterObjectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
