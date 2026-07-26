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

import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RestService } from '../../services/rest.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

declare var monaco: any;

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  expanded?: boolean;
  dbBadges?: string[];
}

@Component({
  selector: 'app-monaco-diff',
  templateUrl: './monaco-diff.component.html',
  styleUrls: ['./monaco-diff.component.css'],
  standalone: false
})
export class MonacoDiffComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: false }) editorContainer!: ElementRef;

  @Input() projectId: string = 'default-project';
  @Input() selectedFilePath: string = '';

  public baseReposDir: string = '';
  public localRepos: Array<{ folderName: string; fullPath: string; isGitRepo: boolean }> = [];
  public dbEndpoints: Array<{ endpoint: string; description: string }> = [];
  public projectsList: any[] = [];

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

  constructor(
    private restService: RestService,
    private route: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['projectId']) this.projectId = params['projectId'];
      if (params['file']) this.selectedFilePath = params['file'];
      if (params['db']) this.selectedDbConnection = params['db'];
    });

    this.initWorkbenchData();
  }

  public initWorkbenchData(): void {
    this.isLoading = true;
    this.setStatus('Initializing Workbench & loading repository context...', false);

    forkJoin({
      endpoints: this.restService.getDatabaseConnections$().pipe(catchError(() => of([]))),
      repos: this.restService.getLocalRepositories$().pipe(catchError(() => of({ baseDir: '', repositories: [] }))),
      projects: this.restService.getProjects$().pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ endpoints, repos, projects }) => {
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
        this.projectsList = projects || [];

        if (!this.selectedDbConnection && this.dbEndpoints.length > 0) {
          this.selectedDbConnection = this.dbEndpoints[0].endpoint;
        }
        if (!this.selectedRepoFolder && this.localRepos.length > 0) {
          this.selectedRepoFolder = this.localRepos[0].folderName;
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
            this.selectedDbConnection = this.dbEndpoints[0].endpoint;
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
            this.selectedDbConnection = this.dbEndpoints[0].endpoint;
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
        if (this.localRepos.length > 0 && !this.selectedRepoFolder) {
          this.selectedRepoFolder = this.localRepos[0].folderName;
        }
        this.syncProjectAssociation();
      },
      error: (err) => {
        this.setStatus(`Error discovering git repositories: ${err.message}`, true);
      }
    });
  }

  public loadProjects(): void {
    this.restService.getProjects$().subscribe({
      next: (projects) => {
        this.projectsList = projects || [];
        this.syncProjectAssociation();
      },
      error: (err) => console.warn('Error loading projects:', err)
    });
  }

  public syncProjectAssociation(): void {
    if (!this.selectedDbConnection) {
      if (this.dbEndpoints && this.dbEndpoints.length > 0) {
        this.selectedDbConnection = this.dbEndpoints[0].endpoint;
      } else {
        this.selectedDbConnection = 'pdb21';
      }
    }
    if (!this.selectedRepoFolder) {
      if (this.localRepos && this.localRepos.length > 0) {
        this.selectedRepoFolder = this.localRepos[0].folderName;
      } else {
        this.selectedRepoFolder = 'visulate';
      }
    }

    const existing = this.projectsList.find(p => p.dbConnectionId === this.selectedDbConnection);
    if (existing) {
      this.selectedRepoFolder = existing.repoFolder || existing.projectId;
      this.projectId = existing.projectId;
    } else if (this.selectedRepoFolder) {
      this.projectId = `${this.selectedDbConnection}-${this.selectedRepoFolder}`;
    }
    this.loadProjectFiles();
  }

  public onDbOrRepoChange(): void {
    if (!this.selectedDbConnection || !this.selectedRepoFolder) return;

    const projData = {
      projectId: `${this.selectedDbConnection}-${this.selectedRepoFolder}`,
      name: `${this.selectedDbConnection} (${this.selectedRepoFolder})`,
      dbConnectionId: this.selectedDbConnection,
      repoFolder: this.selectedRepoFolder
    };

    this.restService.saveProject$(projData).subscribe({
      next: (savedProj) => {
        this.projectId = savedProj.projectId;
        this.setStatus(`Associated database '${this.selectedDbConnection}' with repository '${this.selectedRepoFolder}'`, false);
        this.loadProjectFiles();
      },
      error: (err) => {
        this.setStatus(`Failed to associate project: ${err.message}`, true);
      }
    });
  }

  public cloneNewRepo(): void {
    if (!this.cloneRemoteUrl || !this.cloneFolderName) {
      this.setStatus('Please enter both Git Remote URL and Folder Name', true);
      return;
    }

    this.setStatus(`Cloning ${this.cloneRemoteUrl} into ${this.baseReposDir}/${this.cloneFolderName}...`, false);
    this.restService.cloneRepository$(this.cloneRemoteUrl, this.cloneFolderName).subscribe({
      next: (res) => {
        if (res.success) {
          this.setStatus(res.message || `Cloned ${this.cloneFolderName} successfully`, false);
          this.showCloneForm = false;
          this.selectedRepoFolder = res.folderName;
          this.cloneRemoteUrl = '';
          this.cloneFolderName = '';
          this.loadLocalRepos();
        } else {
          this.setStatus(`Clone failed: ${res.message}`, true);
        }
      },
      error: (err) => {
        this.setStatus(`Clone error: ${err.message}`, true);
      }
    });
  }

  public loadProjectFiles(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) {
      this.isLoading = false;
      return;
    }

    this.restService.listGitFiles$(targetId).subscribe({
      next: (res) => {
        this.projectFiles = res.files || [];
        this.applyFileFilter();

        if (!this.selectedFilePath && this.projectFiles.length > 0) {
          this.selectedFilePath = this.projectFiles[0];
        }

        this.loadDbMapData();
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
          existingNode = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            expanded: isFiltering,
            children: isFile ? undefined : [],
            dbBadges: badges
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
  }

  public openFile(filePath: string): void {
    this.selectedFilePath = filePath;
    this.updateCurrentFileDbObjects();
    this.loadFileContent();
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
          this.updateSingleEditorModel();
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
              this.updateDiffEditorModels();
              this.isLoading = false;
              this.setStatus(`Loaded diff for ${this.selectedFilePath}`, false);
            },
            error: () => {
              this.modifiedContent = this.originalContent;
              this.updateDiffEditorModels();
              this.isLoading = false;
            }
          });
        },
        error: () => {
          this.restService.getGitFile$(targetId, this.selectedFilePath).subscribe({
            next: (modRes) => {
              this.originalContent = '';
              this.modifiedContent = modRes.content || '';
              this.updateDiffEditorModels();
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

  private setupMonacoEditor(): void {
    if (!this.editorContainer || !this.editorContainer.nativeElement) return;

    if (this.viewMode === 'editor' && this.monacoEditor) {
      this.updateSingleEditorModel();
      return;
    }
    if (this.viewMode === 'diff' && this.diffEditor) {
      this.updateDiffEditorModels();
      return;
    }

    this.disposeEditors();

    if (this.viewMode === 'editor') {
      this.monacoEditor = monaco.editor.create(this.editorContainer.nativeElement, {
        theme: 'vs-dark',
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
        theme: 'vs-dark',
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
      this.setStatus('Committing and pushing to Git remote...', false);
      this.restService.commitAndPush$(targetId, this.branchName, this.commitMessage).subscribe({
        next: () => {
          this.setStatus(`Successfully committed and pushed branch '${this.branchName}'`, false);
          this.loadProjectFiles();
        },
        error: (err) => {
          this.setStatus(`Commit/Push failed: ${err.message}`, true);
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
          this.setStatus(`Save failed before commit: ${err.message}`, true);
        }
      });
    } else {
      executeCommit();
    }
  }

  public runIndexDependencies(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    this.setStatus('Indexing database-to-code dependencies...', false);
    this.restService.indexDependencies$(targetId, this.selectedDbConnection).subscribe({
      next: () => {
        this.setStatus('Dependency mapping completed. Saved to .okf/oracle-code-map.json', false);
        this.loadProjectFiles();
      },
      error: (err) => {
        this.setStatus(`Indexing failed: ${err.message}`, true);
      }
    });
  }

  public openDatabaseObject(objName: string): void {
    if (!this.selectedDbConnection || !objName) return;

    // Guess type from common Oracle naming conventions as fallback
    let guessedType = 'TABLE';
    const upper = objName.toUpperCase();
    if (upper.endsWith('_V') || upper.endsWith('_VW') || upper.endsWith('_VIEW')) {
      guessedType = 'VIEW';
    } else if (upper.endsWith('_PKG') || upper.endsWith('_PACKAGE')) {
      guessedType = 'PACKAGE';
    } else if (upper.endsWith('_SEQ')) {
      guessedType = 'SEQUENCE';
    }

    // Call Visulate database catalog search API /find/:name
    this.restService.getDbSearch$(objName).subscribe({
      next: (searchResults: any) => {
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          // Find match for current database connection
          const match = searchResults.find((r: any) => r.endpoint === this.selectedDbConnection) || searchResults[0];
          if (match && match.owner && match.object_type) {
            this.router.navigate(['/database', match.endpoint || this.selectedDbConnection, match.owner, match.object_type, match.object_name || objName]);
            return;
          }
        }
        // Fallback if search returns no exact match
        this.router.navigate(['/database', this.selectedDbConnection, 'RNTMGR2', guessedType, objName]);
      },
      error: () => {
        this.router.navigate(['/database', this.selectedDbConnection, 'RNTMGR2', guessedType, objName]);
      }
    });
  }

  private statusTimer: any = null;

  private setStatus(msg: string, error: boolean): void {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }

    this.statusMessage = msg;
    this.isError = error;
    try {
      this.cdRef.detectChanges();
    } catch (e) {}

    if (!error && msg) {
      this.statusTimer = setTimeout(() => {
        this.statusMessage = '';
        try {
          this.cdRef.detectChanges();
        } catch (e) {}
      }, 3000);
    }
  }
}
