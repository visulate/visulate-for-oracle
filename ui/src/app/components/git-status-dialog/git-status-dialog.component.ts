import { Component, Inject, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { RestService } from '../../services/rest.service';

export interface GitStatusFileItem {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  status: string;
}

export interface GitStatusPayload {
  projectId: string;
  branch: string;
  upstream: string | null;
  remotes: Array<{ name: string; url: string }>;
  hasRemote: boolean;
  isMemoryRepo: boolean;
  ahead: number;
  behind: number;
  files: GitStatusFileItem[];
}

export interface GitStatusDialogData {
  projectId: string;
  repos: Array<{ folderName: string; isMemoryRepo?: boolean }>;
  initialStatus?: GitStatusPayload | null;
}

@Component({
  selector: 'app-git-status-dialog',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
  template: `
    <div mat-dialog-title class="dialog-title-row">
      <div class="title-left">
        <mat-icon>info</mat-icon>
        <span>Git Status</span>
      </div>
      <div class="title-controls">
        <select *ngIf="data.repos && data.repos.length > 0" class="repo-select"
          [(ngModel)]="selectedRepo" (change)="loadStatus()" title="Inspect repository status">
          <option *ngFor="let r of data.repos" [value]="r.folderName">
            {{ r.folderName }}{{ r.isMemoryRepo ? ' (memory)' : '' }}
          </option>
        </select>
        <button mat-icon-button type="button" matTooltip="Refresh Git status" (click)="loadStatus()" [disabled]="isLoading">
          <mat-icon>refresh</mat-icon>
        </button>
      </div>
    </div>

    <mat-dialog-content class="dialog-body">
      <mat-progress-bar *ngIf="isLoading" mode="indeterminate" class="status-loader"></mat-progress-bar>

      <div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>

      <ng-container *ngIf="status">
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Branch</span>
            <span class="summary-value mono">
              <mat-icon class="inline-icon">fork_right</mat-icon>
              {{ status.branch || '(detached)' }}
              <span *ngIf="status.isMemoryRepo" class="tag-chip mem-chip">Memory Repo</span>
            </span>
          </div>

          <div class="summary-item">
            <span class="summary-label">Upstream / Sync</span>
            <span class="summary-value">
              <ng-container *ngIf="status.hasRemote; else noRemoteTpl">
                <span class="mono">{{ status.upstream || 'Remote configured (no tracking branch)' }}</span>
                <span class="sync-badge ahead" *ngIf="status.ahead > 0" title="Local commits ahead of upstream">
                  ↑ {{ status.ahead }} ahead
                </span>
                <span class="sync-badge behind" *ngIf="status.behind > 0" title="Remote commits behind upstream">
                  ↓ {{ status.behind }} behind
                </span>
                <span class="sync-badge synced" *ngIf="status.upstream && status.ahead === 0 && status.behind === 0">
                  Up to date
                </span>
              </ng-container>
              <ng-template #noRemoteTpl>
                <span class="muted">Local only — no upstream remote configured</span>
              </ng-template>
            </span>
          </div>

          <div class="summary-item" *ngIf="status.remotes && status.remotes.length > 0">
            <span class="summary-label">Remotes</span>
            <div class="remotes-list">
              <div *ngFor="let rem of status.remotes" class="remote-row mono">
                <strong>{{ rem.name }}</strong>: {{ rem.url }}
              </div>
            </div>
          </div>
        </div>

        <div class="section-header">
          <span>Working Tree ({{ status.files.length }} {{ status.files.length === 1 ? 'change' : 'changes' }})</span>
          <div class="count-chips" *ngIf="status.files.length > 0">
            <span class="count-chip status-M" *ngIf="counts.modified > 0">M: {{ counts.modified }}</span>
            <span class="count-chip status-U" *ngIf="counts.untracked > 0">U: {{ counts.untracked }}</span>
            <span class="count-chip status-A" *ngIf="counts.added > 0">A: {{ counts.added }}</span>
            <span class="count-chip status-D" *ngIf="counts.deleted > 0">D: {{ counts.deleted }}</span>
            <span class="count-chip status-R" *ngIf="counts.other > 0">Other: {{ counts.other }}</span>
          </div>
        </div>

        <div class="file-list" *ngIf="status.files.length > 0; else cleanTree">
          <div class="file-row" *ngFor="let item of status.files">
            <span class="status-pill" [ngClass]="'status-' + normalizeCode(item.status)"
              [matTooltip]="statusLabel(item.status)">
              {{ normalizeCode(item.status) }}
            </span>
            <span class="file-path" [title]="item.path">{{ item.path }}</span>
            <button mat-icon-button type="button" matTooltip="Open in Editor" (click)="openFile(item.path)">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button type="button" matTooltip="View Diff in Workbench" (click)="viewDiff(item.path)">
              <mat-icon>difference</mat-icon>
            </button>
            <button mat-icon-button type="button" color="warn" matTooltip="Discard uncommitted changes"
              [disabled]="isLoading" (click)="discardFile(item.path)">
              <mat-icon>undo</mat-icon>
            </button>
          </div>
        </div>

        <ng-template #cleanTree>
          <div class="empty-state">
            <mat-icon>check_circle</mat-icon>
            <span>Working tree is clean. No uncommitted changes.</span>
          </div>
        </ng-template>
      </ng-container>
    </mat-dialog-content>

    <mat-dialog-actions class="dialog-actions">
      <div class="left-actions">
        <button mat-stroked-button color="primary" type="button"
          [disabled]="isLoading || !loadedRepo || !status || status.files.length === 0"
          (click)="triggerAction('commit')">
          <mat-icon>commit</mat-icon> Commit Locally...
        </button>
        <button mat-stroked-button type="button"
          *ngIf="status?.hasRemote"
          [disabled]="isLoading || !loadedRepo"
          (click)="triggerAction('push')">
          <mat-icon>publish</mat-icon> Push{{ status && status.ahead > 0 ? ' (' + status.ahead + ')' : '' }}
        </button>
        <button mat-stroked-button type="button"
          *ngIf="status?.hasRemote"
          [disabled]="isLoading || !loadedRepo"
          (click)="triggerAction('pull')">
          <mat-icon>file_download</mat-icon> Pull{{ status && status.behind > 0 ? ' (' + status.behind + ')' : '' }}
        </button>
        <button mat-button type="button" [disabled]="isLoading || !loadedRepo" (click)="triggerAction('remote')">
          <mat-icon>cloud_upload</mat-icon> {{ status?.hasRemote ? 'Remote...' : 'Set Remote...' }}
        </button>
      </div>
      <button mat-button type="button" (click)="onClose()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title-left { display: flex; align-items: center; gap: 8px; }
    .title-controls { display: flex; align-items: center; gap: 6px; }
    .repo-select {
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--app-border-color, #ccc);
      background: var(--app-input-bg, transparent);
      color: inherit;
      max-width: 240px;
    }
    .dialog-body { min-width: 560px; max-width: 760px; }
    .status-loader { margin-bottom: 10px; }
    .summary-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      border: 1px solid var(--app-border-color, #ccc);
      border-radius: 6px;
      background: rgba(128, 128, 128, 0.06);
      margin-bottom: 14px;
    }
    .summary-item { display: flex; align-items: baseline; gap: 12px; font-size: 13px; }
    .summary-label { min-width: 112px; font-weight: 600; opacity: 0.78; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
    .summary-value { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; flex: 1; }
    .mono { font-family: monospace; font-size: 12px; }
    .inline-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: middle; }
    .muted { opacity: 0.72; font-style: italic; font-size: 12px; }
    .remotes-list { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .remote-row { word-break: break-all; }
    .tag-chip, .sync-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
    }
    .mem-chip { background: rgba(139, 92, 246, 0.18); color: #7c3aed; }
    .sync-badge.ahead { background: rgba(59, 130, 246, 0.18); color: #1d4ed8; }
    .sync-badge.behind { background: rgba(245, 158, 11, 0.2); color: #b45309; }
    .sync-badge.synced { background: rgba(16, 185, 129, 0.18); color: #047857; }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.85;
      margin-bottom: 6px;
    }
    .count-chips { display: flex; gap: 6px; }
    .count-chip { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 3px; text-transform: none; }
    .file-list { max-height: 280px; overflow-y: auto; border: 1px solid var(--app-border-color, #ccc); border-radius: 4px; padding: 4px 8px; }
    .file-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; border-bottom: 1px solid rgba(128,128,128,0.12); }
    .file-row:last-child { border-bottom: none; }
    .file-path { flex: 1; font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-pill { font-size: 11px; font-weight: 700; width: 20px; text-align: center; border-radius: 3px; padding: 1px 4px; }
    .status-M { background: rgba(245, 158, 11, 0.2); color: #b45309; }
    .status-U, .status-A { background: rgba(16, 185, 129, 0.2); color: #047857; }
    .status-D { background: rgba(239, 68, 68, 0.2); color: #b91c1c; }
    .status-R { background: rgba(59, 130, 246, 0.2); color: #1d4ed8; }
    .empty-state { display: flex; align-items: center; gap: 8px; padding: 16px; border: 1px dashed var(--app-border-color, #ccc); border-radius: 4px; opacity: 0.8; }
    .error-banner { color: #d32f2f; font-size: 12px; margin-bottom: 8px; }
    .dialog-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-top: 8px; }
    .left-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  `]
})
export class GitStatusDialogComponent implements OnInit, OnDestroy {
  public selectedRepo: string = '';
  public status: GitStatusPayload | null = null;
  public isLoading: boolean = false;
  public errorMessage: string = '';
  public didMutate: boolean = false;
  private statusSub: Subscription | null = null;
  private discardSub: Subscription | null = null;
  private requestSeq: number = 0;

  constructor(
    public dialogRef: MatDialogRef<GitStatusDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GitStatusDialogData,
    private restService: RestService,
    private cdRef: ChangeDetectorRef
  ) {
    this.selectedRepo = data.projectId || data.repos?.[0]?.folderName || '';
    if (data.initialStatus && data.initialStatus.projectId === this.selectedRepo) {
      this.status = data.initialStatus;
    }
  }

  get loadedRepo(): string {
    return this.status && this.status.projectId === this.selectedRepo ? this.status.projectId : '';
  }

  ngOnInit(): void {
    this.loadStatus();
  }

  ngOnDestroy(): void {
    this.statusSub?.unsubscribe();
    this.discardSub?.unsubscribe();
  }

  get counts(): { modified: number; untracked: number; added: number; deleted: number; other: number } {
    const res = { modified: 0, untracked: 0, added: 0, deleted: 0, other: 0 };
    for (const f of this.status?.files || []) {
      const code = this.normalizeCode(f.status);
      if (code === 'M') res.modified++;
      else if (code === 'U') res.untracked++;
      else if (code === 'A') res.added++;
      else if (code === 'D') res.deleted++;
      else res.other++;
    }
    return res;
  }

  normalizeCode(status: string): string {
    return status === '?' ? 'U' : (status || 'M');
  }

  statusLabel(status: string): string {
    const code = this.normalizeCode(status);
    switch (code) {
      case 'M': return 'Modified';
      case 'U': return 'Untracked (new file)';
      case 'A': return 'Added (staged)';
      case 'D': return 'Deleted';
      case 'R': return 'Renamed';
      default: return code;
    }
  }

  loadStatus(): void {
    if (!this.selectedRepo) return;
    this.statusSub?.unsubscribe();
    this.discardSub?.unsubscribe();

    const repoForRequest = this.selectedRepo;
    const seq = ++this.requestSeq;
    // Clear stale status from any previously viewed repository immediately
    if (this.status && this.status.projectId !== repoForRequest) {
      this.status = null;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.cdRef.detectChanges();

    this.statusSub = this.restService.getGitStatus$(repoForRequest).subscribe({
      next: (status) => {
        if (seq !== this.requestSeq || repoForRequest !== this.selectedRepo) {
          return;
        }
        this.status = status;
        this.isLoading = false;
        this.cdRef.detectChanges();
      },
      error: (err) => {
        if (seq !== this.requestSeq || repoForRequest !== this.selectedRepo) {
          return;
        }
        this.status = null;
        this.isLoading = false;
        this.errorMessage = err.error?.error || err.message || 'Failed to load Git status';
        this.cdRef.detectChanges();
      }
    });
  }

  openFile(filePath: string): void {
    const targetRepo = this.loadedRepo;
    if (!targetRepo) return;
    this.dialogRef.close({ action: 'open', repo: targetRepo, filePath, didMutate: this.didMutate });
  }

  viewDiff(filePath: string): void {
    const targetRepo = this.loadedRepo;
    if (!targetRepo) return;
    this.dialogRef.close({ action: 'diff', repo: targetRepo, filePath, didMutate: this.didMutate });
  }

  discardFile(filePath: string): void {
    const targetRepo = this.loadedRepo;
    if (!targetRepo) return;
    if (!confirm(`Discard uncommitted changes to '${filePath}' in '${targetRepo}'?`)) {
      return;
    }
    this.discardSub?.unsubscribe();
    const seq = this.requestSeq;
    this.isLoading = true;
    this.errorMessage = '';
    this.discardSub = this.restService.discardGitFile$(targetRepo, filePath).subscribe({
      next: (res) => {
        this.didMutate = true;
        if (seq !== this.requestSeq || targetRepo !== this.selectedRepo) {
          return;
        }
        this.isLoading = false;
        if (res?.status) {
          this.status = res.status;
        } else {
          this.loadStatus();
        }
        this.cdRef.detectChanges();
      },
      error: (err) => {
        if (seq !== this.requestSeq || targetRepo !== this.selectedRepo) {
          return;
        }
        this.isLoading = false;
        this.errorMessage = err.error?.error || err.message || 'Failed to discard changes';
        this.cdRef.detectChanges();
      }
    });
  }

  triggerAction(action: 'commit' | 'push' | 'pull' | 'remote'): void {
    const targetRepo = this.loadedRepo;
    if (!targetRepo) return;
    this.dialogRef.close({ action, repo: targetRepo, didMutate: this.didMutate });
  }

  onClose(): void {
    this.dialogRef.close({ didMutate: this.didMutate, repo: this.loadedRepo || this.selectedRepo });
  }
}
