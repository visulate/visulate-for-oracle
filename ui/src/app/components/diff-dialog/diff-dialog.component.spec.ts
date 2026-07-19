import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiffDialogComponent } from './diff-dialog.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

describe('DiffDialogComponent', () => {
  let component: DiffDialogComponent;
  let fixture: ComponentFixture<DiffDialogComponent>;
  let mockDialogRef: any;

  beforeEach(async () => {
    mockDialogRef = {
      close: jasmine.createSpy('close'),
      updateSize: jasmine.createSpy('updateSize'),
      addPanelClass: jasmine.createSpy('addPanelClass'),
      removePanelClass: jasmine.createSpy('removePanelClass')
    };

    await TestBed.configureTestingModule({
      declarations: [ DiffDialogComponent ],
      imports: [
        NoopAnimationsModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            filename: 'test.sql',
            originalContent: 'SELECT * FROM dual;\nLINE 2;\nLINE 3;',
            modifiedContent: 'SELECT * FROM dual;\nLINE 2 MODIFIED;\nLINE 3;\nLINE 4;'
          }
        }
      ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DiffDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute diff lines correctly', () => {
    expect(component.diffLines.length).toBeGreaterThan(0);
    const added = component.diffLines.filter(l => l.type === 'added');
    const removed = component.diffLines.filter(l => l.type === 'removed');
    expect(added.length).toBe(2); // LINE 2 MODIFIED and LINE 4
    expect(removed.length).toBe(1); // LINE 2
  });

  it('should compute side-by-side lines correctly', () => {
    expect(component.sideBySideLines.length).toBeGreaterThan(0);
    // There should be a mapped row containing left: removed 'LINE 2' and right: added 'LINE 2 MODIFIED'
    const pairedRow = component.sideBySideLines.find(r => r.left?.type === 'removed' && r.right?.type === 'added');
    expect(pairedRow).toBeTruthy();
    expect(pairedRow?.left?.text).toBe('LINE 2;');
    expect(pairedRow?.right?.text).toBe('LINE 2 MODIFIED;');
  });

  it('should toggle viewMode', () => {
    expect(component.viewMode).toBe('side-by-side');
    component.setViewMode('inline');
    expect(component.viewMode).toBe('inline');
  });

  it('should toggle maximize', () => {
    expect(component.isMaximized).toBeFalse();
    component.toggleMaximize();
    expect(component.isMaximized).toBeTrue();
    expect(mockDialogRef.updateSize).toHaveBeenCalledWith('100vw', '100vh');
    expect(mockDialogRef.addPanelClass).toHaveBeenCalledWith('maximized-dialog');

    component.toggleMaximize();
    expect(component.isMaximized).toBeFalse();
    expect(mockDialogRef.updateSize).toHaveBeenCalledWith('90vw', '85vh');
    expect(mockDialogRef.removePanelClass).toHaveBeenCalledWith('maximized-dialog');
  });

  it('should close dialog', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });
});
