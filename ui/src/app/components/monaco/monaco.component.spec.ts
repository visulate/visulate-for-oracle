import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MonacoComponent } from './monaco.component';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChangeDetectorRef } from '@angular/core';
import { of, throwError, Subject, NEVER } from 'rxjs';
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
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    mockRestService = jasmine.createSpyObj('RestService', [
      'getGitAuth',
      'getLocalRepositories$',
      'listGitFiles$',
      'saveGitFile$',
      'deleteGitFile$',
      'getGitFile$',
      'getGitBranches$',
      'getEndpoints$'
    ]);
    mockStateService = jasmine.createSpyObj('StateService', [
      'getCurrentContext',
      'setLastSelectedFile',
      'setCurrentContext',
      'setSelectedRepo',
      'getSelectedRepo',
      'notifyRepoAssociationChanged'
    ]);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockDialog.open.and.returnValue({
      afterClosed: () => of({})
    } as any);
    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);
    mockSnackBar.open.and.returnValue({
      onAction: () => NEVER
    } as any);

    mockRestService.getGitAuth.and.returnValue(null);
    mockRestService.getLocalRepositories$.and.returnValue(of({ repositories: [], baseDir: '/repos' }));
    mockRestService.getEndpoints$.and.returnValue(of({ databases: [] } as any));
    mockStateService.getCurrentContext.and.returnValue({
      endpoint: '',
      setEndpoint: jasmine.createSpy('setEndpoint')
    } as any);

    await TestBed.configureTestingModule({
      declarations: [MonacoComponent],
      imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule, MatSnackBarModule],
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
        { provide: MatSnackBar, useValue: mockSnackBar },
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

  describe('Database and Repository Associations (dbToRepo)', () => {
    beforeEach(() => {
      localStorage.removeItem('visulate_db_repo_associations');
    });

    afterEach(() => {
      localStorage.removeItem('visulate_db_repo_associations');
    });

    it('should link selected database to selected repository and save only dbToRepo without repoToDb', () => {
      component.selectedDbConnection = 'db_prod';
      component.selectedRepoFolder = 'my-prod-repo';

      expect(component.isCurrentPairAssociated).toBe(false);

      component.toggleDbRepoAssociation();

      expect(component.isCurrentPairAssociated).toBe(true);
      const stored = localStorage.getItem('visulate_db_repo_associations');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.dbToRepo).toEqual({ db_prod: 'my-prod-repo' });
      expect(parsed.repoToDb).toBeUndefined();
    });

    it('should unlink selected database and update localStorage', () => {
      localStorage.setItem('visulate_db_repo_associations', JSON.stringify({
        dbToRepo: { db_prod: 'my-prod-repo' },
        repoToDb: { 'my-prod-repo': 'db_prod' } // legacy data
      }));

      component.selectedDbConnection = 'db_prod';
      component.selectedRepoFolder = 'my-prod-repo';

      expect(component.isCurrentPairAssociated).toBe(true);

      component.toggleDbRepoAssociation();

      expect(component.isCurrentPairAssociated).toBe(false);
      const stored = localStorage.getItem('visulate_db_repo_associations');
      const parsed = JSON.parse(stored!);
      expect(parsed.dbToRepo).toEqual({});
      expect(parsed.repoToDb).toBeUndefined();
    });

    it('should switch selected repository when changing database that has a dbToRepo association', () => {
      localStorage.setItem('visulate_db_repo_associations', JSON.stringify({
        dbToRepo: { db_alpha: 'repo-alpha', db_beta: 'repo-beta' }
      }));

      component.localRepos = [
        { folderName: 'repo-alpha', fullPath: '/repos/repo-alpha', isGitRepo: true },
        { folderName: 'repo-beta', fullPath: '/repos/repo-beta', isGitRepo: true }
      ];
      component.selectedDbConnection = 'db_alpha';
      component.selectedRepoFolder = 'repo-alpha';

      spyOn(component, 'loadProjectFiles');

      // Change to db_beta which is linked to repo-beta
      component.selectedDbConnection = 'db_beta';
      component.onDbChange();

      expect(component.selectedRepoFolder).toBe('repo-beta');
      expect(component.projectId).toBe('repo-beta');
      expect(component.loadProjectFiles).toHaveBeenCalled();
    });

    it('should sync associated repository when syncProjectAssociation is called', () => {
      localStorage.setItem('visulate_db_repo_associations', JSON.stringify({
        dbToRepo: { db_sales: 'sales-repo' }
      }));

      component.localRepos = [
        { folderName: 'default-repo', fullPath: '/repos/default-repo', isGitRepo: true },
        { folderName: 'sales-repo', fullPath: '/repos/sales-repo', isGitRepo: true }
      ];
      component.selectedDbConnection = 'db_sales';
      component.selectedRepoFolder = 'default-repo';

      spyOn(component, 'loadProjectFiles');

      component.syncProjectAssociation();

      expect(component.selectedRepoFolder).toBe('sales-repo');
      expect(component.projectId).toBe('sales-repo');
      expect(component.loadProjectFiles).toHaveBeenCalled();
    });

    it('should NOT change database connection when onRepoChange is called', () => {
      component.selectedDbConnection = 'db_alpha';
      component.selectedRepoFolder = 'repo-beta';

      spyOn(component, 'loadProjectFiles');

      component.onRepoChange();

      expect(component.selectedDbConnection).toBe('db_alpha');
      expect(component.projectId).toBe('repo-beta');
      expect(component.loadProjectFiles).toHaveBeenCalled();
    });

    it('should NOT navigate or modify query parameters in openFile when not on /workbench', () => {
      (mockRouter as any).url = '/database';
      spyOn(component, 'loadFileContent');
      component.selectedDbConnection = 'pdb23';
      component.selectedRepoFolder = 'odoo';

      component.openFile('test.sql');

      expect(component.selectedFilePath).toBe('test.sql');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should navigate and update query parameters in openFile when on /workbench', () => {
      (mockRouter as any).url = '/workbench';
      spyOn(component, 'loadFileContent');
      component.selectedDbConnection = 'pdb23';
      component.selectedRepoFolder = 'odoo';

      component.openFile('test.sql');

      expect(component.selectedFilePath).toBe('test.sql');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: {
          db: 'pdb23',
          file: 'test.sql',
          projectId: 'odoo'
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      }));
    });

    it('should load db-specific map .visulate/<db>/oracle-code-map.json when selectedDbConnection is set', () => {
      component.selectedDbConnection = 'pdb23';
      component.selectedRepoFolder = 'my-repo';
      mockRestService.getGitFile$.and.returnValue(of({
        content: JSON.stringify({
          dbConnectionId: 'pdb23',
          objects: { EMP: { owner: 'SCOTT', type: 'TABLE', files: ['emp.sql'] } },
          files: { 'emp.sql': ['EMP'] }
        })
      }));

      component.loadDbMapData();

      expect(mockRestService.getGitFile$).toHaveBeenCalledWith('my-repo', '.visulate/pdb23/oracle-code-map.json');
      expect(component.dbMapData).toBeTruthy();
      expect(component.dbMapData.objects['EMP']).toBeDefined();
    });

    it('should fall back to .okf/ when .visulate/ is missing', () => {
      component.selectedDbConnection = 'pdb23';
      component.selectedRepoFolder = 'my-repo';
      mockRestService.getGitFile$.and.callFake((proj, file) => {
        if (file.startsWith('.visulate')) {
          return throwError(() => new Error('Not found'));
        }
        return of({
          content: JSON.stringify({
            dbConnectionId: 'pdb23',
            objects: { DEPT: { owner: 'SCOTT', type: 'TABLE', files: ['dept.sql'] } },
            files: { 'dept.sql': ['DEPT'] }
          })
        });
      });

      component.loadDbMapData();

      expect(mockRestService.getGitFile$).toHaveBeenCalledWith('my-repo', '.visulate/pdb23/oracle-code-map.json');
      expect(mockRestService.getGitFile$).toHaveBeenCalledWith('my-repo', '.okf/pdb23/oracle-code-map.json');
      expect(component.dbMapData).toBeTruthy();
      expect(component.dbMapData.objects['DEPT']).toBeDefined();
    });

    it('should delete file and clear active editor state if deleted file was active', () => {
      component.selectedRepoFolder = 'my-repo';
      component.selectedFilePath = 'src/test.sql';
      component.activeFileContent = 'SELECT 1;';
      (mockRouter as any).url = '/workbench';

      mockRestService.deleteGitFile$.and.returnValue(of({ success: true, filePath: 'src/test.sql' }));
      spyOn(component, 'loadProjectFiles');

      component.executeDeleteFile('src/test.sql');

      expect(mockRestService.deleteGitFile$).toHaveBeenCalledWith('my-repo', 'src/test.sql');
      expect(component.selectedFilePath).toBe('');
      expect(component.activeFileContent).toBe('');
      expect(component.loadProjectFiles).toHaveBeenCalled();
      expect(component.statusMessage).toContain('Deleted \'src/test.sql\' successfully');
    });

    it('should delete file without clearing active editor state if a different file was deleted', () => {
      component.selectedRepoFolder = 'my-repo';
      component.selectedFilePath = 'src/active.sql';
      component.activeFileContent = 'SELECT 2;';

      mockRestService.deleteGitFile$.and.returnValue(of({ success: true, filePath: 'src/other.sql' }));
      spyOn(component, 'loadProjectFiles');

      component.executeDeleteFile('src/other.sql');

      expect(mockRestService.deleteGitFile$).toHaveBeenCalledWith('my-repo', 'src/other.sql');
      expect(component.selectedFilePath).toBe('src/active.sql');
      expect(component.activeFileContent).toBe('SELECT 2;');
      expect(component.loadProjectFiles).toHaveBeenCalled();
    });

    it('should open confirmation dialog and execute delete when confirmed', () => {
      component.selectedRepoFolder = 'my-repo';
      component.confirmDeleteDialog = {} as any;

      mockDialog.open.and.returnValue({
        afterClosed: () => of(true)
      } as any);

      spyOn(component, 'executeDeleteFile');

      component.confirmDeleteFile('src/delete-me.sql');

      expect(mockDialog.open).toHaveBeenCalledWith(component.confirmDeleteDialog, jasmine.objectContaining({
        data: { filePath: 'src/delete-me.sql' }
      }));
      expect(component.executeDeleteFile).toHaveBeenCalledWith('src/delete-me.sql');
    });

    it('should not execute delete if confirmation dialog is cancelled', () => {
      component.selectedRepoFolder = 'my-repo';
      component.confirmDeleteDialog = {} as any;

      mockDialog.open.and.returnValue({
        afterClosed: () => of(false)
      } as any);

      spyOn(component, 'executeDeleteFile');

      component.confirmDeleteFile('src/keep-me.sql');

      expect(mockDialog.open).toHaveBeenCalled();
      expect(component.executeDeleteFile).not.toHaveBeenCalled();
    });
  });

  describe('Git Operation Error Handling and MatSnackBar', () => {
    it('should show "Set Git Token" snackbar and enable showAuthAction on authentication error', () => {
      component.handleGitOperationError('Git pull', 'fatal: Authentication failed for remote origin (401)');

      expect(component.showAuthAction).toBe(true);
      expect(component.isError).toBe(true);
      expect(component.statusMessage).toContain('Git pull failed: Remote repository authentication required');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Git pull failed: Remote repository authentication required.',
        'Set Git Token',
        { duration: 10000 }
      );
    });

    it('should open git auth dialog when snackbar action is triggered for auth error', () => {
      const actionSubject = new Subject<void>();
      mockSnackBar.open.and.returnValue({
        onAction: () => actionSubject.asObservable()
      } as any);
      spyOn(component, 'openGitAuthDialog');

      component.handleGitOperationError('Git pull', 'personal access token required');
      actionSubject.next();

      expect(component.openGitAuthDialog).toHaveBeenCalled();
    });

    it('should show dismiss snackbar and NOT enable showAuthAction on 403 permission error', () => {
      component.handleGitOperationError('Commit/Push', 'Permission to user/repo.git denied to user. The requested URL returned error: 403');

      expect(component.showAuthAction).toBe(false);
      expect(component.isError).toBe(true);
      expect(component.statusMessage).toContain('Commit/Push failed: Permission to user/repo.git denied to user');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        jasmine.stringMatching(/Commit\/Push failed: Permission to user\/repo\.git denied/),
        'Dismiss',
        { duration: 6000 }
      );
    });

    it('should clear showAuthAction when a non-auth error status is set', () => {
      component.showAuthAction = true;
      (component as any).setStatus('A regular error occurred', true);
      expect(component.showAuthAction).toBe(false);
    });
  });
});
