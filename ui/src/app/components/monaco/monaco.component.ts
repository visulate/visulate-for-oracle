/*!
 * Copyright 2026 Visulate LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GitAuthDialogComponent } from '../git-auth-dialog/git-auth-dialog.component';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

declare var monaco: any;

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  expanded?: boolean;
  dbBadges?: string[];
  extraBadgeCount?: number;
}

@Component({
  selector: 'app-monaco',
  templateUrl: './monaco.component.html',
  styleUrls: ['./monaco.component.css'],
  standalone: false
})
export class MonacoComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: false }) editorContainer!: ElementRef;

  @Input() projectId: string = 'default-project';
  @Input() selectedFilePath: string = '';

  public isDarkMode: boolean = false;
  private destroy$ = new Subject<void>();

  public baseReposDir: string = '';
  public localRepos: Array<{ folderName: string; fullPath: string; isGitRepo: boolean }> = [];
  public dbEndpoints: Array<{ endpoint: string; description: string }> = [];

  public selectedDbConnection: string = 'pdb21';
  public selectedRepoFolder: string = '';

  public cloneRemoteUrl: string = '';
  public cloneFolderName: string = '';
  public showCloneForm: boolean = false;

  public viewMode: 'editor' | 'diff' = 'editor';
  public projectFiles: string[] = [];
  public filteredFiles: string[] = [];
  public fileTreeNodes: FileTreeNode[] = [];
  public fileFilterQuery: string = '';

  public activeFileContent: string = '';
  public originalContent: string = '';
  public modifiedContent: string = '';

  public branchName: string = 'visulate/modernize';
  public currentBranch: string = '';
  public availableBranches: string[] = [];
  public newBranchName: string = '';
  public showNewBranchInput: boolean = false;
  public newFilePath: string = '';
  public showNewFileInput: boolean = false;
  @ViewChild('newFileInputRef', { static: false }) newFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('confirmDeleteDialog', { static: false }) confirmDeleteDialog?: TemplateRef<any>;
  public commitMessage: string = 'Update codebase and OKF memory documentation';
  public statusMessage: string = '';
  public isError: boolean = false;
  public isLoading: boolean = false;
  public monacoLoaded: boolean = false;

  // DB Dependency Map Data (.okf/oracle-code-map.json)
  public dbMapData: any = null;
  public currentFileDbObjects: string[] = [];
  public activeDbObjectDetails: any = null;

  private monacoEditor: any = null;
  private diffEditor: any = null;
  private monacoModel: any = null;
  private originalModel: any = null;
  private modifiedModel: any = null;
  private resizeObserver: ResizeObserver | null = null;

  public showAuthAction: boolean = false;

  constructor(
    private restService: RestService,
    private state: StateService,
    private route: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) { }

  get isGitAuthenticated(): boolean {
    const auth = this.restService.getGitAuth();
    return !!(auth && (auth.token || auth.username));
  }

  public handleGitOperationError(operation: string, errorMsg: string): void {
    const isAuthError = !/permission denied|returned error: 403|http 403/i.test(errorMsg) &&
      /authentication failed|personal access token|could not read username|terminal prompts disabled|401/i.test(errorMsg);

    const displayMsg = isAuthError
      ? `${operation} failed: Remote repository authentication required. Configure your Personal Access Token in Git Auth.`
      : `${operation} failed: ${errorMsg}`;

    this.setStatus(displayMsg, true, isAuthError);

    if (isAuthError) {
      const snackRef = this.snackBar.open(
        `${operation} failed: Remote repository authentication required.`,
        'Set Git Token',
        { duration: 10000 }
      );
      snackRef.onAction().subscribe(() => {
        this.openGitAuthDialog();
      });
    } else {
      this.snackBar.open(`${operation} failed: ${errorMsg}`, 'Dismiss', { duration: 6000 });
    }
  }

  public openGitAuthDialog(): void {
    const dialogRef = this.dialog.open(GitAuthDialogComponent, {
      width: '620px',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.saved) {
        this.setStatus('Git session credentials saved for this browser session.', false);
        this.loadLocalRepos();
      } else if (res?.cleared) {
        this.setStatus('Git session credentials cleared.', false);
        this.loadLocalRepos();
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const url = this.router.url || '';
      if (!url.includes('/workbench')) {
        return;
      }

      let dbParam = params['db'];
      let projectParam = params['projectId'];

      if (dbParam) {
        this.selectedDbConnection = dbParam;
      }
      if (projectParam) {
        this.projectId = projectParam;
        this.selectedRepoFolder = projectParam;
      }

      if (this.selectedDbConnection) {
        const associations = this.getDbRepoAssociations();
        const associatedRepo = associations.dbToRepo[this.selectedDbConnection];
        if (associatedRepo && this.localRepos.some(r => r.folderName === associatedRepo)) {
          this.selectedRepoFolder = associatedRepo;
          this.projectId = associatedRepo;
        }
      }

      if (params['file']) {
        const fileParam = params['file'];
        if (fileParam !== this.selectedFilePath) {
          this.selectedFilePath = fileParam;
          this.state.setLastSelectedFile(fileParam, this.selectedRepoFolder || this.projectId);
          if (this.projectFiles && this.projectFiles.length > 0) {
            this.openFile(fileParam);
          }
        }
      }

      if (this.localRepos.length > 0) {
        this.syncProjectAssociation();
      }
    });

    this.state.isDarkMode$.pipe(takeUntil(this.destroy$)).subscribe(isDark => {
      this.isDarkMode = isDark;
      this.updateMonacoTheme();
    });

    this.state.currentContext$.pipe(takeUntil(this.destroy$)).subscribe(ctxModel => {
      if (ctxModel && ctxModel.currentContext) {
        const db = ctxModel.currentContext.endpoint;
        if (!db) {
          return;
        }
        if (db !== this.selectedDbConnection) {
          this.selectedDbConnection = db;
          const associations = this.getDbRepoAssociations();
          const associatedRepo = associations.dbToRepo[db];
          if (associatedRepo && this.localRepos.some(r => r.folderName === associatedRepo)) {
            this.selectedRepoFolder = associatedRepo;
            this.projectId = associatedRepo;
            this.setStatus(`Switched to linked repository '${associatedRepo}' for database '${db}'`, false);
          }
          if ((this.router.url || '').includes('/workbench')) {
            this.syncProjectAssociation();
          }
        }
      }
    });

    this.initWorkbenchData();
  }

  public initWorkbenchData(): void {
    this.isLoading = true;
    this.setStatus('Initializing Workbench & loading repository context...', false);

    forkJoin({
      endpoints: this.restService.getDatabaseConnections$().pipe(catchError(() => of([]))),
      repos: this.restService.getLocalRepositories$().pipe(catchError(() => of({ baseDir: '', repositories: [] })))
    }).subscribe({
      next: ({ endpoints, repos }) => {
        if (Array.isArray(endpoints) && endpoints.length > 0) {
          this.dbEndpoints = endpoints.map((ep: any) => ({
            endpoint: ep.endpoint,
            description: ep.description || ep.endpoint
          }));
        }
        if (repos) {
          this.baseReposDir = repos.baseDir || '';
          this.localRepos = repos.repositories || [];
        }

        // 1. Resolve active database connection
        const currentCtxDb = this.state.getCurrentContext()?.endpoint;
        if (!this.selectedDbConnection) {
          if (currentCtxDb && this.dbEndpoints.some(e => e.endpoint === currentCtxDb)) {
            this.selectedDbConnection = currentCtxDb;
          } else if (this.dbEndpoints.length > 0) {
            this.selectedDbConnection = this.dbEndpoints[0].endpoint;
          }
        }

        // 2. Check dbToRepo association for the selected database
        const associations = this.getDbRepoAssociations();
        const associatedRepo = this.selectedDbConnection ? associations.dbToRepo[this.selectedDbConnection] : null;

        if (associatedRepo && this.localRepos.some(r => r.folderName === associatedRepo)) {
          this.selectedRepoFolder = associatedRepo;
          this.projectId = associatedRepo;
        } else if (this.projectId && this.localRepos.some(r => r.folderName === this.projectId)) {
          this.selectedRepoFolder = this.projectId;
        } else if (this.selectedRepoFolder && this.localRepos.some(r => r.folderName === this.selectedRepoFolder)) {
          this.projectId = this.selectedRepoFolder;
        } else if (this.localRepos.length > 0) {
          this.selectedRepoFolder = this.localRepos[0].folderName;
          this.projectId = this.selectedRepoFolder;
        }

        this.syncProjectAssociation();
      },
      error: (err) => {
        this.setStatus(`Error loading workbench data: ${err.message}`, true);
        this.isLoading = false;
      }
    });
  }

  ngAfterViewInit(): void {
    this.initMonaco();
    this.setupResizeObserver();
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined' && this.editorContainer?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.monacoEditor) {
          this.monacoEditor.layout();
        }
        if (this.diffEditor) {
          this.diffEditor.layout();
        }
      });
      this.resizeObserver.observe(this.editorContainer.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.disposeEditors();
  }

  private disposeEditors(): void {
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
    if (this.diffEditor) {
      this.diffEditor.dispose();
      this.diffEditor = null;
    }
    if (this.monacoModel) {
      this.monacoModel.dispose();
      this.monacoModel = null;
    }
    if (this.originalModel) {
      this.originalModel.dispose();
      this.originalModel = null;
    }
    if (this.modifiedModel) {
      this.modifiedModel.dispose();
      this.modifiedModel = null;
    }
    if (this.editorContainer && this.editorContainer.nativeElement) {
      this.editorContainer.nativeElement.innerHTML = '';
    }
  }

  public loadDbEndpoints(): void {
    this.restService.getDatabaseConnections$().subscribe({
      next: (endpoints) => {
        if (Array.isArray(endpoints) && endpoints.length > 0) {
          this.dbEndpoints = endpoints.map((ep: any) => ({
            endpoint: ep.endpoint,
            description: ep.description || ep.endpoint
          }));
          if (this.dbEndpoints.length > 0 && !this.selectedDbConnection) {
            const ctxDb = this.state.getCurrentContext()?.endpoint;
            this.selectedDbConnection = (ctxDb && this.dbEndpoints.some(e => e.endpoint === ctxDb))
              ? ctxDb
              : this.dbEndpoints[0].endpoint;
          }
          this.syncProjectAssociation();
        } else {
          this.fallbackLoadEndpoints();
        }
      },
      error: () => this.fallbackLoadEndpoints()
    });
  }

  private fallbackLoadEndpoints(): void {
    this.restService.getEndpoints$('*').subscribe({
      next: (res) => {
        if (res && res.databases) {
          this.dbEndpoints = res.databases.map((ep: any) => ({
            endpoint: ep.endpoint,
            description: ep.description || ep.endpoint
          }));
          if (this.dbEndpoints.length > 0 && !this.selectedDbConnection) {
            const ctxDb = this.state.getCurrentContext()?.endpoint;
            this.selectedDbConnection = (ctxDb && this.dbEndpoints.some(e => e.endpoint === ctxDb))
              ? ctxDb
              : this.dbEndpoints[0].endpoint;
          }
          this.syncProjectAssociation();
        }
      },
      error: (err) => console.warn('Error loading endpoints:', err)
    });
  }

  public loadLocalRepos(): void {
    this.restService.getLocalRepositories$().subscribe({
      next: (res) => {
        this.baseReposDir = res.baseDir || '';
        this.localRepos = res.repositories || [];
        const associations = this.getDbRepoAssociations();
        const associatedRepo = this.selectedDbConnection ? associations.dbToRepo[this.selectedDbConnection] : null;

        if (associatedRepo && this.localRepos.some(r => r.folderName === associatedRepo)) {
          this.selectedRepoFolder = associatedRepo;
          this.projectId = associatedRepo;
        } else if (!this.selectedRepoFolder && this.localRepos.length > 0) {
          this.selectedRepoFolder = this.localRepos[0].folderName;
          this.projectId = this.selectedRepoFolder;
        }
        this.syncProjectAssociation();
      },
      error: (err) => {
        this.setStatus(`Error discovering git repositories: ${err.message}`, true);
      }
    });
  }

  private getDbRepoAssociations(): { dbToRepo: Record<string, string> } {
    try {
      const stored = localStorage.getItem('visulate_db_repo_associations');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          dbToRepo: parsed.dbToRepo || {}
        };
      }
    } catch (_) {}
    return { dbToRepo: {} };
  }

  private saveDbRepoAssociations(associations: { dbToRepo: Record<string, string> }): void {
    try {
      // Ensure only dbToRepo is saved in localStorage, removing any legacy repoToDb
      const toSave = {
        dbToRepo: associations.dbToRepo || {}
      };
      localStorage.setItem('visulate_db_repo_associations', JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save associations in localStorage', e);
    }
  }

  public get isCurrentPairAssociated(): boolean {
    if (!this.selectedDbConnection || !this.selectedRepoFolder) return false;
    const associations = this.getDbRepoAssociations();
    return associations.dbToRepo[this.selectedDbConnection] === this.selectedRepoFolder;
  }

  public toggleDbRepoAssociation(): void {
    if (!this.selectedDbConnection || !this.selectedRepoFolder) {
      this.setStatus('Please select both a Database and a Git Repository before linking.', true);
      return;
    }

    const associations = this.getDbRepoAssociations();
    if (this.isCurrentPairAssociated) {
      delete associations.dbToRepo[this.selectedDbConnection];
      this.saveDbRepoAssociations(associations);
      this.state.notifyRepoAssociationChanged();
      this.setStatus(`Unlinked database '${this.selectedDbConnection}' from repository '${this.selectedRepoFolder}'`, false);
    } else {
      associations.dbToRepo[this.selectedDbConnection] = this.selectedRepoFolder;
      this.saveDbRepoAssociations(associations);
      this.state.notifyRepoAssociationChanged();
      this.setStatus(`Linked database '${this.selectedDbConnection}' with repository '${this.selectedRepoFolder}'`, false);
    }
  }


  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.altKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      this.toggleDbRepoAssociation();
    }
    if (event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.toggleNewFileInput();
    }
  }

  public syncProjectAssociation(): void {
    const associations = this.getDbRepoAssociations();

    if (this.selectedDbConnection) {
      const associatedRepo = associations.dbToRepo[this.selectedDbConnection];
      if (associatedRepo && this.localRepos.some(r => r.folderName === associatedRepo)) {
        if (this.selectedRepoFolder !== associatedRepo) {
          this.selectedRepoFolder = associatedRepo;
          this.projectId = associatedRepo;
        }
      }
    }

    if (this.selectedRepoFolder) {
      this.projectId = this.selectedRepoFolder;
      this.state.setSelectedRepo(this.selectedRepoFolder);
      this.loadProjectFiles();
    } else if (this.localRepos.length > 0) {
      this.selectedRepoFolder = this.localRepos[0].folderName;
      this.projectId = this.selectedRepoFolder;
      this.state.setSelectedRepo(this.selectedRepoFolder);
      this.loadProjectFiles();
    } else {
      this.projectFiles = [];
      this.filteredFiles = [];
      this.fileTreeNodes = [];
      const paramFile = this.route.snapshot.queryParams['file'];
      if (!paramFile) {
        this.selectedFilePath = '';
        this.activeFileContent = '';
      }
      this.isLoading = false;
    }
  }

  public onDbChange(): void {
    if (!this.selectedDbConnection) return;

    const associations = this.getDbRepoAssociations();
    const associatedRepo = associations.dbToRepo[this.selectedDbConnection];

    if (associatedRepo && this.localRepos.some(r => r.folderName === associatedRepo)) {
      if (this.selectedRepoFolder !== associatedRepo) {
        this.selectedRepoFolder = associatedRepo;
        this.projectId = associatedRepo;
        this.state.setSelectedRepo(associatedRepo);
        this.setStatus(`Switched to linked repository '${associatedRepo}' for database '${this.selectedDbConnection}'`, false);
      }
    }

    const ctx = this.state.getCurrentContext();
    if (ctx.endpoint !== this.selectedDbConnection) {
      ctx.setEndpoint(this.selectedDbConnection);
      this.state.setCurrentContext(ctx);
    }

    if (this.selectedRepoFolder) {
      this.loadProjectFiles();
    }
  }

  public onRepoChange(): void {
    if (!this.selectedRepoFolder) {
      this.syncProjectAssociation();
      return;
    }

    this.projectId = this.selectedRepoFolder;
    this.state.setSelectedRepo(this.selectedRepoFolder);
    this.loadProjectFiles();
  }

  public pullRepo(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    this.showAuthAction = false;
    this.setStatus(`Pulling latest changes for branch '${this.currentBranch || this.branchName}'...`, false);
    this.isLoading = true;
    this.restService.pullRepository$(targetId, this.currentBranch || this.branchName).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res && res.success === false) {
          this.handleGitOperationError('Git pull', res.error || res.message || 'Pull failed');
          return;
        }
        this.setStatus(`Git pull completed: ${res.summary || 'up to date'}`, false);
        this.snackBar.open(`Git pull completed: ${res.summary || 'up to date'}`, 'Dismiss', { duration: 4000 });
        this.loadProjectFiles();
        if (this.selectedFilePath) {
          this.loadFileContent();
        }
      },
      error: (err) => {
        this.isLoading = false;
        const rawMsg = err.error?.error || err.error?.message || err.message || 'Unknown error';
        this.handleGitOperationError('Git pull', rawMsg);
      }
    });
  }

  public cloneNewRepo(): void {
    if (!this.cloneRemoteUrl || !this.cloneFolderName) {
      this.setStatus('Please enter both Git Remote URL and Folder Name', true);
      return;
    }

    this.showAuthAction = false;
    this.setStatus(`Cloning ${this.cloneRemoteUrl} into ${this.baseReposDir}/${this.cloneFolderName}...`, false);
    this.restService.cloneRepository$(this.cloneRemoteUrl, this.cloneFolderName).subscribe({
      next: (res) => {
        if (res.success) {
          this.setStatus(res.message || `Cloned ${this.cloneFolderName} successfully`, false);
          this.snackBar.open(res.message || `Cloned ${this.cloneFolderName} successfully`, 'Dismiss', { duration: 4000 });
          this.showCloneForm = false;
          this.selectedRepoFolder = res.folderName;
          this.cloneRemoteUrl = '';
          this.cloneFolderName = '';
          this.loadLocalRepos();
        } else {
          this.handleGitOperationError('Clone', res.message || 'Clone failed');
        }
      },
      error: (err) => {
        const rawMsg = err.error?.error || err.error?.message || err.message || 'Unknown error';
        this.handleGitOperationError('Clone', rawMsg);
      }
    });
  }

  public loadProjectFiles(): void {
    if (!this.selectedRepoFolder) {
      this.isLoading = false;
      this.projectFiles = [];
      this.filteredFiles = [];
      this.fileTreeNodes = [];
      this.selectedFilePath = '';
      this.activeFileContent = '';
      return;
    }
    const targetId = this.selectedRepoFolder;

    this.restService.listGitFiles$(targetId).subscribe({
      next: (res) => {
        this.projectFiles = res.files || [];
        this.applyFileFilter();

        const paramFile = this.route.snapshot.queryParams['file'];
        if (paramFile && this.projectFiles.includes(paramFile)) {
          this.selectedFilePath = paramFile;
        } else if (this.selectedFilePath && this.projectFiles.includes(this.selectedFilePath)) {
          // Keep existing selectedFilePath
        } else if (this.projectFiles.length > 0) {
          this.selectedFilePath = this.projectFiles[0];
        }

        this.loadDbMapData();
        this.loadBranches();
        if (this.selectedFilePath) {
          this.openFile(this.selectedFilePath);
        } else {
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.setStatus(`Error loading files for repository '${targetId}': ${err.message}`, true);
        this.isLoading = false;
      }
    });
  }

  public loadBranches(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    this.restService.getGitBranches$(targetId).subscribe({
      next: (res) => {
        this.currentBranch = res.currentBranch || 'main';
        this.availableBranches = res.branches || [this.currentBranch];
        // Default the commit modal branchName to currentBranch
        this.branchName = this.currentBranch;
      },
      error: (err) => {
        logger: console.warn('Could not load branches:', err.message);
      }
    });
  }

  public onBranchChange(newBranch: string): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId || !newBranch || newBranch === this.currentBranch) return;

    this.setStatus(`Switching to branch '${newBranch}'...`, false);
    this.restService.switchGitBranch$(targetId, newBranch).subscribe({
      next: () => {
        this.currentBranch = newBranch;
        this.branchName = newBranch;
        this.setStatus(`Switched to branch '${newBranch}'`, false);
        this.loadBranches();
        this.loadProjectFiles();
      },
      error: (err) => {
        this.setStatus(`Failed to switch branch: ${err.message}`, true);
      }
    });
  }

  public createNewBranch(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId || !this.newBranchName.trim()) return;

    const branch = this.newBranchName.trim();
    this.setStatus(`Creating and switching to branch '${branch}'...`, false);
    this.restService.switchGitBranch$(targetId, branch, true).subscribe({
      next: () => {
        this.currentBranch = branch;
        this.branchName = branch;
        this.newBranchName = '';
        this.showNewBranchInput = false;
        this.setStatus(`Created and checked out new branch '${branch}'`, false);
        this.loadBranches();
        this.loadProjectFiles();
      },
      error: (err) => {
        this.setStatus(`Failed to create branch: ${err.message}`, true);
      }
    });
  }

  public toggleNewFileInput(): void {
    if (!this.selectedRepoFolder) {
      this.setStatus('Please select a repository first', true);
      return;
    }
    this.showNewFileInput = !this.showNewFileInput;
    if (this.showNewFileInput) {
      setTimeout(() => {
        this.newFileInputRef?.nativeElement?.focus();
      }, 50);
    }
  }

  public cancelNewFile(): void {
    this.showNewFileInput = false;
    this.newFilePath = '';
  }

  public createNewFile(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) {
      this.setStatus('Please select a repository first', true);
      return;
    }

    let filePath = (this.newFilePath || '').trim();
    if (!filePath) {
      this.setStatus('Please enter a valid file path', true);
      return;
    }

    // Normalize path separators and remove leading slashes
    filePath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

    if (filePath.includes('..')) {
      this.setStatus("File path cannot contain '..'", true);
      return;
    }

    // If file already exists in project, simply open it
    if (this.projectFiles.includes(filePath)) {
      this.setStatus(`File '${filePath}' already exists. Opening existing file.`, false);
      this.cancelNewFile();
      this.openFile(filePath);
      return;
    }

    this.setStatus(`Creating file '${filePath}'...`, false);
    this.isLoading = true;

    this.restService.saveGitFile$(targetId, filePath, '').subscribe({
      next: () => {
        this.setStatus(`Successfully created '${filePath}'`, false);
        this.cancelNewFile();
        this.restService.listGitFiles$(targetId).subscribe({
          next: (res) => {
            this.isLoading = false;
            this.projectFiles = res.files || [];
            this.applyFileFilter();
            this.openFile(filePath);
            setTimeout(() => {
              this.monacoEditor?.focus();
            }, 200);
          },
          error: (err) => {
            this.isLoading = false;
            this.setStatus(`File created, but failed to reload file list: ${err.message}`, true);
          }
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.setStatus(`Failed to create file '${filePath}': ${err.message}`, true);
      }
    });
  }

  public confirmDeleteFile(filePath: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!filePath) return;
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) {
      this.setStatus('Please select a repository first', true);
      return;
    }

    if (this.confirmDeleteDialog) {
      const dialogRef = this.dialog.open(this.confirmDeleteDialog, {
        data: { filePath },
        width: '420px'
      });

      dialogRef.afterClosed().subscribe(confirmed => {
        if (confirmed) {
          this.executeDeleteFile(filePath);
        }
      });
    } else {
      if (confirm(`Are you sure you want to delete '${filePath}' from repository '${targetId}'?`)) {
        this.executeDeleteFile(filePath);
      }
    }
  }

  public executeDeleteFile(filePath: string): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    this.setStatus(`Deleting '${filePath}'...`, false);
    this.isLoading = true;

    this.restService.deleteGitFile$(targetId, filePath).subscribe({
      next: () => {
        this.isLoading = false;
        this.setStatus(`Deleted '${filePath}' successfully`, false);

        if (this.selectedFilePath === filePath) {
          this.selectedFilePath = '';
          this.activeFileContent = '';
          this.originalContent = '';
          this.modifiedContent = '';
          if (this.monacoEditor) {
            this.monacoEditor.setValue('');
          }
          if ((this.router.url || '').includes('/workbench')) {
            const currentParams = { ...this.route.snapshot.queryParams };
            delete currentParams['file'];
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: currentParams,
              replaceUrl: true
            });
          }
        }

        this.loadProjectFiles();
      },
      error: (err) => {
        this.isLoading = false;
        this.setStatus(`Failed to delete '${filePath}': ${err.error?.error || err.message}`, true);
      }
    });
  }

  public applyFileFilter(): void {
    if (!this.fileFilterQuery) {
      this.filteredFiles = [...this.projectFiles];
    } else {
      const q = this.fileFilterQuery.toLowerCase();
      this.filteredFiles = this.projectFiles.filter(f => {
        if (f.toLowerCase().includes(q)) return true;
        if (this.dbMapData && this.dbMapData.files && this.dbMapData.files[f]) {
          return this.dbMapData.files[f].some((obj: string) => obj.toLowerCase().includes(q));
        }
        return false;
      });
    }
    this.rebuildFileTree();
  }

  public rebuildFileTree(): void {
    this.fileTreeNodes = this.buildFileTree(this.filteredFiles);
    if (this.selectedFilePath) {
      this.expandPathToNode(this.selectedFilePath);
    }
    try {
      this.cdRef.detectChanges();
    } catch (e) {}
  }

  public expandPathToNode(filePath: string): void {
    if (!filePath || !this.fileTreeNodes) return;
    const parts = filePath.split('/');
    let currentLevel = this.fileTreeNodes;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const found = currentLevel.find(node => node.name === part && node.type === 'folder');
      if (found) {
        found.expanded = true;
        if (found.children) {
          currentLevel = found.children;
        }
      }
    }
  }

  private buildFileTree(filePaths: string[]): FileTreeNode[] {
    const root: FileTreeNode[] = [];
    const isFiltering = !!this.fileFilterQuery;

    for (const filePath of filePaths) {
      const parts = filePath.split('/');
      let currentLevel = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = (i === parts.length - 1);
        const currentPath = parts.slice(0, i + 1).join('/');

        let existingNode = currentLevel.find(node => node.name === part);

        if (!existingNode) {
          const badges = isFile && this.dbMapData?.files?.[currentPath] ? this.dbMapData.files[currentPath] : undefined;
          const displayBadges = badges && badges.length > 0 ? badges.slice(0, 2) : undefined;
          const extraCount = badges && badges.length > 2 ? badges.length - 2 : 0;
          existingNode = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            expanded: isFiltering,
            children: isFile ? undefined : [],
            dbBadges: displayBadges,
            extraBadgeCount: extraCount
          };
          currentLevel.push(existingNode);
        }

        if (!isFile) {
          currentLevel = existingNode.children!;
        }
      }
    }

    const sortNodes = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.children) sortNodes(node.children);
      }
    };

    sortNodes(root);
    return root;
  }

  public loadDbMapData(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) {
      this.dbMapData = null;
      this.rebuildFileTree();
      return;
    }

    const loadLegacy = () => {
      this.restService.getGitFile$(targetId, '.visulate/oracle-code-map.json').subscribe({
        next: (res) => {
          try {
            this.dbMapData = JSON.parse(res.content);
            this.updateCurrentFileDbObjects();
            this.rebuildFileTree();
          } catch (e) {
            loadOkfLegacy();
          }
        },
        error: () => {
          loadOkfLegacy();
        }
      });
    };

    const loadOkfLegacy = () => {
      this.restService.getGitFile$(targetId, '.okf/oracle-code-map.json').subscribe({
        next: (res) => {
          try {
            this.dbMapData = JSON.parse(res.content);
            this.updateCurrentFileDbObjects();
            this.rebuildFileTree();
          } catch (e) {
            this.dbMapData = null;
            this.rebuildFileTree();
          }
        },
        error: () => {
          this.dbMapData = null;
          this.rebuildFileTree();
        }
      });
    };

    if (this.selectedDbConnection) {
      const db = this.selectedDbConnection.toLowerCase().trim();
      const visulateDbPath = `.visulate/${db}/oracle-code-map.json`;
      const okfDbPath = `.okf/${db}/oracle-code-map.json`;

      const loadOkfDb = () => {
        this.restService.getGitFile$(targetId, okfDbPath).subscribe({
          next: (res) => {
            try {
              this.dbMapData = JSON.parse(res.content);
              this.updateCurrentFileDbObjects();
              this.rebuildFileTree();
            } catch (e) {
              loadLegacy();
            }
          },
          error: () => {
            loadLegacy();
          }
        });
      };

      this.restService.getGitFile$(targetId, visulateDbPath).subscribe({
        next: (res) => {
          try {
            this.dbMapData = JSON.parse(res.content);
            this.updateCurrentFileDbObjects();
            this.rebuildFileTree();
          } catch (e) {
            loadOkfDb();
          }
        },
        error: () => {
          loadOkfDb();
        }
      });
    } else {
      loadLegacy();
    }
  }

  public openFile(filePath: string): void {
    if (!filePath) return;
    this.selectedFilePath = filePath;
    this.state.setLastSelectedFile(filePath, this.selectedRepoFolder || this.projectId);
    this.updateCurrentFileDbObjects();
    this.loadFileContent();

    const url = this.router.url || '';
    if (!url.includes('/workbench')) {
      return;
    }

    const targetProject = this.selectedRepoFolder || this.projectId;
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['file'] !== filePath || currentParams['projectId'] !== targetProject || currentParams['db'] !== this.selectedDbConnection) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          db: this.selectedDbConnection,
          file: filePath,
          projectId: targetProject
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  public updateCurrentFileDbObjects(): void {
    if (this.dbMapData && this.dbMapData.files && this.selectedFilePath) {
      this.currentFileDbObjects = this.dbMapData.files[this.selectedFilePath] || [];
    } else {
      this.currentFileDbObjects = [];
    }
  }

  public getFileDbBadge(filePath: string): string[] {
    if (this.dbMapData && this.dbMapData.files && this.dbMapData.files[filePath]) {
      return this.dbMapData.files[filePath];
    }
    return [];
  }

  public loadFileContent(): void {
    if (!this.selectedFilePath) return;
    const targetId = this.selectedRepoFolder || this.projectId;
    this.isLoading = true;
    this.setStatus(`Loading ${this.selectedFilePath}...`, false);

    if (this.viewMode === 'editor') {
      this.restService.getGitFile$(targetId, this.selectedFilePath).subscribe({
        next: (res) => {
          this.activeFileContent = res.content || '';
          try {
            this.updateSingleEditorModel();
          } catch (e) {
            console.error('Error setting editor model:', e);
          }
          this.isLoading = false;
          this.setStatus(`Loaded ${this.selectedFilePath}`, false);
        },
        error: (err) => {
          this.setStatus(`Error loading file: ${err.message}`, true);
          this.isLoading = false;
        }
      });
    } else {
      // Diff mode
      this.restService.getGitFile$(targetId, this.selectedFilePath, 'HEAD').subscribe({
        next: (origRes) => {
          this.originalContent = origRes.content || '';
          this.restService.getGitFile$(targetId, this.selectedFilePath).subscribe({
            next: (modRes) => {
              this.modifiedContent = modRes.content || '';
              try {
                this.updateDiffEditorModels();
              } catch (e) {
                console.error('Error setting diff models:', e);
              }
              this.isLoading = false;
              this.setStatus(`Loaded diff for ${this.selectedFilePath}`, false);
            },
            error: () => {
              this.modifiedContent = this.originalContent;
              try {
                this.updateDiffEditorModels();
              } catch (e) {
                console.error('Error setting diff models:', e);
              }
              this.isLoading = false;
            }
          });
        },
        error: () => {
          this.restService.getGitFile$(targetId, this.selectedFilePath).subscribe({
            next: (modRes) => {
              this.originalContent = '';
              this.modifiedContent = modRes.content || '';
              try {
                this.updateDiffEditorModels();
              } catch (e) {
                console.error('Error setting diff models:', e);
              }
              this.isLoading = false;
            },
            error: () => {
              this.isLoading = false;
            }
          });
        }
      });
    }
  }

  public toggleViewMode(mode: 'editor' | 'diff'): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.initMonaco();
    this.loadFileContent();
  }

  private initMonaco(): void {
    if (typeof monaco !== 'undefined') {
      this.setupMonacoEditor();
    } else {
      this.loadMonacoScript(() => this.setupMonacoEditor());
    }
  }

  private loadMonacoScript(callback: () => void): void {
    const windowObj = window as any;
    if (windowObj.monaco) {
      this.monacoLoaded = true;
      callback();
      return;
    }
    if (windowObj.require && windowObj.require.config) {
      try {
        windowObj.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
        windowObj.require(['vs/editor/editor.main'], () => {
          this.monacoLoaded = true;
          callback();
        });
        return;
      } catch (e) {
        console.warn('Require config error:', e);
      }
    }

    const loaderScript = document.createElement('script');
    loaderScript.type = 'text/javascript';
    loaderScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.js';
    loaderScript.onload = () => {
      try {
        windowObj.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
        windowObj.require(['vs/editor/editor.main'], () => {
          this.monacoLoaded = true;
          callback();
        });
      } catch (e) {
        console.warn('Monaco require error:', e);
        this.monacoLoaded = false;
        this.isLoading = false;
      }
    };
    loaderScript.onerror = (err) => {
      console.warn('Monaco CDN script failed to load:', err);
      this.monacoLoaded = false;
      this.isLoading = false;
    };
    document.body.appendChild(loaderScript);
  }

  private detectLanguage(filename: string): string {
    if (!filename) return 'plaintext';
    if (filename.endsWith('.sql') || filename.endsWith('.pks') || filename.endsWith('.pkb') || filename.endsWith('.pls')) {
      return 'sql';
    }
    if (filename.endsWith('.php')) return 'php';
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
    if (filename.endsWith('.md')) return 'markdown';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.java')) return 'java';
    if (filename.endsWith('.html') || filename.endsWith('.htm')) return 'html';
    if (filename.endsWith('.css') || filename.endsWith('.scss')) return 'css';
    return 'plaintext';
  }

  private registerCustomThemes(): void {
    if (typeof monaco === 'undefined' || !monaco.editor) return;

    try {
      monaco.editor.defineTheme('visulate-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#fdf6e3',
          'editorGutter.background': '#eee8d5',
          'minimap.background': '#fdf6e3',
          'diffEditor.insertedTextBackground': 'rgba(108, 153, 0, 0.15)',
          'diffEditor.removedTextBackground': 'rgba(220, 50, 47, 0.15)'
        }
      });

      monaco.editor.defineTheme('visulate-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#121212',
          'editorGutter.background': '#1e1e1e',
          'minimap.background': '#121212'
        }
      });
    } catch (e) {
      console.warn('Could not define custom monaco themes:', e);
    }
  }

  private updateMonacoTheme(): void {
    if (typeof monaco !== 'undefined' && monaco && monaco.editor) {
      this.registerCustomThemes();
      monaco.editor.setTheme(this.isDarkMode ? 'visulate-dark' : 'visulate-light');
    }
  }

  private setupMonacoEditor(): void {
    if (!this.editorContainer || !this.editorContainer.nativeElement) return;

    this.registerCustomThemes();

    if (this.viewMode === 'editor' && this.monacoEditor) {
      this.updateSingleEditorModel();
      this.updateMonacoTheme();
      return;
    }
    if (this.viewMode === 'diff' && this.diffEditor) {
      this.updateDiffEditorModels();
      this.updateMonacoTheme();
      return;
    }

    this.disposeEditors();

    const currentTheme = this.isDarkMode ? 'visulate-dark' : 'visulate-light';

    if (this.viewMode === 'editor') {
      this.monacoEditor = monaco.editor.create(this.editorContainer.nativeElement, {
        theme: currentTheme,
        automaticLayout: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false
      });

      this.updateSingleEditorModel();

      this.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        this.saveDraft();
      });
    } else {
      this.diffEditor = monaco.editor.createDiffEditor(this.editorContainer.nativeElement, {
        theme: currentTheme,
        automaticLayout: true,
        originalEditable: false,
        readOnly: false
      });

      this.updateDiffEditorModels();

      const modifiedEditor = this.diffEditor.getModifiedEditor();
      modifiedEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        this.saveDraft();
      });
    }

    this.monacoLoaded = true;
    setTimeout(() => {
      if (this.monacoEditor) this.monacoEditor.layout();
      if (this.diffEditor) this.diffEditor.layout();
    }, 100);
  }

  private updateSingleEditorModel(): void {
    if (typeof monaco === 'undefined') {
      this.initMonaco();
      return;
    }

    if (!this.monacoEditor && this.viewMode === 'editor') {
      this.setupMonacoEditor();
      return;
    }

    if (!this.monacoEditor) return;

    const lang = this.detectLanguage(this.selectedFilePath);
    const safePath = (this.selectedFilePath || 'untitled').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uri = monaco.Uri.parse(`inmemory://workbench/${safePath}`);

    try {
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(this.activeFileContent || '', lang, uri);
      } else {
        model.setValue(this.activeFileContent || '');
        monaco.editor.setModelLanguage(model, lang);
      }

      this.monacoEditor.setModel(model);
    } catch (e) {
      console.warn('Fallback monaco model creation:', e);
      const fallbackModel = monaco.editor.createModel(this.activeFileContent || '', lang);
      this.monacoEditor.setModel(fallbackModel);
    }

    setTimeout(() => {
      if (this.monacoEditor) {
        this.monacoEditor.layout();
      }
    }, 50);
  }

  private updateDiffEditorModels(): void {
    if (typeof monaco === 'undefined') return;

    if (!this.diffEditor && this.viewMode === 'diff') {
      this.setupMonacoEditor();
      return;
    }

    if (!this.diffEditor) return;

    const lang = this.detectLanguage(this.selectedFilePath);

    if (this.originalModel) this.originalModel.dispose();
    if (this.modifiedModel) this.modifiedModel.dispose();

    this.originalModel = monaco.editor.createModel(this.originalContent, lang);
    this.modifiedModel = monaco.editor.createModel(this.modifiedContent, lang);

    this.diffEditor.setModel({
      original: this.originalModel,
      modified: this.modifiedModel
    });
  }

  public saveDraft(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!this.selectedFilePath || !targetId) return;

    let contentToSave = '';
    if (this.viewMode === 'editor' && this.monacoEditor) {
      contentToSave = this.monacoEditor.getValue();
    } else if (this.viewMode === 'diff' && this.modifiedModel) {
      contentToSave = this.modifiedModel.getValue();
    } else {
      return;
    }

    this.setStatus('Saving file to workspace...', false);

    this.restService.saveGitFile$(targetId, this.selectedFilePath, contentToSave).subscribe({
      next: () => {
        this.setStatus(`Successfully saved ${this.selectedFilePath}`, false);
        this.loadDbMapData();
      },
      error: (err) => {
        this.setStatus(`Error saving file: ${err.message}`, true);
      }
    });
  }

  public commitAndPush(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    let contentToSave = '';
    if (this.viewMode === 'editor' && this.monacoEditor) {
      contentToSave = this.monacoEditor.getValue();
    } else if (this.viewMode === 'diff' && this.modifiedModel) {
      contentToSave = this.modifiedModel.getValue();
    }

    const executeCommit = () => {
      this.showAuthAction = false;
      this.setStatus('Committing and pushing to Git remote...', false);
      this.restService.commitAndPush$(targetId, this.branchName, this.commitMessage).subscribe({
        next: (res: any) => {
          if (res && res.success === false) {
            const errorMsg = res.error || res.push?.error || res.commit?.error || 'Commit & Push failed';
            this.handleGitOperationError('Commit/Push', errorMsg);
            return;
          }
          this.setStatus(`Successfully committed and pushed branch '${this.branchName}'`, false);
          this.snackBar.open(`Successfully committed and pushed branch '${this.branchName}'`, 'Dismiss', { duration: 4000 });
          this.loadProjectFiles();
        },
        error: (err: any) => {
          const rawMsg = err.error?.error || err.error?.message || err.message || 'Unknown error';
          this.handleGitOperationError('Commit/Push', rawMsg);
        }
      });
    };

    if (this.selectedFilePath && contentToSave) {
      this.setStatus('Saving file to workspace before commit...', false);
      this.restService.saveGitFile$(targetId, this.selectedFilePath, contentToSave).subscribe({
        next: () => {
          this.loadDbMapData();
          executeCommit();
        },
        error: (err) => {
          const rawMsg = err.error?.error || err.error?.message || err.message || 'Unknown error';
          this.setStatus(`Save failed before commit: ${rawMsg}`, true);
          this.snackBar.open(`Save failed before commit: ${rawMsg}`, 'Dismiss', { duration: 5000 });
        }
      });
    } else {
      executeCommit();
    }
  }

  public runIndexDependencies(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    this.setStatus('Indexing database-to-code dependencies...', false);
    this.restService.indexDependencies$(targetId, undefined, this.selectedDbConnection).subscribe({
      next: () => {
        const targetDb = this.selectedDbConnection ? this.selectedDbConnection.toLowerCase().trim() : '';
        const savedLoc = targetDb ? `.visulate/${targetDb}/` : '.visulate/';
        this.setStatus(`Dependency mapping completed. Saved to ${savedLoc}oracle-code-map.json & codebase-dependencies.md`, false);
        this.loadProjectFiles();
      },
      error: (err) => {
        this.setStatus(`Indexing failed: ${err.message}`, true);
      }
    });
  }

  public openDatabaseObject(objName: string): void {
    if (!this.selectedDbConnection || !objName) return;

    if (this.dbMapData && this.dbMapData.objects && this.dbMapData.objects[objName]) {
      const objInfo = this.dbMapData.objects[objName];
      if (objInfo.owner && objInfo.type) {
        this.router.navigate(['/database', this.selectedDbConnection, objInfo.owner, objInfo.type, objName]);
        return;
      }
    }

    const ctx = this.state.getCurrentContext();
    let currentSchema = (ctx && ctx.endpoint === this.selectedDbConnection && ctx.owner) ? ctx.owner : '';

    const ep = this.dbEndpoints?.find(e => e.endpoint === this.selectedDbConnection);
    const isPostgres = (ep && ep.description && ep.description.toLowerCase().includes('postgres')) || this.selectedDbConnection.toLowerCase().includes('postgres');

    if (!currentSchema) {
      currentSchema = isPostgres ? 'public' : '';
    }

    let guessedType = 'TABLE';
    const upper = objName.toUpperCase();
    if (upper.endsWith('_V') || upper.endsWith('_VW') || upper.endsWith('_VIEW')) {
      guessedType = 'VIEW';
    } else if (upper.endsWith('_PKG') || upper.endsWith('_PACKAGE')) {
      guessedType = 'PACKAGE';
    } else if (upper.endsWith('_SEQ')) {
      guessedType = 'SEQUENCE';
    }

    this.restService.getDbSearch$(objName).subscribe({
      next: (searchResults: any) => {
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          const match = searchResults.find((r: any) => r.endpoint === this.selectedDbConnection);
          if (match && match.owner && match.object_type) {
            this.router.navigate(['/database', this.selectedDbConnection, match.owner, match.object_type, match.object_name || objName]);
            return;
          }
        }
        const targetSchema = currentSchema || (isPostgres ? 'public' : '');
        if (targetSchema) {
          this.router.navigate(['/database', this.selectedDbConnection, targetSchema, guessedType, objName]);
        } else {
          this.router.navigate(['/database', this.selectedDbConnection]);
        }
      },
      error: () => {
        const targetSchema = currentSchema || (isPostgres ? 'public' : '');
        if (targetSchema) {
          this.router.navigate(['/database', this.selectedDbConnection, targetSchema, guessedType, objName]);
        } else {
          this.router.navigate(['/database', this.selectedDbConnection]);
        }
      }
    });
  }

  private statusTimer: any = null;

  private setStatus(msg: string, error: boolean, isAuth: boolean = false): void {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }

    this.statusMessage = msg;
    this.isError = error;
    this.showAuthAction = isAuth;
    try {
      this.cdRef.detectChanges();
    } catch (e) {}

    if (!error && msg) {
      this.statusTimer = setTimeout(() => {
        this.statusMessage = '';
        this.showAuthAction = false;
        try {
          this.cdRef.detectChanges();
        } catch (e) {}
      }, 3000);
    }
  }

  get mappedObjectCount(): number {
    return this.dbMapData?.objects ? Object.keys(this.dbMapData.objects).length : 0;
  }

  public trackByNodePath(index: number, node: FileTreeNode): string {
    return node ? node.path : String(index);
  }

  public trackByString(index: number, item: string): string {
    return item;
  }

  public trackByDbEndpoint(index: number, db: { endpoint: string; description: string }): string {
    return db ? db.endpoint : String(index);
  }

  public trackByRepoFolder(index: number, repo: { folderName: string }): string {
    return repo ? repo.folderName : String(index);
  }
}
