import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RestService } from '../../services/rest.service';
import { StateService } from '../../services/state.service';

export interface GitAssociationsDialogData {
  databases: Array<{ endpoint: string; description: string }>;
  repos: Array<{ folderName: string; isMemoryRepo?: boolean }>;
  links: Array<{ db: string; repo: string; role: string }>;
  defaultDb?: string;
  defaultRepo?: string;
}

@Component({
  selector: 'app-git-associations-dialog',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon>link</mat-icon> Database ↔ Repository Associations
    </h2>
    <mat-dialog-content class="dialog-body">
      <p class="hint-text">
        Link databases and repositories many-to-many. For example, link an application repo to both a <strong>source</strong> (Oracle) and <strong>target</strong> (Postgres) database, or link a DBA repo to <strong>All Databases (*)</strong>. Saved in <code>visulate-memory/associations.json</code>.
      </p>

      <div class="add-row">
        <mat-form-field appearance="outline" class="field-db">
          <mat-label>Database</mat-label>
          <mat-select [(ngModel)]="newDb">
            <mat-option value="*">* (All Databases)</mat-option>
            <mat-option *ngFor="let db of data.databases" [value]="db.endpoint">
              {{ db.endpoint }} ({{ db.description }})
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-repo">
          <mat-label>Repository</mat-label>
          <mat-select [(ngModel)]="newRepo">
            <mat-option *ngFor="let r of assignableRepos" [value]="r.folderName">
              {{ r.folderName }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="field-role">
          <mat-label>Role</mat-label>
          <mat-select [(ngModel)]="newRole">
            <mat-option value="app">app</mat-option>
            <mat-option value="source">source (before)</mat-option>
            <mat-option value="target">target (after)</mat-option>
            <mat-option value="dba">dba</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-raised-button color="primary" type="button"
          (click)="addLink()" [disabled]="isBusy || !newDb || !newRepo">
          <mat-icon>add_link</mat-icon> Link
        </button>
      </div>

      <div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>

      <div class="links-table" *ngIf="links.length > 0; else noLinks">
        <div class="link-row" *ngFor="let l of links">
          <span class="cell-db"><mat-icon class="mini">storage</mat-icon> {{ l.db === '*' ? '* (All Databases)' : l.db }}</span>
          <span class="arrow">↔</span>
          <span class="cell-repo"><mat-icon class="mini">folder_special</mat-icon> {{ l.repo }}</span>
          <span class="role-badge" [ngClass]="'role-' + l.role">{{ l.role }}</span>
          <button mat-icon-button color="warn" type="button" matTooltip="Remove link"
            [disabled]="isBusy" (click)="removeLink(l)">
            <mat-icon>link_off</mat-icon>
          </button>
        </div>
      </div>

      <ng-template #noLinks>
        <div class="empty-state">No database-to-repository links configured yet.</div>
      </ng-template>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-raised-button color="primary" type="button" (click)="onClose()">Done</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title { display: flex; align-items: center; gap: 8px; }
    .dialog-body { min-width: 620px; max-width: 760px; }
    .hint-text { font-size: 13px; opacity: 0.85; margin-top: 0; }
    .add-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .field-db { flex: 1.3; min-width: 160px; }
    .field-repo { flex: 1.2; min-width: 150px; }
    .field-role { flex: 0.9; min-width: 120px; }
    .links-table { max-height: 260px; overflow-y: auto; border: 1px solid var(--app-border-color, #ccc); border-radius: 4px; padding: 6px 10px; }
    .link-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid rgba(128,128,128,0.12); font-size: 13px; }
    .link-row:last-child { border-bottom: none; }
    .cell-db, .cell-repo { display: inline-flex; align-items: center; gap: 4px; flex: 1; }
    .mini { font-size: 16px; width: 16px; height: 16px; }
    .arrow { opacity: 0.6; }
    .role-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
    .role-app { background: rgba(59,130,246,0.15); color: #1d4ed8; }
    .role-source { background: rgba(245,158,11,0.2); color: #b45309; }
    .role-target { background: rgba(16,185,129,0.2); color: #047857; }
    .role-dba { background: rgba(139,92,246,0.2); color: #6d28d9; }
    .empty-state { padding: 14px; text-align: center; opacity: 0.7; font-size: 13px; }
    .error-banner { color: #d32f2f; font-size: 12px; margin-bottom: 8px; }
  `]
})
export class GitAssociationsDialogComponent {
  public links: Array<{ db: string; repo: string; role: string }> = [];
  public newDb: string = '';
  public newRepo: string = '';
  public newRole: string = 'app';
  public isBusy: boolean = false;
  public errorMessage: string = '';

  constructor(
    public dialogRef: MatDialogRef<GitAssociationsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GitAssociationsDialogData,
    private restService: RestService,
    private state: StateService
  ) {
    this.links = [...(data.links || [])];
    this.newDb = data.defaultDb || (data.databases?.[0]?.endpoint || '');
    const nonMem = this.assignableRepos;
    this.newRepo = (data.defaultRepo && nonMem.some(r => r.folderName === data.defaultRepo))
      ? data.defaultRepo
      : (nonMem[0]?.folderName || '');
  }

  get assignableRepos(): Array<{ folderName: string; isMemoryRepo?: boolean }> {
    return (this.data.repos || []).filter(r => !r.isMemoryRepo && r.folderName !== this.state.getMemoryRepoName());
  }

  addLink(): void {
    if (!this.newDb || !this.newRepo) return;
    this.isBusy = true;
    this.errorMessage = '';
    this.restService.saveGitAssociation$(this.newDb, this.newRepo, this.newRole).subscribe({
      next: (res) => {
        this.isBusy = false;
        this.links = res.links || [];
        this.state.setAssociations(this.links);
      },
      error: (err) => {
        this.isBusy = false;
        this.errorMessage = err.error?.error || err.message || 'Failed to save link';
      }
    });
  }

  removeLink(link: { db: string; repo: string; role: string }): void {
    this.isBusy = true;
    this.errorMessage = '';
    this.restService.deleteGitAssociation$(link.db, link.repo).subscribe({
      next: (res) => {
        this.isBusy = false;
        this.links = res.links || [];
        this.state.setAssociations(this.links);
      },
      error: (err) => {
        this.isBusy = false;
        this.errorMessage = err.error?.error || err.message || 'Failed to remove link';
      }
    });
  }

  onClose(): void {
    this.dialogRef.close({ updated: true, links: this.links });
  }
}
