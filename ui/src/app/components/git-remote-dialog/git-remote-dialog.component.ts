import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RestService } from '../../services/rest.service';

export interface GitRemoteDialogData {
  projectId: string;
  remotes: Array<{ name: string; url: string }>;
  isMemoryRepo?: boolean;
}

@Component({
  selector: 'app-git-remote-dialog',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon>cloud_upload</mat-icon> Upstream Remote — {{ data.projectId }}
    </h2>
    <mat-dialog-content class="dialog-body">
      <p class="hint-text" *ngIf="data.isMemoryRepo">
        <strong>{{ data.projectId }}</strong> works locally without an upstream remote. You can optionally attach a Git remote URL below if you want to back up or share database memories across teams.
      </p>
      <p class="hint-text" *ngIf="!data.isMemoryRepo">
        Configure or update the upstream remote URL for <strong>{{ data.projectId }}</strong>.
      </p>

      <div class="existing-remotes" *ngIf="remotes.length > 0">
        <div class="section-label">Configured Remotes</div>
        <div class="remote-row" *ngFor="let r of remotes">
          <strong>{{ r.name }}</strong>: <code>{{ r.url }}</code>
        </div>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Remote Name</mat-label>
        <input matInput [(ngModel)]="remoteName" placeholder="origin" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Remote URL (HTTPS or SSH)</mat-label>
        <input matInput [(ngModel)]="remoteUrl" placeholder="https://github.com/org/repo.git" />
      </mat-form-field>

      <div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onCancel()" [disabled]="isSaving">Cancel</button>
      <button mat-raised-button color="primary" type="button"
        (click)="onSave()"
        [disabled]="isSaving || !remoteName.trim() || !remoteUrl.trim()">
        <mat-icon>save</mat-icon> {{ isSaving ? 'Saving...' : 'Save Remote' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title { display: flex; align-items: center; gap: 8px; }
    .dialog-body { min-width: 480px; }
    .hint-text { font-size: 13px; opacity: 0.85; margin-top: 0; }
    .existing-remotes { margin-bottom: 12px; padding: 8px 10px; border: 1px solid var(--app-border-color, #ccc); border-radius: 4px; font-size: 12px; }
    .section-label { font-weight: 600; margin-bottom: 4px; }
    .remote-row { margin: 2px 0; word-break: break-all; }
    .full-width { width: 100%; }
    .error-banner { color: #d32f2f; font-size: 12px; }
  `]
})
export class GitRemoteDialogComponent {
  public remotes: Array<{ name: string; url: string }> = [];
  public remoteName: string = 'origin';
  public remoteUrl: string = '';
  public isSaving: boolean = false;
  public errorMessage: string = '';

  constructor(
    public dialogRef: MatDialogRef<GitRemoteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GitRemoteDialogData,
    private restService: RestService
  ) {
    this.remotes = data.remotes || [];
    const origin = this.remotes.find(r => r.name === 'origin');
    if (origin) {
      this.remoteUrl = origin.url;
    }
  }

  onSave(): void {
    const name = this.remoteName.trim();
    const url = this.remoteUrl.trim();
    if (!name || !url) return;

    this.isSaving = true;
    this.errorMessage = '';
    this.restService.setGitRemote$(this.data.projectId, url, name).subscribe({
      next: (res) => {
        this.isSaving = false;
        this.dialogRef.close({ saved: true, remotes: res.remotes });
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMessage = err.error?.error || err.message || 'Failed to save remote';
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
