import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  originalLineNum?: number;
  modifiedLineNum?: number;
}

export interface SideBySideLine {
  left?: {
    lineNum: number;
    text: string;
    type: 'removed' | 'unchanged';
  };
  right?: {
    lineNum: number;
    text: string;
    type: 'added' | 'unchanged';
  };
}

@Component({
  selector: 'app-diff-dialog',
  templateUrl: './diff-dialog.component.html',
  styleUrls: ['./diff-dialog.component.css'],
  standalone: false
})
export class DiffDialogComponent implements OnInit {
  filename: string;
  originalContent: string;
  modifiedContent: string;
  diffLines: DiffLine[] = [];
  viewMode: 'inline' | 'side-by-side' = 'side-by-side';
  sideBySideLines: SideBySideLine[] = [];
  isMaximized = false;

  constructor(
    public dialogRef: MatDialogRef<DiffDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { filename: string; originalContent: string; modifiedContent: string }
  ) {
    this.filename = data.filename;
    this.originalContent = data.originalContent;
    this.modifiedContent = data.modifiedContent;
  }

  ngOnInit(): void {
    this.computeDiff();
  }

  download(): void {
    const blob = new Blob([this.modifiedContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  close(): void {
    this.dialogRef.close();
  }

  toggleMaximize(): void {
    this.isMaximized = !this.isMaximized;
    if (this.isMaximized) {
      this.dialogRef.updateSize('100vw', '100vh');
      this.dialogRef.addPanelClass('maximized-dialog');
    } else {
      this.dialogRef.updateSize('90vw', '85vh');
      this.dialogRef.removePanelClass('maximized-dialog');
    }
  }

  setViewMode(mode: 'inline' | 'side-by-side'): void {
    this.viewMode = mode;
  }

  private computeDiff(): void {
    const oldLines = this.originalContent.split(/\r?\n/);
    const newLines = this.modifiedContent.split(/\r?\n/);

    const MAX_DP_CELLS = 2_000_000;
    if (oldLines.length * newLines.length > MAX_DP_CELLS) {
      this.diffLines = [{
        type: 'unchanged',
        text: '(Diff too large to render in browser. Use Download to review the modified file.)'
      }];
      return;
    }

    const dp: number[][] = [];
    for (let x = 0; x <= oldLines.length; x++) {
      dp[x] = Array(newLines.length + 1).fill(0) as number[];
    }

    for (let x = 1; x <= oldLines.length; x++) {
      for (let y = 1; y <= newLines.length; y++) {
        if (oldLines[x - 1] === newLines[y - 1]) {
          dp[x][y] = dp[x - 1][y - 1] + 1;
        } else {
          dp[x][y] = Math.max(dp[x - 1][y], dp[x][y - 1]);
        }
      }
    }

    const diff: DiffLine[] = [];
    let i = oldLines.length;
    let j = newLines.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diff.unshift({
          type: 'unchanged',
          text: oldLines[i - 1],
          originalLineNum: i,
          modifiedLineNum: j
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({
          type: 'added',
          text: newLines[j - 1],
          modifiedLineNum: j
        });
        j--;
      } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
        diff.unshift({
          type: 'removed',
          text: oldLines[i - 1],
          originalLineNum: i
        });
        i--;
      }
    }

    this.diffLines = diff;
    this.computeSideBySide();
  }

  private computeSideBySide(): void {
    const lines: SideBySideLine[] = [];
    let i = 0;
    while (i < this.diffLines.length) {
      const current = this.diffLines[i];
      if (current.type === 'unchanged') {
        lines.push({
          left: { lineNum: current.originalLineNum!, text: current.text, type: 'unchanged' },
          right: { lineNum: current.modifiedLineNum!, text: current.text, type: 'unchanged' }
        });
        i++;
      } else {
        // Collect consecutive removed and added lines
        const removedBlock: DiffLine[] = [];
        const addedBlock: DiffLine[] = [];
        
        while (i < this.diffLines.length && this.diffLines[i].type !== 'unchanged') {
          if (this.diffLines[i].type === 'removed') {
            removedBlock.push(this.diffLines[i]);
          } else {
            addedBlock.push(this.diffLines[i]);
          }
          i++;
        }
        
        // Pair them up up to the max length of either block
        const maxLen = Math.max(removedBlock.length, addedBlock.length);
        for (let k = 0; k < maxLen; k++) {
          const rem = removedBlock[k];
          const add = addedBlock[k];
          lines.push({
            left: rem ? { lineNum: rem.originalLineNum!, text: rem.text, type: 'removed' } : undefined,
            right: add ? { lineNum: add.modifiedLineNum!, text: add.text, type: 'added' } : undefined
          });
        }
      }
    }
    this.sideBySideLines = lines;
  }
}
