import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RestService } from '../../services/rest.service';

export interface GitCommitDialogData {
  projectId: string;
  branch: string;
  files: Array<{ path: string; indexStatus: string; workTreeStatus: string; status: string }>;
  defaultMessage?: string;
}

@Component({
  selector: 'app-git-commit-dialog',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon>commit</mat-icon> Commit Changes — {{ data.projectId }} ({{ data.branch }})
    </h2>
    <mat-dialog-content class="dialog-body">
      <p class="hint-text">
        Select files to include in this <strong>local commit</strong>. Nothing will be pushed upstream until you explicitly click Push.
      </p>

      <div class="file-controls" *ngIf="fileItems.length > 0">
        <button mat-button type="button" (click)="selectAll(true)">Select All</button>
        <button mat-button type="button" (click)="selectAll(false)">Select None</button>
        <span class="selected-count">{{ selectedFiles.length }} of {{ fileItems.length }} selected</span>
      </div>

      <div class="file-list" *ngIf="fileItems.length > 0; else cleanTree">
        <div class="file-row" *ngFor="let item of fileItems">
          <mat-checkbox [(ngModel)]="item.selected" color="primary"></mat-checkbox>
          <span class="status-pill" [ngClass]="'status-' + (item.status === '?' ? 'U' : item.status)">
            {{ item.status === '?' ? 'U' : item.status }}
          </span>
          <span class="file-path" [title]="item.path">{{ item.path }}</span>
          <button mat-icon-button type="button" matTooltip="View Diff in Workbench" (click)="viewDiff(item.path)">
            <mat-icon>difference</mat-icon>
          </button>
          <button mat-icon-button type="button" color="warn" matTooltip="Discard uncommitted changes"
            [disabled]="isSubmitting" (click)="discardFile(item.path)">
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

      <mat-form-field appearance="outline" class="full-width msg-field">
        <mat-label>Commit Message</mat-label>
        <textarea matInput rows="3" [(ngModel)]="commitMessage"
          placeholder="Describe your changes..."></textarea>
      </mat-form-field>

      <div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onCancel()" [disabled]="isSubmitting">Cancel</button>
      <button mat-raised-button color="primary" type="button"
        (click)="onCommit()"
        [disabled]="isSubmitting || selectedFiles.length === 0 || !commitMessage.trim()">
        <mat-icon>check</mat-icon> {{ isSubmitting ? 'Committing...' : 'Commit Locally' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title { display: flex; align-items: center; gap: 8px; }
    .dialog-body { min-width: 520px; max-width: 720px; }
    .hint-text { font-size: 13px; opacity: 0.85; margin-top: 0; }
    .file-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .selected-count { margin-left: auto; font-size: 12px; opacity: 0.75; }
    .file-list { max-height: 240px; overflow-y: auto; border: 1px solid var(--app-border-color, #ccc); border-radius: 4px; padding: 4px 8px; margin-bottom: 14px; }
    .file-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; border-bottom: 1px solid rgba(128,128,128,0.12); }
    .file-row:last-child { border-bottom: none; }
    .file-path { flex: 1; font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-pill { font-size: 11px; font-weight: 700; width: 20px; text-align: center; border-radius: 3px; padding: 1px 4px; }
    .status-M { background: rgba(245, 158, 11, 0.2); color: #b45309; }
    .status-U, .status-A { background: rgba(16, 185, 129, 0.2); color: #047857; }
    .status-D { background: rgba(239, 68, 68, 0.2); color: #b91c1c; }
    .status-R { background: rgba(59, 130, 246, 0.2); color: #1d4ed8; }
    .empty-state { display: flex; align-items: center; gap: 8px; padding: 16px; opacity: 0.75; }
    .full-width { width: 100%; }
    .msg-field { margin-top: 6px; }
    .error-banner { color: #d32f2f; font-size: 12px; margin-top: 4px; }
  `]
})
export class GitCommitDialogComponent {
  public fileItems: Array<{ path: string; status: string; selected: boolean }> = [];
  public commitMessage: string = '';
  public isSubmitting: boolean = false;
  public errorMessage: string = '';

  constructor(
    public dialogRef: MatDialogRef<GitCommitDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GitCommitDialogData,
    private restService: RestService
  ) {
    this.fileItems = (data.files || []).map(f => ({
      path: f.path,
      status: f.status,
      selected: true
    }));
    this.commitMessage = data.defaultMessage || '';
  }

  get selectedFiles(): string[] {
    return this.fileItems.filter(f => f.selected).map(f => f.path);
  }

  selectAll(selected: boolean): void {
    this.fileItems.forEach(f => f.selected = selected);
  }

  viewDiff(filePath: string): void {
    this.dialogRef.close({ action: 'diff', filePath });
  }

  discardFile(filePath: string): void {
    if (!confirm(`Discard uncommitted changes to '${filePath}'?`)) {
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';
    this.restService.discardGitFile$(this.data.projectId, filePath).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        const updatedFiles = res?.status?.files || [];
        this.fileItems = updatedFiles.map((f: any) => ({
          path: f.path,
          status: f.status,
          selected: true
        }));
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || err.message || 'Failed to discard changes';
      }
    });
  }

  onCommit(): void {
    const files = this.selectedFiles;
    const msg = this.commitMessage.trim();
    if (!files.length || !msg) return;

    this.isSubmitting = true;
    this.errorMessage = '';
    this.restService.commitGitChanges$(this.data.projectId, {
      commitMessage: msg,
      files,
      branchName: this.data.branch
    }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.dialogRef.close({ committed: true, result: res });
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || err.message || 'Commit failed';
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
