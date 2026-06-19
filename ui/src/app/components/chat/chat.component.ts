import { Component, OnInit, Input, ElementRef, ViewChild, OnChanges, SimpleChanges, OnDestroy, NgZone, ChangeDetectorRef, TemplateRef, ViewContainerRef, AfterViewInit } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StateService } from '../../services/state.service';
import { RestService } from '../../services/rest.service';
import { MatDialog } from '@angular/material/dialog';
import { CredentialDialogComponent } from '../../components/credential-dialog/credential-dialog.component';
import { DiffDialogComponent } from '../../components/diff-dialog/diff-dialog.component';
import { FileViewerDialogComponent } from '../../components/file-viewer-dialog/file-viewer-dialog.component';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  standalone: false
})
export class ChatComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() currentContext: any;
  @Input() currentObject: any;
  @Input() agent: string;
  @ViewChild('messageContainer') private messageContainer: ElementRef;
  @ViewChild('chatTemplate') chatTemplate: TemplateRef<any>;

  portal: TemplatePortal;
  private overlayRef: OverlayRef;

  chatForm: FormGroup;
  messages$ = this.stateService.chatHistory$;
  uploadedFiles$ = this.stateService.uploadedFiles$;
  isLoading: boolean = false;
  isFullScreen: boolean = false;
  currentStatus: string | null = null;
  private chunkBuffer: string = '';
  elapsedTime: number = 0;
  private timerInterval: any;
  formattedTime: string = '00:00';

  private abortController: AbortController | null = null;
  private unsubscribe$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private restService: RestService,
    private stateService: StateService,
    private dialog: MatDialog,
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) {
    this.chatForm = this.fb.group({
      message: ['']
    });
  }

  openCredentialsDialog(): void {
    const dialogRef = this.dialog.open(CredentialDialogComponent, {
      width: '400px',
      data: { database: this.currentContext?.endpoint || '' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.token) {
        this.stateService.addMessage({ user: 'System', text: `Authentication successful for ${result.database}. Token received and stored.` });
        this.stateService.setAuthToken(result.database, result.token);
      }
    });
  }

  handleLinkClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href) {
        if (href.startsWith('/database') || href.startsWith('database')) {
          event.preventDefault();
          // Ensure path starts with /
          const path = href.startsWith('/') ? href : '/' + href;
          this.router.navigateByUrl(path);
        } else if (href.startsWith('/download') || href.startsWith('http')) {
          event.preventDefault();
          // Check if this is a download endpoint link matching an uploaded file or active database object
          const downloadMatch = href.match(/\/download\/[^/]+\/([^/?#]+)/);
          if (href.startsWith('/download') && downloadMatch) {
            const filename = decodeURIComponent(downloadMatch[1]);
            let originalContent = this.stateService.getSessionUploadedFileContent(filename);

            if (originalContent === undefined) {
              // Try to match current active object's Source property
              if (this.currentContext && this.currentContext.objectName && this.currentObject) {
                const baseFilename = filename.split('.')[0].toLowerCase();
                const objName = this.currentContext.objectName.toLowerCase();
                if (baseFilename === objName || filename.toLowerCase().includes(objName)) {
                  const sourceProp = this.currentObject.objectProperties?.find((p: any) => p.title === 'Source');
                  if (sourceProp && sourceProp.rows) {
                    originalContent = sourceProp.rows.map((row: any) => row.Text || '').join('');
                  }
                }
              }
            }

            if (originalContent !== undefined) {
              // Fetch modified content and show diff
              this.http.get(href, { responseType: 'text' }).subscribe({
                next: (modifiedContent: string) => {
                  this.dialog.open(DiffDialogComponent, {
                    data: {
                      filename: filename,
                      originalContent: originalContent,
                      modifiedContent: modifiedContent
                    },
                    width: '90vw',
                    maxWidth: '1200px',
                    panelClass: 'visulate-diff-dialog-panel'
                  });
                },
                error: (err) => {
                  console.error('Failed to fetch modified file content', err);
                  this.snackBar.open(`Failed to load modified file "${filename}"`, 'Close', { duration: 5000 });
                }
              });
              return;
            }
          }
          // Default action: Open download links and external links in a new tab
          window.open(href, '_blank');
        }
      }
    }
  }

  ngOnInit(): void {
    this.stateService.isChatFullScreen$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((isFullScreen: boolean) => {
        this.isFullScreen = isFullScreen;
        if (this.isFullScreen) {
          this.showFullScreen();
        } else {
          this.hideFullScreen();
        }
        this.cdr.detectChanges();
      });

    this.stateService.credentialsChanged$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => {
        this.cdr.detectChanges();
      });

    this.messages$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => {
        setTimeout(() => this.scrollToBottom(), 50);
      });
  }

  ngAfterViewInit() {
    this.portal = new TemplatePortal(this.chatTemplate, this.viewContainerRef);
    this.cdr.detectChanges(); // Fix initial "blank screen" by triggering CD for portal outlet
  }

  private showFullScreen() {
    if (!this.portal) {
      // If portal isn't initialized yet (e.g. initial load in fullscreen), 
      // wait until ngAfterViewInit runs.
      return;
    }

    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        height: '100dvh',
        width: '100vw',
        positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
        hasBackdrop: true,
        panelClass: ['chat-fullscreen-overlay', 'cdk-overlay-pane-fullscreen']
      });
    }

    if (!this.overlayRef.hasAttached()) {
      if (this.portal.isAttached) {
        this.portal.detach(); // Detach from inline outlet before moving to overlay
      }
      this.overlayRef.attach(this.portal);
    }
    document.body.style.overflow = 'hidden';
    document.body.classList.add('chat-fullscreen-active');
  }

  private hideFullScreen() {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      this.overlayRef.detach();
    }
    // Note: The template's [cdkPortalOutlet] will re-attach the portal automatically 
    // because its *ngIf becomes true and we call cdr.detectChanges() in the subscription.
    document.body.style.overflow = '';
    document.body.classList.remove('chat-fullscreen-active');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentContext) {
      this.currentContext = changes.currentContext.currentValue;
      this.cdr.detectChanges(); // Ensure UI updates when context changes
    }
    // We don't necessarily need to clear chat on object change if we want global history,
    // but typically users might want context separation.
    // For now, per requirements, we maintain state.
  }

  ngOnDestroy(): void {
    if (this.isFullScreen) {
      this.stateService.toggleChatFullScreen(); // Reset global state if destroyed while active
    }
    if (this.overlayRef) {
      this.overlayRef.dispose();
    }
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.stopTimer();
  }

  private startTimer() {
    this.elapsedTime = 0;
    this.formattedTime = '00:00';
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.elapsedTime++;
      const minutes = Math.floor(this.elapsedTime / 60);
      const seconds = this.elapsedTime % 60;
      this.formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      this.cdr.detectChanges();
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }


  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent default newline
      if (this.chatForm.valid && !this.isLoading) {
        this.sendMessage();
      }
    }
  }

  sendMessage(specificMessage?: string): void {
    const userMessage = specificMessage || this.chatForm.get('message')?.value;
    if (!userMessage || !userMessage.trim()) return;

    const currentAttachments = [...this.stateService.getUploadedFiles()];
    // Add user message to state
    this.stateService.addMessage({ user: 'You', text: userMessage, attachments: currentAttachments });
    if (!specificMessage) {
      this.chatForm.reset();
    }

    this.isLoading = true;
    this.startTimer();
    this.abortController = new AbortController();

    // Create initial agent message placeholder
    this.stateService.addMessage({ user: 'Visulate', text: '' });

    // Prepare lightweight context
    const context = {
      endpoint: this.currentContext?.endpoint,
      owner: this.currentContext?.owner,
      objectType: this.currentContext?.objectType,
      objectName: this.currentContext?.objectName,
      filter: this.currentContext?.filter,
      objectList: this.currentContext?.objectList,
      currentObject: this.currentObject,
      authToken: this.stateService.getAuthToken(this.currentContext?.endpoint), // Get current token
      dbCredentials: sessionStorage.getItem('visulate-credentials'), // Get ALL raw credentials for dynamic token creation
      // Chat history is maintained by state, but agent might need it.
      // Ideally agent manages session, but for now we can send history if needed.
      // Or we assume the session ID in backend handles history?
      // The backend agent uses InMemorySessionService, so it has history within a session.
      // But we create a NEW session on each request in the current agent.py?
      // Wait, agent.py creates a new session every time: session_id = str(uuid.uuid4())
      // We need to fix that or send history.
      // Let's send history for now to be safe, or coordinate session ID.
      // Sending history in context is safer for stateless backend.
      // Sending history in context is safer for stateless backend.
      chatHistory: this.stateService.getChatHistory().map(m => ({ role: m.user === 'You' ? 'user' : 'model', parts: [{ text: m.text }] })).slice(0, -1), // Exclude current empty response
      session_id: this.stateService.getSessionId(), // Include session_id from state
      attachments: this.stateService.getUploadedFiles() // Include file attachments
    };

    // Clear uploaded files after adding to context so UI resets
    this.stateService.clearUploadedFiles();

    // Need to send lightweight context, Agent will use tools to get details.

    this.restService.chatStream(
      userMessage,
      context,
      this.agent,
      (chunk) => {
        this.zone.run(() => {
          this.chunkBuffer += chunk;

          // Process full lines from the buffer
          if (this.chunkBuffer.includes('\n')) {
            const lines = this.chunkBuffer.split('\n');
            // Keep the last partial line in the buffer
            this.chunkBuffer = lines.pop() || '';

            for (const line of lines) {
              if (line.includes('▌STATUS: ')) {
                this.currentStatus = line.replace('▌STATUS: ', '').trim();
              } else if (line.includes('▌ERROR: ')) {
                const errorMsg = line.replace('▌ERROR: ', '').trim();
                this.stateService.updateLastMessage("Error: " + errorMsg);
                this.isLoading = false;
              } else if (line.trim()) {
                const currentHistory = this.stateService.getChatHistory();
                const lastMsg = currentHistory[currentHistory.length - 1];
                this.stateService.updateLastMessage(lastMsg.text + line + '\n');
              }
            }
          } else if (!this.chunkBuffer.includes('▌')) {
            // If no marker is potentially present, we can flush part of the buffer if it's getting long
            // but usually chunks are small, so appending to lastMsg is fine.
            // For safety, let's only append to lastMsg if we are sure it's not a status line in progress.
            // If the buffer doesn't start with the marker prefix, it's probably regular text.
            if (this.chunkBuffer.length > 50 && !this.chunkBuffer.startsWith('▌')) {
              const currentHistory = this.stateService.getChatHistory();
              const lastMsg = currentHistory[currentHistory.length - 1];
              this.stateService.updateLastMessage(lastMsg.text + this.chunkBuffer);
              this.chunkBuffer = '';
            }
          }
          this.cdr.detectChanges();
        });
      },
      () => {
        this.zone.run(() => {
          // Flush remaining buffer
          if (this.chunkBuffer && !this.chunkBuffer.includes('▌STATUS: ')) {
            const currentHistory = this.stateService.getChatHistory();
            const lastMsg = currentHistory[currentHistory.length - 1];
            this.stateService.updateLastMessage(lastMsg.text + this.chunkBuffer);
          }
          this.isLoading = false;
          this.stopTimer();
          this.currentStatus = null;
          this.chunkBuffer = '';
          this.abortController = null;
          this.cdr.detectChanges();
        });
      },
      (error) => {
        this.zone.run(() => {
          this.stopTimer();
          if (error.name !== 'AbortError') {
            console.error('Error calling LLM:', error);
            const isTimeout = error.isNetworkError && this.elapsedTime > 200;
            const errorMsg = isTimeout 
              ? "The connection was interrupted (Likely a network timeout). The session is still active; you can try refreshing the page or asking me to 'continue'."
              : (error.message || "Failed to generate response");
            
            this.stateService.updateLastMessage("Error: " + errorMsg);
          }
          this.isLoading = false;
          this.abortController = null;
          this.cdr.detectChanges();
        });
      },
      (sessionId) => {
        this.stateService.setSessionId(sessionId);
      },
      this.abortController.signal
    );
  }

  newChat(): void {
    if (this.isLoading) {
      this.cancelGeneration();
    }
    this.stateService.clearChatHistory();
  }

  cancelGeneration(): void {
    this.stopTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.isLoading) {
      this.stateService.addMessage({ user: 'System', text: 'Generation cancelled by user.' });
    }
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private scrollToBottom(): void {
    try {
      if (this.messageContainer) {
        this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Scroll to bottom failed:', err);
    }
  }



  toggleFullScreen(): void {
    this.stateService.toggleChatFullScreen();
  }

  downloadMessages(): void {
    const history = this.stateService.getChatHistory();
    const text = history.map(m => `${m.user}: ${m.text}`).join('\n\n');
    const element = document.createElement('a');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    element.href = url;
    element.download = `chat_history.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  getCredentialState(): 'none' | 'partial' | 'matched' {
    const tokens = this.stateService.getAllAuthTokens();
    const saved = sessionStorage.getItem('visulate-credentials');
    let credentials: any = {};
    if (saved) {
      try { credentials = JSON.parse(saved); } catch (e) {}
    }

    const currentEndpoint = this.currentContext?.endpoint;
    
    // Check for matched (active token OR saved credentials for current endpoint)
    const hasToken = currentEndpoint && tokens[currentEndpoint];
    const hasSaved = currentEndpoint && credentials[currentEndpoint];
    
    if (hasToken || hasSaved) {
      return 'matched';
    }
    
    // Check for partial (tokens or saved credentials for OTHER endpoints)
    const hasOtherTokens = Object.keys(tokens).length > 0;
    const hasOtherSaved = Object.keys(credentials).length > 0;
    
    if (hasOtherTokens || hasOtherSaved) {
      return 'partial';
    }
    
    return 'none';
  }

  getCredentialColor(): string | null {
    const state = this.getCredentialState();
    if (state === 'matched') return 'warn'; // Amber/Orange
    if (state === 'partial') return 'primary'; // Blue
    return null; // Grey
  }

  getCredentialTooltip(): string {
    const state = this.getCredentialState();
    if (state === 'matched') return `Credentials active for ${this.currentContext?.endpoint}`;
    if (state === 'partial') return 'Credentials saved for other databases';
    return 'Connect to Database';
  }

  onFileSelected(event: any): void {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;

    let currentCount = this.stateService.getUploadedFiles().length;
    const MAX_FILES = environment.maxFiles || 10;

    for (let i = 0; i < files.length; i++) {
      if (currentCount >= MAX_FILES) {
        this.snackBar.open(`Maximum of ${MAX_FILES} files can be attached at a time.`, 'Close', { duration: 5000 });
        break;
      }
      this.validateAndUploadFile(files[i], MAX_FILES);
      currentCount++;
    }
    // Reset file input value so the same file can be uploaded again if removed
    event.target.value = '';
  }

  removeFile(name: string): void {
    this.stateService.removeUploadedFile(name);
  }

  viewFileContent(file: { name: string; content: string }, canRemove = false): void {
    this.dialog.open(FileViewerDialogComponent, {
      data: {
        filename: file.name,
        content: file.content,
        canRemove
      },
      maxWidth: '95vw',
      maxHeight: '90vh'
    });
  }

  private validateAndUploadFile(file: File, maxFiles = environment.maxFiles || 10): void {
    // 1. Check size limit: 100KB (102400 bytes)
    const MAX_SIZE = 100 * 1024;
    if (file.size > MAX_SIZE) {
      this.snackBar.open(`File "${file.name}" exceeds the 100KB limit (${Math.round(file.size / 1024)}KB).`, 'Close', { duration: 5000 });
      return;
    }

    // 2. Check total files count (limit to maxFiles)
    if (this.stateService.getUploadedFiles().length >= maxFiles) {
      this.snackBar.open(`Maximum of ${maxFiles} files can be attached at a time.`, 'Close', { duration: 5000 });
      return;
    }

    // 3. Whitelist check
    const whitelist = ['.txt', '.sql', '.py', '.java', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', '.sh', '.bash', '.pls', '.plb', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.php', '.rb', '.md', '.xml', '.hbs', '.handlebars'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!whitelist.includes(ext)) {
      this.snackBar.open(`File "${file.name}" has an unsupported extension (${ext}). Only source code/text files are allowed.`, 'Close', { duration: 5000 });
      return;
    }

    // 4. Binary check (null bytes and control character ratio check)
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const buffer = e.target.result as ArrayBuffer;
      const arr = new Uint8Array(buffer);
      let hasNullByte = false;
      let controlCount = 0;

      for (let i = 0; i < arr.length; i++) {
        const charCode = arr[i];
        if (charCode === 0) {
          hasNullByte = true;
          break;
        }
        // ASCII control chars below 32, except TAB (9), LF (10), CR (13)
        if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
          controlCount++;
        }
      }

      if (hasNullByte) {
        this.snackBar.open(`File "${file.name}" appears to be binary and is not supported.`, 'Close', { duration: 5000 });
        return;
      }

      const controlRatio = arr.length > 0 ? controlCount / arr.length : 0;
      if (controlRatio > 0.02) {
        this.snackBar.open(`File "${file.name}" contains too many binary/control characters and is not supported.`, 'Close', { duration: 5000 });
        return;
      }

      // If validation succeeds, read as text and add to state
      const textReader = new FileReader();
      textReader.onload = (evt: any) => {
        const content = evt.target.result as string;
        this.stateService.addUploadedFile({
          name: file.name,
          content: content,
          size: file.size
        });
      };
      textReader.readAsText(file);
    };
    reader.readAsArrayBuffer(file);
  }
}
