import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-file-viewer-dialog',
  templateUrl: './file-viewer-dialog.component.html',
  styleUrls: ['./file-viewer-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class FileViewerDialogComponent {
  filename: string;
  content: string;
  canRemove: boolean;

  constructor(
    public dialogRef: MatDialogRef<FileViewerDialogComponent>,
    private stateService: StateService,
    @Inject(MAT_DIALOG_DATA) public data: { filename: string; content: string; canRemove?: boolean }
  ) {
    this.filename = data.filename;
    this.content = data.content;
    this.canRemove = !!data.canRemove;
  }

  removeFile(): void {
    this.stateService.removeUploadedFile(this.filename);
    this.dialogRef.close();
  }

  close(): void {
    this.dialogRef.close();
  }
}
