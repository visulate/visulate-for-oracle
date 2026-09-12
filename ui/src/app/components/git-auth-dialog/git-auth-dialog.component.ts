import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { FormBuilder, FormGroup } from '@angular/forms';
import { RestService, GitAuthSession } from '../../services/rest.service';

@Component({
  selector: 'app-git-auth-dialog',
  templateUrl: './git-auth-dialog.component.html',
  styleUrls: ['./git-auth-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class GitAuthDialogComponent {
  form: FormGroup;
  hideToken = true;

  constructor(
    public dialogRef: MatDialogRef<GitAuthDialogComponent>,
    private fb: FormBuilder,
    private restService: RestService
  ) {
    const existing = this.restService.getGitAuth() || {};
    this.form = this.fb.group({
      username: [existing.username || ''],
      token: [existing.token || ''],
      authorName: [existing.authorName || ''],
      authorEmail: [existing.authorEmail || '']
    });
  }

  get hasExistingAuth(): boolean {
    const auth = this.restService.getGitAuth();
    return !!(auth && (auth.token || auth.username));
  }

  onSave(): void {
    const val = this.form.value;
    const sessionAuth: GitAuthSession = {
      username: (val.username || '').trim(),
      token: (val.token || '').trim(),
      authorName: (val.authorName || '').trim(),
      authorEmail: (val.authorEmail || '').trim()
    };

    this.restService.setGitAuth(sessionAuth);
    this.dialogRef.close({ saved: true, auth: sessionAuth });
  }

  onClear(): void {
    this.restService.clearGitAuth();
    this.form.patchValue({
      username: '',
      token: '',
      authorName: '',
      authorEmail: ''
    });
    this.dialogRef.close({ cleared: true });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
