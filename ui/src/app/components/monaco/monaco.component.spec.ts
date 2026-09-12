import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MonacoComponent } from './monaco.component';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

describe('MonacoComponent - New File Creation', () => {
  let component: MonacoComponent;
  let fixture: ComponentFixture<MonacoComponent>;
  let mockRestService: jasmine.SpyObj<RestService>;
  let mockStateService: jasmine.SpyObj<StateService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    mockRestService = jasmine.createSpyObj('RestService', [
      'getGitAuth',
      'getLocalRepositories$',
      'listGitFiles$',
      'saveGitFile$',
      'getGitFile$',
      'getGitBranches$',
      'getEndpoints$'
    ]);
    mockStateService = jasmine.createSpyObj('StateService', [
      'getCurrentContext',
      'setLastSelectedFile',
      'setCurrentContext'
    ]);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);

    mockRestService.getGitAuth.and.returnValue(null);
    mockRestService.getLocalRepositories$.and.returnValue(of({ repositories: [], baseDir: '/repos' }));
    mockRestService.getEndpoints$.and.returnValue(of({ databases: [] } as any));
    mockStateService.getCurrentContext.and.returnValue({
      endpoint: '',
      setEndpoint: jasmine.createSpy('setEndpoint')
    } as any);

    await TestBed.configureTestingModule({
      declarations: [MonacoComponent],
      imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
      providers: [
        { provide: RestService, useValue: mockRestService },
        { provide: StateService, useValue: mockStateService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
            snapshot: { queryParams: {} }
          }
        },
        { provide: Router, useValue: mockRouter },
        { provide: MatDialog, useValue: mockDialog },
        ChangeDetectorRef
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MonacoComponent);
    component = fixture.componentInstance;
  });

  it('should toggle new file input when repository is selected', () => {
    component.selectedRepoFolder = 'my-repo';
    expect(component.showNewFileInput).toBe(false);

    component.toggleNewFileInput();
    expect(component.showNewFileInput).toBe(true);

    component.toggleNewFileInput();
    expect(component.showNewFileInput).toBe(false);
  });

  it('should warn when toggling new file input without a repository selected', () => {
    component.selectedRepoFolder = '';
    component.toggleNewFileInput();

    expect(component.showNewFileInput).toBe(false);
    expect(component.statusMessage).toContain('Please select a repository first');
    expect(component.isError).toBe(true);
  });

  it('should cancel new file creation and clear input path', () => {
    component.showNewFileInput = true;
    component.newFilePath = 'queries/customer.sql';

    component.cancelNewFile();

    expect(component.showNewFileInput).toBe(false);
    expect(component.newFilePath).toBe('');
  });

  it('should validate empty file path', () => {
    component.selectedRepoFolder = 'my-repo';
    component.newFilePath = '   ';

    component.createNewFile();

    expect(component.statusMessage).toContain('Please enter a valid file path');
    expect(component.isError).toBe(true);
  });

  it('should prevent directory traversal paths containing ..', () => {
    component.selectedRepoFolder = 'my-repo';
    component.newFilePath = '../secret.sql';

    component.createNewFile();

    expect(component.statusMessage).toContain("cannot contain '..'");
    expect(component.isError).toBe(true);
  });

  it('should open existing file if path already exists in projectFiles', () => {
    component.selectedRepoFolder = 'my-repo';
    component.projectFiles = ['schema.sql', 'data.sql'];
    component.newFilePath = 'schema.sql';
    spyOn(component, 'openFile');

    component.createNewFile();

    expect(component.openFile).toHaveBeenCalledWith('schema.sql');
    expect(component.statusMessage).toContain("already exists");
    expect(component.showNewFileInput).toBe(false);
  });

  it('should create new file via RestService and refresh project files', fakeAsync(() => {
    component.selectedRepoFolder = 'my-repo';
    component.projectFiles = ['old.sql'];
    component.newFilePath = 'queries/new-query.sql';
    spyOn(component, 'openFile');

    mockRestService.saveGitFile$.and.returnValue(of({ success: true } as any));
    mockRestService.listGitFiles$.and.returnValue(of({ files: ['old.sql', 'queries/new-query.sql'] } as any));

    component.createNewFile();
    tick(250);

    expect(mockRestService.saveGitFile$).toHaveBeenCalledWith('my-repo', 'queries/new-query.sql', '');
    expect(mockRestService.listGitFiles$).toHaveBeenCalledWith('my-repo');
    expect(component.projectFiles).toContain('queries/new-query.sql');
    expect(component.openFile).toHaveBeenCalledWith('queries/new-query.sql');
    expect(component.showNewFileInput).toBe(false);
  }));
});
