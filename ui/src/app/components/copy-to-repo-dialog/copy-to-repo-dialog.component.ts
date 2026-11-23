import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RestService } from '../../services/rest.service';

export interface CopyToRepoDialogData {
  sourceRepo: string;
  sourcePath: string;
  targetRepos: Array<{ folderName: string; linked?: boolean; role?: string }>;
  defaultTargetRepo?: string;
  defaultTargetPath?: string;
}

@Component({
  selector: 'app-copy-to-repo-dialog',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon>drive_file_move</mat-icon> Copy Artifact to Code Repository
    </h2>
    <mat-dialog-content class="dialog-body">
      <p class="hint-text">
        Copy <code>{{ data.sourceRepo }}/{{ data.sourcePath }}</code> into a target repository working tree (left uncommitted so you can review and commit on your chosen branch).
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Destination Repository</mat-label>
        <mat-select [(ngModel)]="targetRepo">
          <mat-option *ngFor="let r of data.targetRepos" [value]="r.folderName">
            {{ r.folderName }} {{ r.linked ? '(' + (r.role || 'linked') + ')' : '' }}
          </mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Destination Path (relative to repository root)</mat-label>
        <input matInput [(ngModel)]="targetPath" placeholder="db/scripts/comments.sql" />
      </mat-form-field>

      <mat-checkbox [(ngModel)]="overwrite" color="primary">Overwrite existing file(s) if present</mat-checkbox>

      <div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onCancel()" [disabled]="isCopying">Cancel</button>
      <button mat-raised-button color="primary" type="button"
        (click)="onCopy()"
        [disabled]="isCopying || !targetRepo || !targetPath.trim()">
        <mat-icon>content_copy</mat-icon> {{ isCopying ? 'Copying...' : 'Copy to Repo' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title { display: flex; align-items: center; gap: 8px; }
    .dialog-body { min-width: 480px; }
    .hint-text { font-size: 13px; opacity: 0.85; margin-top: 0; word-break: break-all; }
    .full-width { width: 100%; }
    .error-banner { color: #d32f2f; font-size: 12px; margin-top: 8px; }
  `]
})
export class CopyToRepoDialogComponent {
  public targetRepo: string = '';
  public targetPath: string = '';
  public overwrite: boolean = false;
  public isCopying: boolean = false;
  public errorMessage: string = '';

  constructor(
    public dialogRef: MatDialogRef<CopyToRepoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CopyToRepoDialogData,
    private restService: RestService
  ) {
    this.targetRepo = data.defaultTargetRepo || (data.targetRepos?.[0]?.folderName || '');
    this.targetPath = data.defaultTargetPath || data.sourcePath;
  }

  onCopy(): void {
    if (!this.targetRepo || !this.targetPath.trim()) return;
    this.isCopying = true;
    this.errorMessage = '';
    this.restService.copyGitArtifact$({
      sourceRepo: this.data.sourceRepo,
      sourcePath: this.data.sourcePath,
      targetRepo: this.targetRepo,
      targetPath: this.targetPath.trim(),
      overwrite: this.overwrite
    }).subscribe({
      next: (res) => {
        this.isCopying = false;
        this.dialogRef.close({ copied: true, targetRepo: this.targetRepo, copiedFiles: res.copiedFiles || [] });
      },
      error: (err) => {
        this.isCopying = false;
        this.errorMessage = err.error?.error || err.message || 'Copy failed';
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
