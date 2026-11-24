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
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-chat',
  template: '',
  standalone: false
})
class MockChatComponent {
  @Input() currentContext: any;
  @Input() currentObject: any;
  @Input() agent: string;
  @Output() fileSelect = new EventEmitter<string>();
  sendMessage: jasmine.Spy = jasmine.createSpy('sendMessage');
  toggleFullScreen(): void {}
}

@Directive({
  selector: '[markdown]',
  standalone: false
})
class MockMarkdownDirective {
  @Input() data?: string;
}

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
      'downloadGitFile$',
      'getGitFile$',
      'getGitBranches$',
      'getEndpoints$',
      'getDatabaseConnections$'
    ]);
    mockStateService = jasmine.createSpyObj('StateService', [
      'getCurrentContext',
      'setLastSelectedFile',
      'setCurrentContext',
      'setSelectedRepo',
      'getSelectedRepo',
      'notifyRepoAssociationChanged',
      'setWorkbenchToolbar',
      'setWorkbenchSidenav',
      'openSidenav',
      'closeSidenav',
      'addMessage'
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
    mockRestService.getDatabaseConnections$.and.returnValue(of([]));
    mockStateService.isDarkMode$ = of(false) as any;
    mockStateService.currentContext$ = of(null) as any;
    mockStateService.getCurrentContext.and.returnValue({
      endpoint: '',
      setEndpoint: jasmine.createSpy('setEndpoint')
    } as any);

    await TestBed.configureTestingModule({
      declarations: [MonacoComponent, MockChatComponent, MockMarkdownDirective],
      imports: [
        FormsModule,
        MatButtonModule,
        MatIconModule,
        MatProgressBarModule,
        MatTooltipModule,
        MatSnackBarModule,
        MatMenuModule,
        MatDividerModule,
        NoopAnimationsModule
      ],
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
    component.chatComponent = new MockChatComponent();
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

    it('should load db-specific map visulate/<db>/oracle-code-map.json when selectedDbConnection is set', () => {
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

      expect(mockRestService.getGitFile$).toHaveBeenCalledWith('my-repo', 'visulate/pdb23/oracle-code-map.json');
      expect(component.dbMapData).toBeTruthy();
      expect(component.dbMapData.objects['EMP']).toBeDefined();
    });

    it('should fall back to root visulate/oracle-code-map.json when db-specific is missing', () => {
      component.selectedDbConnection = 'pdb23';
      component.selectedRepoFolder = 'my-repo';
      mockRestService.getGitFile$.and.callFake((proj, file) => {
        if (file === 'visulate/pdb23/oracle-code-map.json') {
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

      expect(mockRestService.getGitFile$).toHaveBeenCalledWith('my-repo', 'visulate/pdb23/oracle-code-map.json');
      expect(mockRestService.getGitFile$).toHaveBeenCalledWith('my-repo', 'visulate/oracle-code-map.json');
      expect(component.dbMapData).toBeTruthy();
      expect(component.dbMapData.objects['DEPT']).toBeDefined();
    });

    it('should download file when downloadFile is called', () => {
      component.selectedRepoFolder = 'my-repo';
      const fakeBlob = new Blob(['sample content'], { type: 'text/plain' });
      mockRestService.downloadGitFile$.and.returnValue(of(fakeBlob));

      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:fake-url');
      spyOn(window.URL, 'revokeObjectURL');
      const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');

      const mockEvent = jasmine.createSpyObj('Event', ['stopPropagation']);
      component.downloadFile('visulate/pdb21/erd/schema.drawio', mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockRestService.downloadGitFile$).toHaveBeenCalledWith('my-repo', 'visulate/pdb21/erd/schema.drawio');
      expect(clickSpy).toHaveBeenCalled();
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

  describe('Application Workbench - AI Interactions & README Generator', () => {
    it('should initialize with rightPanelTab set to "ai" and allow switching to "context"', () => {
      expect(component.rightPanelTab).toBe('ai');

      component.setRightPanelTab('context');
      expect(component.rightPanelTab).toBe('context');

      component.setRightPanelTab('ai');
      expect(component.rightPanelTab).toBe('ai');
    });

    it('should construct workbenchAiContext with repository, file, branch, and mapped DB objects', () => {
      component.selectedRepoFolder = 'sample-repo';
      component.selectedDbConnection = 'pdb21';
      component.currentBranch = 'feature/modernize';
      component.selectedFilePath = 'src/billing/invoice.js';
      component.currentFileDbObjects = ['RNT_INVOICES', 'RNT_PAYMENTS'];
      component.activeFileContent = 'const x = 1;';

      const ctx = component.workbenchAiContext;
      expect(ctx.projectId).toBe('sample-repo');
      expect(ctx.endpoint).toBe('pdb21');
      expect(ctx.branch).toBe('feature/modernize');
      expect(ctx.activeFile).toBe('src/billing/invoice.js');
      expect(ctx.fileDbObjects).toEqual(['RNT_INVOICES', 'RNT_PAYMENTS']);
      expect(ctx.activeFileContent).toBe('const x = 1;');

      const obj = component.workbenchAiObject;
      expect(obj.objectName).toBe('invoice.js');
      expect(obj.filePath).toBe('src/billing/invoice.js');
    });

    it('should trigger README generation for repository when scoped to repo', () => {
      component.selectedRepoFolder = 'sample-repo';
      component.rightPanelTab = 'context';

      component.triggerReadmeGeneration('repo');

      expect(component.rightPanelTab).toBe('ai');
      expect(component.chatComponent.sendMessage).toHaveBeenCalledWith(
        jasmine.stringMatching(/Please generate, validate, or update README files across repository 'sample-repo'/)
      );
    });

    it('should trigger README generation for selected node directory when scoped to selected', () => {
      component.selectedRepoFolder = 'sample-repo';
      component.selectedFolderPath = 'src/services/billing';

      component.triggerReadmeGeneration('selected');

      expect(component.chatComponent.sendMessage).toHaveBeenCalledWith(
        jasmine.stringMatching(/Please generate, validate, or update README files for directory 'src\/services\/billing'/)
      );
    });

    it('should fallback to state.addMessage when chatComponent is not present', () => {
      component.chatComponent = null;
      spyOn(component['cdRef'], 'detectChanges'); // prevent re-querying ViewChild

      component.selectedRepoFolder = 'sample-repo';
      component.triggerReadmeGeneration('repo');

      expect(mockStateService.addMessage).toHaveBeenCalledWith(
        jasmine.objectContaining({ user: 'You' })
      );
    });

    it('should toggle folder selection when selectFolder is called', () => {
      expect(component.selectedFolderPath).toBe('');
      component.selectFolder('src/services');
      expect(component.selectedFolderPath).toBe('src/services');
      expect(component.selectedNodeDir).toBe('src/services');

      component.selectFolder('src/services');
      expect(component.selectedFolderPath).toBe('');
    });

    it('should reset selectedFolderPath when selected repository changes', () => {
      component.selectedRepoFolder = 'repo-a';
      component.selectedFolderPath = 'src/services';
      expect(component.selectedFolderPath).toBe('src/services');

      component.selectedRepoFolder = 'repo-b';
      expect(component.selectedFolderPath).toBe('');
    });

    it('should toggle folder expanded state and update selectedFolderPath when toggleFolder is called', () => {
      const mockNode = { name: 'services', path: 'src/services', type: 'folder' as const, expanded: false };
      component.toggleFolder(mockNode);
      expect(mockNode.expanded).toBe(true);
      expect(component.selectedFolderPath).toBe('src/services');

      component.toggleFolder(mockNode);
      expect(mockNode.expanded).toBe(false);
      expect(component.selectedFolderPath).toBe('src/services');
    });

    it('should trigger explain code with referenced DB objects', () => {
      component.selectedRepoFolder = 'sample-repo';
      component.selectedFilePath = 'src/services/billing/payment.sql';
      component.currentFileDbObjects = ['RNT_PAYMENTS'];

      component.triggerExplainCode();

      expect(component.rightPanelTab).toBe('ai');
      expect(component.chatComponent.sendMessage).toHaveBeenCalledWith(
        jasmine.stringMatching(/Please explain the function of the file 'src\/services\/billing\/payment\.sql'.*references indexed database objects: RNT_PAYMENTS/)
      );
    });

    it('should warn when triggerReadmeGeneration is called without selected repository', () => {
      component.selectedRepoFolder = '';
      component.triggerReadmeGeneration('repo');
      expect(mockSnackBar.open).toHaveBeenCalledWith('Please select a Git repository first.', 'Close', { duration: 4000 });
    });

    it('should warn when triggerExplainCode is called without selected file', () => {
      component.selectedFilePath = '';
      component.triggerExplainCode();
      expect(mockSnackBar.open).toHaveBeenCalledWith('Please select a file to explain.', 'Close', { duration: 4000 });
    });

    it('should toggle AI panel wide mode', () => {
      expect(component.aiPanelWide).toBe(false);
      component.toggleAiPanelWidth();
      expect(component.aiPanelWide).toBe(true);
      component.toggleAiPanelWidth();
      expect(component.aiPanelWide).toBe(false);
    });

    it('should trigger fullscreen on chat component when toggleFullScreenChat is called', () => {
      const toggleSpy = jasmine.createSpy('toggleFullScreen');
      component.chatComponent = { toggleFullScreen: toggleSpy };
      component.toggleFullScreenChat();
      expect(toggleSpy).toHaveBeenCalled();
    });

    it('should toggle word wrap and update monaco editor options', () => {
      const updateOptionsSpy = jasmine.createSpy('updateOptions');
      (component as any).monacoEditor = { updateOptions: updateOptionsSpy, dispose: jasmine.createSpy('dispose') };

      expect(component.isWordWrap).toBe(false);

      component.toggleWordWrap();
      expect(component.isWordWrap).toBe(true);
      expect(updateOptionsSpy).toHaveBeenCalledWith({ wordWrap: 'on' });

      component.toggleWordWrap();
      expect(component.isWordWrap).toBe(false);
      expect(updateOptionsSpy).toHaveBeenCalledWith({ wordWrap: 'off' });
    });

    it('should correctly identify markdown files via isMarkdownFile getter', () => {
      component.selectedFilePath = 'README.md';
      expect(component.isMarkdownFile).toBe(true);

      component.selectedFilePath = 'docs/architecture.markdown';
      expect(component.isMarkdownFile).toBe(true);

      component.selectedFilePath = 'src/app.ts';
      expect(component.isMarkdownFile).toBe(false);

      component.selectedFilePath = 'scripts/test.sql';
      expect(component.isMarkdownFile).toBe(false);

      component.selectedFilePath = '';
      expect(component.isMarkdownFile).toBe(false);
    });

    it('should switch markdown view modes and update preview content', () => {
      const layoutSpy = jasmine.createSpy('layout');
      (component as any).monacoEditor = {
        getValue: () => '# Heading\nPreview text',
        layout: layoutSpy,
        dispose: jasmine.createSpy('dispose')
      };

      component.selectedFilePath = 'README.md';
      component.setMdViewMode('split');
      expect(component.mdViewMode).toBe('split');
      expect(component.markdownPreviewContent).toBe('# Heading\nPreview text');

      component.setMdViewMode('preview');
      expect(component.mdViewMode).toBe('preview');

      component.setMdViewMode('edit');
      expect(component.mdViewMode).toBe('edit');
    });

    it('should reset mdViewMode to edit if opening non-markdown file from preview mode', () => {
      spyOn(component, 'loadFileContent');
      component.mdViewMode = 'preview';
      component.openFile('src/queries.sql');
      expect(component.mdViewMode).toBe('edit');
    });

    it('should resolve relative links and open file on markdown preview click', () => {
      spyOn(component, 'openFile');
      component.selectedFilePath = 'database/public_records/README.md';

      const anchor = document.createElement('a');
      anchor.setAttribute('href', '../other_schema/README.md');
      const mockEvent = {
        target: anchor,
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation')
      } as any;

      component.handleMarkdownPreviewClick(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(component.openFile).toHaveBeenCalledWith('database/other_schema/README.md');
    });

    it('should strip query and hash fragments from relative links in markdown preview', () => {
      spyOn(component, 'openFile');
      component.selectedFilePath = 'database/public_records/README.md';

      const anchor = document.createElement('a');
      anchor.setAttribute('href', '../other_schema/README.md#setup');
      const mockEvent = {
        target: anchor,
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation')
      } as any;

      component.handleMarkdownPreviewClick(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(component.openFile).toHaveBeenCalledWith('database/other_schema/README.md');
    });

    it('should set target=_blank for external links in markdown preview', () => {
      const anchor = document.createElement('a');
      anchor.setAttribute('href', 'https://example.com/docs');
      const mockEvent = {
        target: anchor,
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation')
      } as any;

      component.handleMarkdownPreviewClick(mockEvent);

      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('Granular Git Controls, M:N Associations & Copy to Repo', () => {
    it('should group linked databases and linked repositories for M:N modernization and DBA roles', () => {
      component.dbEndpoints = [
        { endpoint: 'pdb21', description: 'Source Oracle' },
        { endpoint: 'cmbs-postgres', description: 'Target Postgres' },
        { endpoint: 'other-db', description: 'Unlinked DB' }
      ];
      component.localRepos = [
        { folderName: 'visulate-memory', fullPath: '/repos/visulate-memory', isGitRepo: true, isMemoryRepo: true },
        { folderName: 'rental-portal', fullPath: '/repos/rental-portal', isGitRepo: true },
        { folderName: 'dba-common', fullPath: '/repos/dba-common', isGitRepo: true }
      ];
      component.associations = [
        { db: 'pdb21', repo: 'rental-portal', role: 'source' },
        { db: 'cmbs-postgres', repo: 'rental-portal', role: 'target' },
        { db: '*', repo: 'dba-common', role: 'dba' }
      ];

      component.selectedRepoFolder = 'rental-portal';
      component.selectedDbConnection = 'pdb21';

      expect(component.linkedDbEndpointsForCurrentRepo.map(d => `${d.endpoint}:${d.role}`)).toEqual([
        'pdb21:source',
        'cmbs-postgres:target'
      ]);
      expect(component.otherDbEndpointsForCurrentRepo.map(d => d.endpoint)).toEqual(['other-db']);
      expect(component.linkedReposForCurrentDb.map(r => `${r.folderName}:${r.role}`)).toEqual([
        'rental-portal:source',
        'dba-common:dba'
      ]);
      expect(component.otherReposForCurrentDb.map(r => r.folderName)).toEqual(['visulate-memory']);
    });

    it('should open Commit dialog (never auto-pushing) and switch to diff mode when requested from dialog', () => {
      (mockRestService as any).getGitStatus$ = jasmine.createSpy('getGitStatus$').and.returnValue(of({
        projectId: 'rental-portal',
        branch: 'main',
        upstream: null,
        remotes: [],
        hasRemote: false,
        isMemoryRepo: false,
        ahead: 0,
        behind: 0,
        files: [{ path: 'src/app.sql', indexStatus: ' ', workTreeStatus: 'M', status: 'M' }]
      }));
      mockDialog.open.and.returnValue({
        afterClosed: () => of({ action: 'diff', filePath: 'src/app.sql' })
      } as any);
      spyOn(component, 'openFile');

      component.selectedRepoFolder = 'rental-portal';
      component.openCommitDialog();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(component.viewMode).toBe('diff');
      expect(component.openFile).toHaveBeenCalledWith('src/app.sql');
    });

    it('should open Remote dialog when Push is clicked on a repo without an upstream remote', () => {
      component.selectedRepoFolder = 'visulate-memory';
      component.gitStatus = {
        projectId: 'visulate-memory',
        branch: 'main',
        upstream: null,
        remotes: [],
        hasRemote: false,
        isMemoryRepo: true,
        ahead: 0,
        behind: 0,
        files: []
      };
      spyOn(component, 'openRemoteDialog');

      component.pushChanges();
      expect(component.openRemoteDialog).toHaveBeenCalled();
    });

    it('should open CopyToRepoDialog with linked repos prioritized and clean default target path', () => {
      component.memoryRepoName = 'visulate-memory';
      component.selectedRepoFolder = 'visulate-memory';
      component.localRepos = [
        { folderName: 'visulate-memory', fullPath: '/repos/visulate-memory', isGitRepo: true, isMemoryRepo: true },
        { folderName: 'alpha-repo', fullPath: '/repos/alpha-repo', isGitRepo: true },
        { folderName: 'rental-portal', fullPath: '/repos/rental-portal', isGitRepo: true }
      ];
      component.associations = [
        { db: 'pdb21', repo: 'rental-portal', role: 'source' }
      ];

      component.openCopyToRepoDialog('pdb21/comments/comments_pdb21_hr.sql');

      expect(mockDialog.open).toHaveBeenCalled();
      const args = mockDialog.open.calls.mostRecent().args[1] as any;
      expect(args.data.sourceRepo).toBe('visulate-memory');
      expect(args.data.defaultTargetRepo).toBe('rental-portal');
      expect(args.data.defaultTargetPath).toBe('db/comments/comments_pdb21_hr.sql');
    });

    it('should order multi-root workspaces with linked repos, visulate-memory, and unlinked repos always accessible', () => {
      component.memoryRepoName = 'visulate-memory';
      component.selectedDbConnection = 'pdb21';
      component.localRepos = [
        { folderName: 'zeta-unlinked', fullPath: '/repos/zeta-unlinked', isGitRepo: true },
        { folderName: 'visulate-memory', fullPath: '/repos/visulate-memory', isGitRepo: true, isMemoryRepo: true },
        { folderName: 'rental-portal', fullPath: '/repos/rental-portal', isGitRepo: true },
        { folderName: 'dba-common', fullPath: '/repos/dba-common', isGitRepo: true }
      ];
      component.associations = [
        { db: 'pdb21', repo: 'rental-portal', role: 'source' },
        { db: '*', repo: 'dba-common', role: 'dba' }
      ];

      const ordered = component.orderedWorkspaces.map(w => w.folderName);
      expect(ordered).toEqual(['rental-portal', 'dba-common', 'visulate-memory', 'zeta-unlinked']);
    });

    it('should compare two arbitrary files across different workspaces via Select for Compare / Compare with Selected', () => {
      mockRestService.getGitFile$.and.callFake((repo: string, path: string) => {
        if (repo === 'visulate-memory' && path === 'pdb21/comments/a.sql') {
          return of({ content: '-- generated' });
        }
        return of({ content: '-- modified in app repo' });
      });
      spyOn(component as any, 'initMonaco');
      spyOn(component as any, 'updateDiffEditorModels');

      component.selectForCompare('visulate-memory', 'pdb21/comments/a.sql');
      expect(component.compareSource).toEqual({ repo: 'visulate-memory', path: 'pdb21/comments/a.sql' });

      component.compareWithSelected('rental-portal', 'db/a.sql');
      expect(component.viewMode).toBe('diff');
      expect(component.originalContent).toBe('-- generated');
      expect(component.modifiedContent).toBe('-- modified in app repo');
      expect(component.activeCompare).toEqual({
        leftRepo: 'visulate-memory',
        leftPath: 'pdb21/comments/a.sql',
        rightRepo: 'rental-portal',
        rightPath: 'db/a.sql'
      });
    });

    it('should project workbench toolbar and custom hamburger sidenav into main-nav after view init and clear on destroy', fakeAsync(() => {
      spyOn(component as any, 'initMonaco');
      fixture.detectChanges();
      tick();
      expect(mockStateService.setWorkbenchToolbar).toHaveBeenCalledWith(component.workbenchToolbarTpl);
      expect(mockStateService.setWorkbenchSidenav).toHaveBeenCalledWith(component.workbenchSidenavTpl);
      component.openAppMenu();
      expect(mockStateService.openSidenav).toHaveBeenCalled();
      component.closeAppMenu();
      expect(mockStateService.closeSidenav).toHaveBeenCalled();
      component.ngOnDestroy();
      expect(mockStateService.setWorkbenchToolbar).toHaveBeenCalledWith(null);
      expect(mockStateService.setWorkbenchSidenav).toHaveBeenCalledWith(null);
    }));

    it('should compute human-readable file language labels for the VS Code-style footer', () => {
      component.selectedFilePath = 'db/queries/rental_report.sql';
      expect(component.activeFileLanguageLabel).toBe('SQL');
      component.selectedFilePath = 'docs/README.md';
      expect(component.activeFileLanguageLabel).toBe('Markdown');
      component.selectedFilePath = 'src/pkg.pkb';
      expect(component.activeFileLanguageLabel).toBe('PL/SQL');
    });

    it('should open Git Status dialog and handle diff/commit actions returned from it', () => {
      component.localRepos = [
        { folderName: 'visulate-memory', fullPath: '/repos/visulate-memory', isGitRepo: true, isMemoryRepo: true },
        { folderName: 'rental-portal', fullPath: '/repos/rental-portal', isGitRepo: true }
      ];
      component.selectedRepoFolder = 'rental-portal';
      mockDialog.open.and.returnValue({
        afterClosed: () => of({ action: 'diff', repo: 'visulate-memory', filePath: 'pdb21/memories/note.md' })
      } as any);
      spyOn(component, 'openFileInWorkspace');

      component.openGitStatusDialog();

      expect(mockDialog.open).toHaveBeenCalled();
      const cfg = mockDialog.open.calls.mostRecent().args[1] as any;
      expect(cfg.data.projectId).toBe('rental-portal');
      expect(cfg.data.repos.length).toBe(2);
      expect(component.openFileInWorkspace).toHaveBeenCalledWith('visulate-memory', 'pdb21/memories/note.md', 'diff');
    });

    it('should pass rebase flag to pullRepository$ when Pull (Rebase) is triggered', () => {
      (mockRestService as any).pullRepository$ = jasmine.createSpy('pullRepository$').and.returnValue(of({
        success: true,
        rebase: true,
        summary: 'Successfully rebased'
      }));
      spyOn(component, 'loadProjectFiles');
      component.selectedRepoFolder = 'rental-portal';
      component.currentBranch = 'main';

      component.pullRepo(true);

      expect((mockRestService as any).pullRepository$).toHaveBeenCalledWith('rental-portal', 'main', true);
      expect(component.statusMessage).toContain('Git pull (rebase) completed');
    });

    it('should preview and confirm before deleting gone branches via pruneGoneBranches', () => {
      const pruneSpy = jasmine.createSpy('pruneGoneBranches$').and.callFake((_repo: string, opts: any) => {
        if (opts.dryRun) {
          return of({
            success: true,
            dryRun: true,
            goneBranches: [{ name: 'feat/old-pr', upstream: 'origin/feat/old-pr' }],
            skippedCurrent: null
          });
        }
        return of({
          success: true,
          dryRun: false,
          deleted: ['feat/old-pr'],
          failed: [],
          branches: ['main']
        });
      });
      (mockRestService as any).pruneGoneBranches$ = pruneSpy;
      spyOn(window, 'confirm').and.returnValue(true);
      spyOn(component, 'loadGitStatus');

      component.selectedRepoFolder = 'rental-portal';
      component.pruneGoneBranches();

      expect(pruneSpy.calls.count()).toBe(2);
      expect(pruneSpy.calls.argsFor(0)[1].dryRun).toBe(true);
      expect(pruneSpy.calls.argsFor(1)[1]).toEqual({
        dryRun: false,
        branches: ['feat/old-pr'],
        remote: 'origin'
      });
      expect(component.availableBranches).toEqual(['main']);
      expect(component.statusMessage).toContain('Pruned 1 branch: feat/old-pr');
    });

    it('should rename a file from the file menu and update active selection if open', () => {
      const renameSpy = jasmine.createSpy('renameGitFile$').and.returnValue(of({
        success: true,
        oldPath: 'sql/old.sql',
        newPath: 'sql/new.sql'
      }));
      (mockRestService as any).renameGitFile$ = renameSpy;
      spyOn(window, 'prompt').and.returnValue('sql/new.sql');
      spyOn(component, 'loadWorkspaceFiles');
      spyOn(component, 'loadFileContent');

      component.selectedRepoFolder = 'rental-portal';
      component.selectedFilePath = 'sql/old.sql';
      component.renameFileFromMenu('rental-portal', 'sql/old.sql');

      expect(renameSpy).toHaveBeenCalledWith('rental-portal', 'sql/old.sql', 'sql/new.sql');
      expect(component.selectedFilePath).toBe('sql/new.sql');
      expect(component.loadWorkspaceFiles).toHaveBeenCalledWith('rental-portal', true);
      expect(component.loadFileContent).toHaveBeenCalled();
    });
  });
});
