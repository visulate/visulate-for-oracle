import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { FormsModule, ReactiveFormsModule} from '@angular/forms';
import { MatSelectModule} from '@angular/material/select';
import { MatInputModule} from '@angular/material/input';
import { FilterObjectsComponent } from './filter-objects.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('FilterObjectsComponent', () => {
  let component: FilterObjectsComponent;
  let fixture: ComponentFixture<FilterObjectsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [ MatAutocompleteModule, FormsModule, ReactiveFormsModule, MatSelectModule, MatInputModule, BrowserAnimationsModule ],
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
