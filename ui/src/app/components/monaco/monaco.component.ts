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
import { MatMenuTrigger } from '@angular/material/menu';
import { GitAuthDialogComponent } from '../git-auth-dialog/git-auth-dialog.component';
import { GitCommitDialogComponent } from '../git-commit-dialog/git-commit-dialog.component';
import { GitStatusDialogComponent } from '../git-status-dialog/git-status-dialog.component';
import { GitRemoteDialogComponent } from '../git-remote-dialog/git-remote-dialog.component';
import { GitAssociationsDialogComponent } from '../git-associations-dialog/git-associations-dialog.component';
import { CopyToRepoDialogComponent } from '../copy-to-repo-dialog/copy-to-repo-dialog.component';
import { ChatComponent } from '../chat/chat.component';
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
  gitStatus?: string;
}

export interface WorkspaceState {
  folderName: string;
  fullPath: string;
  isGitRepo: boolean;
  isMemoryRepo?: boolean;
  hasRemote?: boolean;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  files: string[];
  filteredFiles: string[];
  treeNodes: FileTreeNode[];
  dbMapData: any;
  gitStatus: any;
  gitFileStatusMap: Record<string, string>;
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
  private isDestroyed: boolean = false;

  public baseReposDir: string = '';
  public memoryRepoName: string = 'visulate-memory';
  public localRepos: Array<{ folderName: string; fullPath: string; isGitRepo: boolean; isMemoryRepo?: boolean; hasRemote?: boolean }> = [];
  public dbEndpoints: Array<{ endpoint: string; description: string }> = [];
  public associations: Array<{ db: string; repo: string; role: string }> = [];
  public gitStatus: {
    projectId: string;
    branch: string;
    upstream: string | null;
    remotes: Array<{ name: string; url: string }>;
    hasRemote: boolean;
    isMemoryRepo: boolean;
    ahead: number;
    behind: number;
    files: Array<{ path: string; indexStatus: string; workTreeStatus: string; status: string }>;
  } | null = null;
  public gitFileStatusMap: Record<string, string> = {};
  public workspaceMap: Record<string, WorkspaceState> = {};
  public compareSource: { repo: string; path: string } | null = null;
  public activeCompare: { leftRepo: string; leftPath: string; rightRepo: string; rightPath: string } | null = null;

  public get compareSourceLabel(): string {
    if (!this.compareSource) return '';
    const file = this.compareSource.path.split('/').pop() || this.compareSource.path;
    return `${this.compareSource.repo}/${file}`;
  }

  public get totalGitBadgeCount(): number {
    return this.dirtyFileCount + (this.hasConfiguredRemote ? this.aheadCount : 0);
  }

  public get activeDbRoleLabel(): string | null {
    return this.getRepoRoleForCurrentDb(this.selectedRepoFolder);
  }

  public get activeRemoteName(): string {
    return this.gitStatus?.remotes?.[0]?.name || 'origin';
  }

  public get activeFileLanguageLabel(): string {
    if (!this.selectedFilePath) return '';
    const file = this.selectedFilePath.split('/').pop() || '';
    const ext = file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';
    const map: Record<string, string> = {
      sql: 'SQL', pks: 'PL/SQL', pkb: 'PL/SQL', pls: 'PL/SQL',
      md: 'Markdown', markdown: 'Markdown',
      ts: 'TypeScript', js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
      py: 'Python', java: 'Java', json: 'JSON', yaml: 'YAML', yml: 'YAML',
      html: 'HTML', css: 'CSS', scss: 'SCSS', xml: 'XML', sh: 'Shell',
      pl: 'Perl', pm: 'Perl', conf: 'Config', txt: 'Plain Text'
    };
    return map[ext] || (ext ? ext.toUpperCase() : 'Plain Text');
  }

  public openAppMenu(): void {
    if (typeof this.state.openSidenav === 'function') {
      this.state.openSidenav();
    }
  }

  public closeAppMenu(): void {
    if (typeof this.state.closeSidenav === 'function') {
      this.state.closeSidenav();
    }
  }

  public onSidenavRepoChange(repoName: string): void {
    if (repoName) {
      this.activateWorkspace(repoName, false);
    }
  }

  public get orderedWorkspaces(): WorkspaceState[] {
    this.syncWorkspacesFromLocalRepos();
    const list = Object.values(this.workspaceMap);
    const db = (this.selectedDbConnection || '').toLowerCase();
    const links = this.getEffectiveLinks();
    const linkedRank = (folderName: string): number => {
      if (links.some(l => l.repo === folderName && l.db.toLowerCase() === db)) return 0;
      if (links.some(l => l.repo === folderName && l.db === '*')) return 1;
      if (folderName === this.memoryRepoName) return 2;
      return 3;
    };
    return list.sort((a, b) => {
      const ra = linkedRank(a.folderName);
      const rb = linkedRank(b.folderName);
      if (ra !== rb) return ra - rb;
      return a.folderName.localeCompare(b.folderName);
    });
  }

  public getRepoRoleForCurrentDb(repoName: string): string | null {
    if (!repoName || repoName === this.memoryRepoName) return null;
    const db = (this.selectedDbConnection || '').toLowerCase();
    if (!db) return null;
    const links = this.getEffectiveLinks();
    const exact = links.find(l => l.repo === repoName && l.db.toLowerCase() === db);
    if (exact) return exact.role;
    const wild = links.find(l => l.repo === repoName && l.db === '*');
    if (wild) return wild.role;
    return null;
  }

  public isRepoLinkedToCurrentDb(repoName: string): boolean {
    return !!this.getRepoRoleForCurrentDb(repoName);
  }

  public syncWorkspacesFromLocalRepos(): void {
    const validNames = new Set<string>();
    for (const r of this.localRepos || []) {
      validNames.add(r.folderName);
      const existing = this.workspaceMap[r.folderName];
      if (existing) {
        existing.fullPath = r.fullPath;
        existing.isGitRepo = r.isGitRepo;
        existing.isMemoryRepo = r.isMemoryRepo || r.folderName === this.memoryRepoName;
        existing.hasRemote = r.hasRemote;
      } else {
        this.workspaceMap[r.folderName] = {
          folderName: r.folderName,
          fullPath: r.fullPath,
          isGitRepo: r.isGitRepo,
          isMemoryRepo: r.isMemoryRepo || r.folderName === this.memoryRepoName,
          hasRemote: r.hasRemote,
          expanded: r.folderName === this.selectedRepoFolder,
          loaded: false,
          loading: false,
          files: [],
          filteredFiles: [],
          treeNodes: [],
          dbMapData: null,
          gitStatus: null,
          gitFileStatusMap: {}
        };
      }
    }
    for (const key of Object.keys(this.workspaceMap)) {
      if (!validNames.has(key)) {
        delete this.workspaceMap[key];
      }
    }
  }

  public onNodeContextMenu(event: MouseEvent, trigger: MatMenuTrigger): void {
    event.preventDefault();
    event.stopPropagation();
    trigger.openMenu();
  }

  public toggleWorkspace(ws: WorkspaceState, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    ws.expanded = !ws.expanded;
    if (ws.expanded) {
      this.activateWorkspace(ws.folderName, !ws.loaded);
    }
    this.cdRef.detectChanges();
  }

  public activateWorkspace(repoName: string, forceReloadFiles: boolean = false): void {
    if (!repoName) return;
    this.syncWorkspacesFromLocalRepos();
    const ws = this.workspaceMap[repoName];
    const changed = this.selectedRepoFolder !== repoName;
    this.selectedRepoFolder = repoName;
    this.projectId = repoName;
    this.state.setSelectedRepo(repoName);
    if (ws) {
      ws.expanded = true;
    }

    if (ws && ws.loaded && !forceReloadFiles) {
      this.projectFiles = [...ws.files];
      this.filteredFiles = [...ws.filteredFiles];
      this.fileTreeNodes = ws.treeNodes;
      this.dbMapData = ws.dbMapData;
      this.gitStatus = ws.gitStatus;
      this.gitFileStatusMap = { ...ws.gitFileStatusMap };
      this.updateCurrentFileDbObjects();
      if (changed) {
        this.loadBranches();
        this.loadGitStatusForWorkspace(repoName);
      }
    } else {
      this.loadWorkspaceFiles(repoName, true);
    }
  }

  public loadWorkspaceFiles(repoName: string, setAsActive: boolean = false): void {
    if (!repoName) return;
    this.syncWorkspacesFromLocalRepos();
    const ws = this.workspaceMap[repoName];
    if (ws) {
      ws.loading = true;
    }
    this.restService.listGitFiles$(repoName).subscribe({
      next: (res) => {
        const files = res.files || [];
        if (ws) {
          ws.files = files;
          ws.loaded = true;
          ws.loading = false;
          this.applyFileFilterForWorkspace(ws);
        }
        if (setAsActive || repoName === this.selectedRepoFolder) {
          this.projectFiles = files;
          this.applyFileFilter();
          const paramFile = this.route.snapshot.queryParams['file'];
          if (paramFile && this.projectFiles.includes(paramFile)) {
            this.selectedFilePath = paramFile;
          } else if (this.selectedFilePath && this.projectFiles.includes(this.selectedFilePath)) {
            // keep
          } else if (!this.selectedFilePath && this.projectFiles.length > 0) {
            this.selectedFilePath = this.projectFiles[0];
          }
          this.loadBranches();
          if (this.selectedFilePath && this.projectFiles.includes(this.selectedFilePath)) {
            this.openFile(this.selectedFilePath);
          } else {
            this.isLoading = false;
          }
        }
        this.loadDbMapDataForWorkspace(repoName);
        this.loadGitStatusForWorkspace(repoName);
        this.cdRef.detectChanges();
      },
      error: (err) => {
        if (ws) {
          ws.loading = false;
        }
        this.setStatus(`Error loading files for repository '${repoName}': ${err.message}`, true);
        this.isLoading = false;
      }
    });
  }

  public loadDbMapDataForWorkspace(repoName: string): void {
    if (!repoName) return;
    const ws = this.workspaceMap[repoName];
    if (typeof this.restService.getProjectCodeMap$ === 'function') {
      this.restService.getProjectCodeMap$(repoName, this.selectedDbConnection || undefined).subscribe({
        next: (mapData) => {
          if (ws) {
            ws.dbMapData = mapData || null;
            this.applyFileFilterForWorkspace(ws);
          }
          if (repoName === this.selectedRepoFolder) {
            this.dbMapData = mapData || null;
            this.updateCurrentFileDbObjects();
            this.rebuildFileTree();
          }
          this.cdRef.detectChanges();
        },
        error: () => {
          if (ws) {
            ws.dbMapData = null;
            this.applyFileFilterForWorkspace(ws);
          }
          if (repoName === this.selectedRepoFolder) {
            this.dbMapData = null;
            this.updateCurrentFileDbObjects();
            this.rebuildFileTree();
          }
        }
      });
    }
  }

  public loadGitStatusForWorkspace(repoName: string): void {
    if (!repoName || typeof this.restService.getGitStatus$ !== 'function') return;
    const ws = this.workspaceMap[repoName];
    this.restService.getGitStatus$(repoName).subscribe({
      next: (status) => {
        const map: Record<string, string> = {};
        if (status && Array.isArray(status.files)) {
          for (const f of status.files) {
            map[f.path] = f.status === '?' ? 'U' : f.status;
          }
        }
        if (ws) {
          ws.gitStatus = status;
          ws.gitFileStatusMap = map;
          ws.hasRemote = !!status?.hasRemote;
          this.applyFileFilterForWorkspace(ws);
        }
        if (repoName === this.selectedRepoFolder) {
          this.gitStatus = status;
          this.gitFileStatusMap = map;
          this.rebuildFileTree();
        }
        this.cdRef.detectChanges();
      },
      error: () => {
        if (ws) {
          ws.gitStatus = null;
          ws.gitFileStatusMap = {};
        }
        if (repoName === this.selectedRepoFolder) {
          this.gitStatus = null;
          this.gitFileStatusMap = {};
        }
      }
    });
  }

  public applyFileFilterForWorkspace(ws: WorkspaceState): void {
    if (!this.fileFilterQuery) {
      ws.filteredFiles = [...ws.files];
    } else {
      const q = this.fileFilterQuery.toLowerCase();
      ws.filteredFiles = ws.files.filter(f => {
        if (f.toLowerCase().includes(q)) return true;
        if (ws.dbMapData && ws.dbMapData.files && ws.dbMapData.files[f]) {
          return ws.dbMapData.files[f].some((obj: string) => obj.toLowerCase().includes(q));
        }
        return false;
      });
    }
    ws.treeNodes = this.buildFileTreeForData(ws.filteredFiles, ws.dbMapData, ws.gitFileStatusMap);
    if (this.selectedRepoFolder === ws.folderName && this.selectedFilePath) {
      this.expandPathInNodes(ws.treeNodes, this.selectedFilePath);
    }
  }

  public openFileInWorkspace(repoName: string, filePath: string, mode: 'editor' | 'diff' = 'editor'): void {
    if (!repoName || !filePath) return;
    this.activeCompare = null;
    if (this.selectedRepoFolder !== repoName) {
      this.activateWorkspace(repoName, false);
    }
    if (this.viewMode !== mode) {
      this.viewMode = mode;
      this.initMonaco();
    }
    this.openFile(filePath);
  }

  public selectForCompare(repoName: string, filePath: string): void {
    this.compareSource = { repo: repoName, path: filePath };
    this.setStatus(`Selected '${repoName}/${filePath}' for compare`, false);
    this.snackBar.open(`Selected '${filePath.split('/').pop()}' for compare. Use any file's menu → Compare with Selected.`, 'Dismiss', { duration: 4000 });
    this.cdRef.detectChanges();
  }

  public compareWithSelected(targetRepo: string, targetPath: string): void {
    if (!this.compareSource) return;
    const leftRepo = this.compareSource.repo;
    const leftPath = this.compareSource.path;
    this.isLoading = true;
    this.setStatus(`Comparing ${leftRepo}/${leftPath} with ${targetRepo}/${targetPath}...`, false);

    forkJoin({
      left: this.restService.getGitFile$(leftRepo, leftPath).pipe(catchError(() => of({ content: '' }))),
      right: this.restService.getGitFile$(targetRepo, targetPath).pipe(catchError(() => of({ content: '' })))
    }).subscribe({
      next: ({ left, right }) => {
        this.activeCompare = { leftRepo, leftPath, rightRepo: targetRepo, rightPath: targetPath };
        this.selectedRepoFolder = targetRepo;
        this.projectId = targetRepo;
        this.selectedFilePath = targetPath;
        this.originalContent = left?.content || '';
        this.modifiedContent = right?.content || '';
        this.viewMode = 'diff';
        this.initMonaco();
        try {
          this.updateDiffEditorModels();
        } catch (e) {
          console.error('Error updating compare diff models:', e);
        }
        this.isLoading = false;
        this.setStatus(`Comparing ${leftRepo}/${leftPath} ↔ ${targetRepo}/${targetPath}`, false);
        this.cdRef.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.setStatus(`Compare failed: ${err.message}`, true);
      }
    });
  }

  public clearCustomCompare(): void {
    this.activeCompare = null;
    if (this.selectedFilePath) {
      this.loadFileContent();
    }
    this.cdRef.detectChanges();
  }

  public startNewFileInWorkspace(repoName: string, folderPrefix: string = ''): void {
    this.activateWorkspace(repoName, false);
    this.showNewFileInput = true;
    this.newFilePath = folderPrefix ? `${folderPrefix.replace(/\/+$/, '')}/` : '';
    setTimeout(() => {
      this.newFileInputRef?.nativeElement?.focus();
    }, 50);
  }

  public quickLinkRepoToCurrentDb(repoName: string, role: string = 'app'): void {
    if (!this.selectedDbConnection || !repoName || repoName === this.memoryRepoName) return;
    if (typeof this.restService.saveGitAssociation$ === 'function') {
      this.restService.saveGitAssociation$(this.selectedDbConnection, repoName, role).subscribe({
        next: (res) => {
          this.associations = res.links || [];
          if (typeof this.state.setAssociations === 'function') {
            this.state.setAssociations(this.associations);
          }
          this.setStatus(`Linked '${repoName}' to '${this.selectedDbConnection}' (${role})`, false);
          this.loadGitStatusForWorkspace(this.memoryRepoName);
          this.cdRef.detectChanges();
        },
        error: (err) => this.setStatus(`Failed to link repository: ${err.error?.error || err.message}`, true)
      });
    }
  }

  public quickUnlinkRepoFromCurrentDb(repoName: string): void {
    if (!this.selectedDbConnection || !repoName) return;
    if (typeof this.restService.deleteGitAssociation$ === 'function') {
      this.restService.deleteGitAssociation$(this.selectedDbConnection, repoName).subscribe({
        next: (res) => {
          this.associations = res.links || [];
          if (typeof this.state.setAssociations === 'function') {
            this.state.setAssociations(this.associations);
          }
          this.setStatus(`Unlinked '${repoName}' from '${this.selectedDbConnection}'`, false);
          this.loadGitStatusForWorkspace(this.memoryRepoName);
          this.cdRef.detectChanges();
        },
        error: (err) => this.setStatus(`Failed to unlink repository: ${err.error?.error || err.message}`, true)
      });
    }
  }

  public openAssociationsDialogForRepo(repoName?: string): void {
    const dialogRef = this.dialog.open(GitAssociationsDialogComponent, {
      width: '680px',
      data: {
        databases: this.dbEndpoints,
        repos: this.localRepos,
        links: this.associations,
        defaultDb: this.selectedDbConnection,
        defaultRepo: repoName || this.selectedRepoFolder
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.updated && Array.isArray(res.links)) {
        this.associations = res.links;
        if (typeof this.state.setAssociations === 'function') {
          this.state.setAssociations(res.links);
        }
        this.loadGitStatusForWorkspace(this.memoryRepoName);
        this.cdRef.detectChanges();
      }
    });
  }

  public explainFileFromMenu(repoName: string, filePath: string): void {
    this.openFileInWorkspace(repoName, filePath, 'editor');
    setTimeout(() => this.triggerExplainCode(), 100);
  }

  public discardFileFromMenu(repoName: string, filePath: string): void {
    if (!confirm(`Discard uncommitted changes to '${filePath}' in '${repoName}'?`)) {
      return;
    }
    this.restService.discardGitFile$(repoName, filePath).subscribe({
      next: () => {
        this.setStatus(`Discarded changes to '${filePath}'`, false);
        this.loadWorkspaceFiles(repoName, repoName === this.selectedRepoFolder);
        if (repoName === this.selectedRepoFolder && filePath === this.selectedFilePath) {
          this.loadFileContent();
        }
      },
      error: (err) => {
        this.setStatus(`Failed to discard changes: ${err.error?.error || err.message}`, true);
      }
    });
  }

  public trackByWorkspaceName(index: number, ws: WorkspaceState): string {
    return ws ? ws.folderName : String(index);
  }

  public get isMemoryRepoSelected(): boolean {
    return !!this.selectedRepoFolder && this.selectedRepoFolder === this.memoryRepoName;
  }

  public get dirtyFileCount(): number {
    return this.gitStatus?.files?.length || 0;
  }

  public get aheadCount(): number {
    return this.gitStatus?.ahead || 0;
  }

  public get behindCount(): number {
    return this.gitStatus?.behind || 0;
  }

  public get hasConfiguredRemote(): boolean {
    return !!(this.gitStatus?.hasRemote);
  }

  public get linkedReposForCurrentDb(): Array<{ folderName: string; role?: string; isMemoryRepo?: boolean }> {
    const db = (this.selectedDbConnection || '').toLowerCase();
    if (!db) return [];
    const matchingLinks = this.getEffectiveLinks().filter(l => l.db.toLowerCase() === db || l.db === '*');
    const repoMap = new Map<string, string>();
    matchingLinks.forEach(l => {
      if (!repoMap.has(l.repo) || l.db !== '*') {
        repoMap.set(l.repo, l.role);
      }
    });
    return this.localRepos
      .filter(r => repoMap.has(r.folderName))
      .map(r => ({ folderName: r.folderName, role: repoMap.get(r.folderName), isMemoryRepo: r.isMemoryRepo }));
  }

  public get otherReposForCurrentDb(): Array<{ folderName: string; isMemoryRepo?: boolean }> {
    const linkedSet = new Set(this.linkedReposForCurrentDb.map(r => r.folderName));
    return this.localRepos
      .filter(r => !linkedSet.has(r.folderName))
      .map(r => ({ folderName: r.folderName, isMemoryRepo: r.isMemoryRepo }));
  }

  public get linkedDbEndpointsForCurrentRepo(): Array<{ endpoint: string; description: string; role?: string }> {
    if (!this.selectedRepoFolder || this.isMemoryRepoSelected) return [];
    const links = this.getEffectiveLinks().filter(l => l.repo === this.selectedRepoFolder);
    const hasWildcard = links.some(l => l.db === '*');
    const dbRoleMap = new Map<string, string>();
    links.forEach(l => dbRoleMap.set(l.db.toLowerCase(), l.role));
    return this.dbEndpoints
      .filter(ep => hasWildcard || dbRoleMap.has(ep.endpoint.toLowerCase()))
      .map(ep => ({
        ...ep,
        role: dbRoleMap.get(ep.endpoint.toLowerCase()) || (hasWildcard ? 'dba' : undefined)
      }));
  }

  public get otherDbEndpointsForCurrentRepo(): Array<{ endpoint: string; description: string }> {
    const linkedSet = new Set(this.linkedDbEndpointsForCurrentRepo.map(d => d.endpoint));
    return this.dbEndpoints.filter(ep => !linkedSet.has(ep.endpoint));
  }

  private getEffectiveLinks(): Array<{ db: string; repo: string; role: string }> {
    if (this.associations && this.associations.length > 0) {
      return this.associations;
    }
    const legacy = this.getDbRepoAssociations().dbToRepo;
    return Object.keys(legacy).map(db => ({ db, repo: legacy[db], role: 'app' }));
  }

  public selectedDbConnection: string = 'pdb21';
  private _selectedRepoFolder: string = '';
  public get selectedRepoFolder(): string {
    return this._selectedRepoFolder;
  }
  public set selectedRepoFolder(val: string) {
    if (this._selectedRepoFolder !== val) {
      this._selectedRepoFolder = val;
      this.selectedFolderPath = '';
    }
  }

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
  @ViewChild('workbenchToolbarTpl', { static: true }) workbenchToolbarTpl?: TemplateRef<any>;
  @ViewChild('workbenchSidenavTpl', { static: true }) workbenchSidenavTpl?: TemplateRef<any>;
  public commitMessage: string = 'Update codebase and OKF memory documentation';
  public statusMessage: string = '';
  public isError: boolean = false;
  public isLoading: boolean = false;
  public monacoLoaded: boolean = false;

  // DB Dependency Map Data (.okf/oracle-code-map.json)
  public dbMapData: any = null;
  public currentFileDbObjects: string[] = [];
  public activeDbObjectDetails: any = null;

  // Right sidebar tab state: 'ai' | 'context'
  public rightPanelTab: 'ai' | 'context' = 'ai';
  public aiPanelWide: boolean = false;
  public selectedFolderPath: string = '';
  @ViewChild('chatComp', { static: false }) public chatComponent?: any;

  // Editor Word Wrap & Markdown Previewer
  public isWordWrap: boolean = false;
  public mdViewMode: 'edit' | 'split' | 'preview' = 'edit';
  public markdownPreviewContent: string = '';

  public get isMarkdownFile(): boolean {
    if (!this.selectedFilePath) return false;
    const lower = this.selectedFilePath.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
  }

  public toggleWordWrap(): void {
    this.isWordWrap = !this.isWordWrap;
    const wrapOption = this.isWordWrap ? 'on' : 'off';
    if (this.monacoEditor) {
      this.monacoEditor.updateOptions({ wordWrap: wrapOption });
    }
    if (this.diffEditor) {
      this.diffEditor.updateOptions({ wordWrap: wrapOption });
    }
    try {
      localStorage.setItem('monaco_word_wrap', this.isWordWrap ? 'true' : 'false');
    } catch (e) {}
    this.cdRef.detectChanges();
  }

  public setMdViewMode(mode: 'edit' | 'split' | 'preview'): void {
    this.mdViewMode = mode;
    if (this.monacoEditor) {
      this.markdownPreviewContent = this.monacoEditor.getValue();
    } else {
      this.markdownPreviewContent = this.activeFileContent || '';
    }
    setTimeout(() => {
      if (this.monacoEditor) {
        this.monacoEditor.layout();
      }
    }, 50);
    this.cdRef.detectChanges();
  }

  public handleMarkdownPreviewClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const anchor = target.tagName === 'A' ? target : target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;

    // External or mailto link
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
      anchor.setAttribute('target', '_blank');
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // In-page hash anchor
    if (href.startsWith('#')) {
      const elem = document.getElementById(href.substring(1));
      elem?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    let targetPath = href.split(/[?#]/, 1)[0];
    if (href.includes('file=')) {
      const match = href.match(/[?&]file=([^&#]+)/);
      if (match) {
        targetPath = decodeURIComponent(match[1]);
      }
    }

    if (!targetPath || targetPath.startsWith('/workbench')) {
      return;
    }

    // Resolve relative path against current open file
    if (this.selectedFilePath && !targetPath.startsWith('/')) {
      const currentDir = this.selectedFilePath.includes('/')
        ? this.selectedFilePath.substring(0, this.selectedFilePath.lastIndexOf('/'))
        : '';
      const combined = currentDir ? `${currentDir}/${targetPath}` : targetPath;
      const parts = combined.split('/');
      const stack: string[] = [];
      for (const p of parts) {
        if (p === '.' || !p) continue;
        if (p === '..') {
          if (stack.length > 0) stack.pop();
        } else {
          stack.push(p);
        }
      }
      targetPath = stack.join('/');
    } else {
      targetPath = targetPath.replace(/^\/+/, '');
    }

    this.openFile(targetPath);
  }

  public get selectedNodeDir(): string {
    if (this.selectedFolderPath) {
      return this.selectedFolderPath;
    }
    if (this.selectedFilePath && this.selectedFilePath.includes('/')) {
      return this.selectedFilePath.substring(0, this.selectedFilePath.lastIndexOf('/'));
    }
    return '';
  }

  public toggleFolder(node: FileTreeNode, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    node.expanded = !node.expanded;
    this.selectedFolderPath = node.path;
    this.cdRef.detectChanges();
  }

  public selectFolder(folderPath: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedFolderPath = (this.selectedFolderPath === folderPath) ? '' : folderPath;
    this.cdRef.detectChanges();
  }

  public triggerReadmeForNode(nodePath: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedFolderPath = nodePath;
    this.triggerReadmeGeneration('selected');
  }

  public setRightPanelTab(tab: 'ai' | 'context'): void {
    this.rightPanelTab = tab;
    this.cdRef.detectChanges();
  }

  public toggleAiPanelWidth(): void {
    this.aiPanelWide = !this.aiPanelWide;
    this.cdRef.detectChanges();
  }

  public toggleFullScreenChat(): void {
    if (this.chatComponent && typeof this.chatComponent.toggleFullScreen === 'function') {
      this.chatComponent.toggleFullScreen();
    }
  }

  get workbenchAiContext(): any {
    const dbObjs = this.currentFileDbObjects || [];
    return {
      endpoint: this.selectedDbConnection,
      projectId: this.selectedRepoFolder,
      branch: this.currentBranch,
      activeFile: this.selectedFilePath,
      selectedDirectory: this.selectedNodeDir,
      fileDbObjects: dbObjs,
      activeFileContent: this.activeFileContent ? this.activeFileContent.slice(0, 4000) : ''
    };
  }

  get workbenchAiObject(): any {
    const filename = this.selectedFilePath ? this.selectedFilePath.split('/').pop() : '';
    return {
      objectName: filename || this.selectedRepoFolder,
      filePath: this.selectedFilePath,
      fileDbObjects: this.currentFileDbObjects
    };
  }

  public triggerReadmeGeneration(scope: 'selected' | 'repo' | 'directory' = 'selected'): void {
    if (!this.selectedRepoFolder) {
      this.snackBar.open('Please select a Git repository first.', 'Close', { duration: 4000 });
      return;
    }
    this.rightPanelTab = 'ai';
    this.cdRef.detectChanges();

    const targetDir = (scope === 'repo') ? '' : this.selectedNodeDir;

    let prompt = '';
    if (targetDir) {
      prompt = `Please generate, validate, or update README files for directory '${targetDir}' (and its subdirectories bottom-up) in repository '${this.selectedRepoFolder}'. Read existing READMEs first, verify their content against actual files and indexed database dependencies, and correct where necessary.`;
    } else {
      prompt = `Please generate, validate, or update README files across repository '${this.selectedRepoFolder}' starting from the lowest directory up to the root. Read existing READMEs first, verify their content against actual files and indexed database dependencies, and correct where necessary.`;
    }

    if (this.chatComponent) {
      this.chatComponent.sendMessage(prompt);
    } else {
      this.state.addMessage({ user: 'You', text: prompt });
    }
  }

  public triggerExplainCode(): void {
    if (!this.selectedFilePath) {
      this.snackBar.open('Please select a file to explain.', 'Close', { duration: 4000 });
      return;
    }
    this.rightPanelTab = 'ai';
    this.cdRef.detectChanges();

    const depsStr = this.currentFileDbObjects && this.currentFileDbObjects.length > 0
      ? ` It references indexed database objects: ${this.currentFileDbObjects.join(', ')}.`
      : '';
    const prompt = `Please explain the function of the file '${this.selectedFilePath}' in repository '${this.selectedRepoFolder}'.${depsStr} What is its role and what are key considerations for maintenance or rewrites?`;

    if (this.chatComponent) {
      this.chatComponent.sendMessage(prompt);
    } else {
      this.state.addMessage({ user: 'You', text: prompt });
    }
  }

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
    try {
      this.isWordWrap = localStorage.getItem('monaco_word_wrap') === 'true';
    } catch (e) {}

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

    if (this.state.isDarkMode$) {
      this.state.isDarkMode$.pipe(takeUntil(this.destroy$)).subscribe(isDark => {
        this.isDarkMode = isDark;
        this.updateMonacoTheme();
      });
    }

    if (this.state.currentContext$) {
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
    }

    this.initWorkbenchData();
  }

  public initWorkbenchData(): void {
    this.isLoading = true;
    this.setStatus('Initializing Workbench & loading repository context...', false);

    const assoc$ = typeof this.restService.getGitAssociations$ === 'function'
      ? this.restService.getGitAssociations$().pipe(catchError(() => of({ version: 1, links: [] })))
      : of({ version: 1, links: [] });

    forkJoin({
      endpoints: this.restService.getDatabaseConnections$().pipe(catchError(() => of([]))),
      repos: this.restService.getLocalRepositories$().pipe(catchError(() => of({ baseDir: '', memoryRepoName: 'visulate-memory', repositories: [] }))),
      assoc: assoc$
    }).subscribe({
      next: ({ endpoints, repos, assoc }) => {
        if (Array.isArray(endpoints) && endpoints.length > 0) {
          this.dbEndpoints = endpoints.map((ep: any) => ({
            endpoint: ep.endpoint,
            description: ep.description || ep.endpoint
          }));
        }
        if (repos) {
          this.baseReposDir = repos.baseDir || '';
          if (repos.memoryRepoName) {
            this.memoryRepoName = repos.memoryRepoName;
            if (typeof this.state.setMemoryRepoName === 'function') {
              this.state.setMemoryRepoName(repos.memoryRepoName);
            }
          }
          this.localRepos = repos.repositories || [];
        }
        if (assoc && Array.isArray(assoc.links)) {
          this.associations = assoc.links;
          if (typeof this.state.setAssociations === 'function') {
            this.state.setAssociations(assoc.links);
          }
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

        // 2. Resolve associated repository for the selected database (M:N links, then legacy localStorage)
        const associatedRepo = this.resolvePrimaryRepoForDb(this.selectedDbConnection);

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
    Promise.resolve().then(() => {
      if (this.isDestroyed) return;
      if (this.workbenchToolbarTpl && typeof this.state.setWorkbenchToolbar === 'function') {
        this.state.setWorkbenchToolbar(this.workbenchToolbarTpl);
      }
      if (this.workbenchSidenavTpl && typeof this.state.setWorkbenchSidenav === 'function') {
        this.state.setWorkbenchSidenav(this.workbenchSidenavTpl);
      }
    });
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
    this.isDestroyed = true;
    if (typeof this.state.setWorkbenchToolbar === 'function') {
      this.state.setWorkbenchToolbar(null);
    }
    if (typeof this.state.setWorkbenchSidenav === 'function') {
      this.state.setWorkbenchSidenav(null);
    }
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

  private resolvePrimaryRepoForDb(db?: string): string {
    if (!db) return '';
    const normDb = db.toLowerCase();
    const links = this.getEffectiveLinks();
    const exact = links.filter(l => l.db.toLowerCase() === normDb);
    if (exact.length > 0) {
      // Keep current repo if it is already one of the linked repos for this DB
      if (this.selectedRepoFolder && exact.some(l => l.repo === this.selectedRepoFolder)) {
        return this.selectedRepoFolder;
      }
      return exact[0].repo;
    }
    const wildcard = links.filter(l => l.db === '*');
    if (wildcard.length > 0) {
      if (this.selectedRepoFolder && wildcard.some(l => l.repo === this.selectedRepoFolder)) {
        return this.selectedRepoFolder;
      }
      return wildcard[0].repo;
    }
    return '';
  }

  public get isCurrentPairAssociated(): boolean {
    if (!this.selectedDbConnection || !this.selectedRepoFolder) return false;
    const normDb = this.selectedDbConnection.toLowerCase();
    const links = this.getEffectiveLinks();
    return links.some(
      l => l.repo === this.selectedRepoFolder && (l.db.toLowerCase() === normDb || l.db === '*')
    );
  }

  public openAssociationsDialog(): void {
    const dialogRef = this.dialog.open(GitAssociationsDialogComponent, {
      width: '680px',
      data: {
        databases: this.dbEndpoints,
        repos: this.localRepos,
        links: this.associations,
        defaultDb: this.selectedDbConnection,
        defaultRepo: this.selectedRepoFolder
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.updated && Array.isArray(res.links)) {
        this.associations = res.links;
        if (typeof this.state.setAssociations === 'function') {
          this.state.setAssociations(res.links);
        }
        this.loadGitStatus();
        this.cdRef.detectChanges();
      }
    });
  }

  public toggleDbRepoAssociation(): void {
    if (!this.selectedDbConnection || !this.selectedRepoFolder) {
      this.setStatus('Please select both a Database and a Git Repository before linking.', true);
      return;
    }

    if (typeof this.restService.saveGitAssociation$ === 'function' && typeof this.restService.deleteGitAssociation$ === 'function') {
      if (this.isCurrentPairAssociated) {
        this.restService.deleteGitAssociation$(this.selectedDbConnection, this.selectedRepoFolder).subscribe({
          next: (res) => {
            this.associations = res.links || [];
            if (typeof this.state.setAssociations === 'function') {
              this.state.setAssociations(this.associations);
            }
            this.setStatus(`Unlinked database '${this.selectedDbConnection}' from repository '${this.selectedRepoFolder}'`, false);
            this.loadGitStatus();
          },
          error: (err) => this.setStatus(`Failed to unlink: ${err.error?.error || err.message}`, true)
        });
      } else {
        this.restService.saveGitAssociation$(this.selectedDbConnection, this.selectedRepoFolder, 'app').subscribe({
          next: (res) => {
            this.associations = res.links || [];
            if (typeof this.state.setAssociations === 'function') {
              this.state.setAssociations(this.associations);
            }
            this.setStatus(`Linked database '${this.selectedDbConnection}' with repository '${this.selectedRepoFolder}'`, false);
            this.loadGitStatus();
          },
          error: (err) => this.setStatus(`Failed to link: ${err.error?.error || err.message}`, true)
        });
      }
      return;
    }

    // Legacy localStorage fallback (used by older unit tests that don't mock association endpoints)
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
    if (this.selectedDbConnection) {
      const associatedRepo = this.resolvePrimaryRepoForDb(this.selectedDbConnection);
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
      this.gitStatus = null;
      this.gitFileStatusMap = {};
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

    const associatedRepo = this.resolvePrimaryRepoForDb(this.selectedDbConnection);

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
    this.syncWorkspacesFromLocalRepos();
    const ws = this.workspaceMap[targetId];
    if (ws) {
      ws.expanded = true;
      ws.loading = true;
    }

    this.restService.listGitFiles$(targetId).subscribe({
      next: (res) => {
        this.projectFiles = res.files || [];
        if (ws) {
          ws.files = [...this.projectFiles];
          ws.loaded = true;
          ws.loading = false;
          this.applyFileFilterForWorkspace(ws);
        }
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
        this.loadGitStatus();
        if (this.selectedFilePath) {
          this.openFile(this.selectedFilePath);
        } else {
          this.isLoading = false;
        }
      },
      error: (err) => {
        if (ws) {
          ws.loading = false;
        }
        this.setStatus(`Error loading files for repository '${targetId}': ${err.message}`, true);
        this.isLoading = false;
      }
    });
  }

  public loadGitStatus(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId || typeof this.restService.getGitStatus$ !== 'function') {
      this.gitStatus = null;
      this.gitFileStatusMap = {};
      return;
    }

    this.restService.getGitStatus$(targetId).subscribe({
      next: (status) => {
        this.gitStatus = status;
        const map: Record<string, string> = {};
        if (status && Array.isArray(status.files)) {
          for (const f of status.files) {
            map[f.path] = f.status === '?' ? 'U' : f.status;
          }
        }
        this.gitFileStatusMap = map;
        this.rebuildFileTree();
      },
      error: () => {
        this.gitStatus = null;
        this.gitFileStatusMap = {};
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

  public downloadFile(filePath: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId || !filePath) return;

    this.setStatus(`Downloading '${filePath}'...`, false);
    this.restService.downloadGitFile$(targetId, filePath).subscribe({
      next: (blob: Blob) => {
        const filename = filePath.split('/').pop() || filePath;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.setStatus(`Downloaded '${filename}' successfully`, false);
      },
      error: (err) => {
        this.setStatus(`Failed to download '${filePath}': ${err.error?.error || err.message}`, true);
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
    for (const ws of Object.values(this.workspaceMap)) {
      if (ws.loaded) {
        this.applyFileFilterForWorkspace(ws);
      }
    }
    this.rebuildFileTree();
  }

  public rebuildFileTree(): void {
    this.fileTreeNodes = this.buildFileTree(this.filteredFiles);
    if (this.selectedFilePath) {
      this.expandPathToNode(this.selectedFilePath);
    }
    const activeWs = this.selectedRepoFolder ? this.workspaceMap[this.selectedRepoFolder] : null;
    if (activeWs) {
      activeWs.dbMapData = this.dbMapData;
      activeWs.gitFileStatusMap = { ...this.gitFileStatusMap };
      activeWs.treeNodes = this.fileTreeNodes;
    }
    try {
      this.cdRef.detectChanges();
    } catch (e) {}
  }

  public expandPathToNode(filePath: string): void {
    this.expandPathInNodes(this.fileTreeNodes, filePath);
  }

  private expandPathInNodes(nodes: FileTreeNode[], filePath: string): void {
    if (!filePath || !nodes) return;
    const parts = filePath.split('/');
    let currentLevel = nodes;

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
    return this.buildFileTreeForData(filePaths, this.dbMapData, this.gitFileStatusMap);
  }

  private buildFileTreeForData(
    filePaths: string[],
    dbMapData: any,
    gitFileStatusMap: Record<string, string>
  ): FileTreeNode[] {
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
          const badges = isFile && dbMapData?.files?.[currentPath] ? dbMapData.files[currentPath] : undefined;
          const displayBadges = badges && badges.length > 0 ? badges.slice(0, 2) : undefined;
          const extraCount = badges && badges.length > 2 ? badges.length - 2 : 0;
          existingNode = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            expanded: isFiltering,
            children: isFile ? undefined : [],
            dbBadges: displayBadges,
            extraBadgeCount: extraCount,
            gitStatus: isFile ? gitFileStatusMap[currentPath] : undefined
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

    if (typeof this.restService.getProjectCodeMap$ === 'function') {
      this.restService.getProjectCodeMap$(targetId, this.selectedDbConnection || undefined).subscribe({
        next: (mapData) => {
          this.dbMapData = mapData || null;
          this.updateCurrentFileDbObjects();
          this.rebuildFileTree();
        },
        error: () => {
          this.dbMapData = null;
          this.updateCurrentFileDbObjects();
          this.rebuildFileTree();
        }
      });
      return;
    }

    const loadRootMap = () => {
      this.restService.getGitFile$(targetId, 'visulate/oracle-code-map.json').subscribe({
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
      const visulateDbPath = `visulate/${db}/oracle-code-map.json`;

      this.restService.getGitFile$(targetId, visulateDbPath).subscribe({
        next: (res) => {
          try {
            this.dbMapData = JSON.parse(res.content);
            this.updateCurrentFileDbObjects();
            this.rebuildFileTree();
          } catch (e) {
            loadRootMap();
          }
        },
        error: () => {
          loadRootMap();
        }
      });
    } else {
      loadRootMap();
    }
  }

  public openFile(filePath: string): void {
    if (!filePath) return;
    this.selectedFolderPath = '';
    this.selectedFilePath = filePath;
    if (!this.isMarkdownFile && this.mdViewMode === 'preview') {
      this.mdViewMode = 'edit';
    }
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
          this.markdownPreviewContent = this.activeFileContent;
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
    if (this.viewMode === mode && !this.activeCompare) return;
    if (mode === 'editor') {
      this.activeCompare = null;
    }
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
        wordWrap: this.isWordWrap ? 'on' : 'off',
        minimap: { enabled: true },
        scrollBeyondLastLine: false
      });

      this.monacoEditor.onDidChangeModelContent(() => {
        if (this.isMarkdownFile) {
          this.markdownPreviewContent = this.monacoEditor.getValue();
          this.cdRef.detectChanges();
        }
      });

      this.updateSingleEditorModel();

      this.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        this.saveDraft();
      });
    } else {
      this.diffEditor = monaco.editor.createDiffEditor(this.editorContainer.nativeElement, {
        theme: currentTheme,
        automaticLayout: true,
        wordWrap: this.isWordWrap ? 'on' : 'off',
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
      this.markdownPreviewContent = this.activeFileContent || '';
    } catch (e) {
      console.warn('Fallback monaco model creation:', e);
      const fallbackModel = monaco.editor.createModel(this.activeFileContent || '', lang);
      this.monacoEditor.setModel(fallbackModel);
      this.markdownPreviewContent = this.activeFileContent || '';
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
        this.loadGitStatus();
      },
      error: (err) => {
        this.setStatus(`Error saving file: ${err.message}`, true);
      }
    });
  }

  public openGitStatusDialog(repoOverride?: string): void {
    const targetId = repoOverride || this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    const initialStatus = this.workspaceMap[targetId]?.gitStatus ||
      (targetId === this.selectedRepoFolder ? this.gitStatus : null);

    const dialogRef = this.dialog.open(GitStatusDialogComponent, {
      width: '680px',
      data: {
        projectId: targetId,
        repos: this.orderedWorkspaces.map(w => ({ folderName: w.folderName, isMemoryRepo: w.isMemoryRepo })),
        initialStatus
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      const repo = res?.repo || targetId;
      if (res?.didMutate) {
        this.loadWorkspaceFiles(repo, repo === this.selectedRepoFolder);
        if (repo === this.selectedRepoFolder && this.selectedFilePath) {
          this.loadFileContent();
        }
      } else {
        this.loadGitStatusForWorkspace(repo);
      }

      if (!res?.action) return;

      if (res.action === 'open' && res.filePath) {
        this.openFileInWorkspace(repo, res.filePath, 'editor');
      } else if (res.action === 'diff' && res.filePath) {
        this.openFileInWorkspace(repo, res.filePath, 'diff');
      } else if (res.action === 'commit') {
        if (repo !== this.selectedRepoFolder) {
          this.activateWorkspace(repo, false);
        }
        this.openCommitDialog();
      } else if (res.action === 'push') {
        if (repo !== this.selectedRepoFolder) {
          this.activateWorkspace(repo, false);
        }
        this.pushChanges();
      } else if (res.action === 'pull') {
        if (repo !== this.selectedRepoFolder) {
          this.activateWorkspace(repo, false);
        }
        this.pullRepo();
      } else if (res.action === 'remote') {
        if (repo !== this.selectedRepoFolder) {
          this.activateWorkspace(repo, false);
        }
        this.openRemoteDialog();
      }
    });
  }

  public openCommitDialog(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    const launchDialog = () => {
      this.restService.getGitStatus$(targetId).subscribe({
        next: (status) => {
          this.gitStatus = status;
          const dialogRef = this.dialog.open(GitCommitDialogComponent, {
            width: '620px',
            data: {
              projectId: targetId,
              branch: status.branch || this.currentBranch || 'main',
              files: status.files || [],
              defaultMessage: ''
            }
          });

          dialogRef.afterClosed().subscribe(res => {
            if (res?.action === 'diff' && res.filePath) {
              this.viewMode = 'diff';
              this.openFile(res.filePath);
            } else if (res?.committed) {
              const hash = res.result?.commitHash ? ` (${res.result.commitHash})` : '';
              this.setStatus(`Committed locally to '${status.branch}'${hash}. Use Push when ready.`, false);
              this.snackBar.open(`Committed locally${hash}. Not pushed upstream.`, 'Dismiss', { duration: 4000 });
              this.loadProjectFiles();
            } else {
              this.loadGitStatus();
            }
          });
        },
        error: (err) => {
          const rawMsg = err.error?.error || err.message || 'Failed to load git status';
          this.setStatus(`Could not load Git status: ${rawMsg}`, true);
        }
      });
    };

    // Save current editor buffer to disk first if a file is open
    let contentToSave: string | null = null;
    if (this.selectedFilePath) {
      if (this.viewMode === 'editor' && this.monacoEditor) {
        contentToSave = this.monacoEditor.getValue();
      } else if (this.viewMode === 'diff' && this.modifiedModel) {
        contentToSave = this.modifiedModel.getValue();
      }
    }

    if (this.selectedFilePath && contentToSave !== null && contentToSave !== this.activeFileContent) {
      this.restService.saveGitFile$(targetId, this.selectedFilePath, contentToSave).subscribe({
        next: () => {
          this.activeFileContent = contentToSave!;
          launchDialog();
        },
        error: () => launchDialog()
      });
    } else {
      launchDialog();
    }
  }

  public pushChanges(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    if (!this.hasConfiguredRemote) {
      this.openRemoteDialog();
      return;
    }

    const remoteName = this.gitStatus?.remotes?.[0]?.name || 'origin';
    const branch = this.gitStatus?.branch || this.currentBranch || 'main';
    const aheadText = this.aheadCount > 0 ? ` (${this.aheadCount} commit${this.aheadCount === 1 ? '' : 's'})` : '';
    if (!confirm(`Push branch '${branch}'${aheadText} in '${targetId}' to remote '${remoteName}'?`)) {
      return;
    }

    this.showAuthAction = false;
    this.isLoading = true;
    this.setStatus(`Pushing '${branch}' to '${remoteName}'...`, false);

    this.restService.pushGitChanges$(targetId, {
      remote: remoteName,
      branchName: branch,
      setUpstream: !this.gitStatus?.upstream
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.setStatus(`Successfully pushed '${branch}' to '${remoteName}'`, false);
        this.snackBar.open(`Pushed '${branch}' to '${remoteName}'`, 'Dismiss', { duration: 4000 });
        if (res?.status) {
          this.gitStatus = res.status;
        } else {
          this.loadGitStatus();
        }
      },
      error: (err) => {
        this.isLoading = false;
        const rawMsg = err.error?.error || err.error?.message || err.message || 'Push failed';
        this.handleGitOperationError('Git push', rawMsg);
      }
    });
  }

  public openRemoteDialog(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    if (!targetId) return;

    const dialogRef = this.dialog.open(GitRemoteDialogComponent, {
      width: '540px',
      data: {
        projectId: targetId,
        remotes: this.gitStatus?.remotes || [],
        isMemoryRepo: this.isMemoryRepoSelected
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.saved) {
        this.setStatus(`Updated upstream remote for '${targetId}'`, false);
        this.snackBar.open(`Upstream remote saved for '${targetId}'`, 'Dismiss', { duration: 4000 });
        this.loadGitStatus();
      }
    });
  }

  public openCopyToRepoDialog(sourcePath: string, event?: Event, sourceRepoOverride?: string): void {
    if (event) {
      event.stopPropagation();
    }
    const sourceRepo = sourceRepoOverride || this.selectedRepoFolder || this.projectId;
    if (!sourceRepo || !sourcePath) return;

    const isFromMemoryRepo = sourceRepo === this.memoryRepoName;
    // Infer DB from path if browsing visulate-memory (e.g. "pdb21/comments/file.sql")
    const pathParts = sourcePath.split('/');
    const inferredDb = isFromMemoryRepo && pathParts.length > 1 ? pathParts[0] : this.selectedDbConnection;
    const linksForDb = this.getEffectiveLinks().filter(
      l => l.db.toLowerCase() === (inferredDb || '').toLowerCase() || l.db === '*'
    );
    const linkedMap = new Map<string, string>();
    linksForDb.forEach(l => linkedMap.set(l.repo, l.role));

    const targetRepos = this.localRepos
      .filter(r => r.folderName !== sourceRepo && !r.isMemoryRepo)
      .map(r => ({
        folderName: r.folderName,
        linked: linkedMap.has(r.folderName),
        role: linkedMap.get(r.folderName)
      }))
      .sort((a, b) => (a.linked === b.linked ? a.folderName.localeCompare(b.folderName) : a.linked ? -1 : 1));

    if (targetRepos.length === 0) {
      this.snackBar.open('No destination code repository available. Clone or add a repository first.', 'Dismiss', { duration: 5000 });
      return;
    }

    // Build a clean default destination path (strip leading <db>/ prefix when copying from visulate-memory)
    const defaultTargetPath = (isFromMemoryRepo && pathParts.length > 1)
      ? `db/${pathParts.slice(1).join('/')}`
      : sourcePath;

    const dialogRef = this.dialog.open(CopyToRepoDialogComponent, {
      width: '560px',
      data: {
        sourceRepo,
        sourcePath,
        targetRepos,
        defaultTargetRepo: targetRepos[0].folderName,
        defaultTargetPath
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.copied) {
        const count = res.copiedFiles?.length || 1;
        this.setStatus(`Copied ${count} file(s) to '${res.targetRepo}' (uncommitted)`, false);
        const snack = this.snackBar.open(
          `Copied ${count} file(s) to '${res.targetRepo}'`,
          `Open ${res.targetRepo}`,
          { duration: 6000 }
        );
        snack.onAction().subscribe(() => {
          this.selectedRepoFolder = res.targetRepo;
          this.projectId = res.targetRepo;
          this.selectedFilePath = res.copiedFiles?.[0] || '';
          this.loadProjectFiles();
        });
      }
    });
  }

  public commitAndPush(): void {
    this.openCommitDialog();
  }

  public runIndexDependencies(): void {
    const targetId = this.selectedRepoFolder || this.projectId;
    this.setStatus('Indexing database-to-code dependencies into visulate-memory...', false);
    this.restService.indexDependencies$(targetId, undefined, this.selectedDbConnection).subscribe({
      next: () => {
        const targetDb = this.selectedDbConnection ? this.selectedDbConnection.toLowerCase().trim() : '_unscoped';
        const savedLoc = `${this.memoryRepoName}/${targetDb}/code-maps/${targetId}/`;
        this.setStatus(`Dependency mapping completed. Saved to ${savedLoc} (app repository untouched)`, false);
        this.loadDbMapData();
        this.loadGitStatus();
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
