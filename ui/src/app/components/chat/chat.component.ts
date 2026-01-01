import { Component, OnInit, Input, ElementRef, ViewChild, AfterViewChecked, OnChanges, SimpleChanges, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { StateService } from '../../services/state.service';
import { RestService } from '../../services/rest.service';
import { MatDialog } from '@angular/material/dialog';
import { CredentialDialogComponent } from '../../components/credential-dialog/credential-dialog.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  standalone: false
})
export class ChatComponent implements OnInit, OnChanges, OnDestroy, AfterViewChecked {
  @Input() currentContext: any;
  @Input() currentObject: any;
  @Input() agent: string;
  @ViewChild('messageContainer') private messageContainer: ElementRef;

  chatForm: FormGroup;
  messages$ = this.stateService.chatHistory$;
  isLoading: boolean = false;
  currentStatus: string | null = null;
  private chunkBuffer: string = '';

  private abortController: AbortController | null = null;

  constructor(
    private fb: FormBuilder,
    private restService: RestService,
    private stateService: StateService,
    private dialog: MatDialog,
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
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

        // Automatically retry the last user message
        const history = this.stateService.getChatHistory();
        // Clone and reverse to find the last user message
        const lastUserMsg = [...history].reverse().find(m => m.user === 'You');
        if (lastUserMsg) {
          this.sendMessage(lastUserMsg.text);
        }
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
          // Open download links and external links in a new tab
          event.preventDefault();
          window.open(href, '_blank');
        }
      }
    }
  }

  ngOnInit(): void {
    // No initial fetch needed, agent fetches its own context
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentContext) {
      this.currentContext = changes.currentContext.currentValue;
    }
    // We don't necessarily need to clear chat on object change if we want global history,
    // but typically users might want context separation.
    // For now, per requirements, we maintain state.
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  sendMessage(specificMessage?: string): void {
    const userMessage = specificMessage || this.chatForm.get('message')?.value;
    if (!userMessage || !userMessage.trim()) return;

    // Add user message to state
    this.stateService.addMessage({ user: 'You', text: userMessage });
    if (!specificMessage) {
      this.chatForm.reset();
    }

    this.isLoading = true;
    this.abortController = new AbortController();

    // Create initial agent message placeholder
    this.stateService.addMessage({ user: 'Visulate', text: '' });

    // Prepare lightweight context
    const context = {
      endpoint: this.currentContext?.endpoint,
      owner: this.currentContext?.owner,
      objectType: this.currentContext?.objectType,
      objectName: this.currentContext?.objectName,
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
      chatHistory: this.stateService.getChatHistory().map(m => ({ role: m.user === 'You' ? 'user' : 'model', parts: [{ text: m.text }] })).slice(0, -1) // Exclude current empty response
    };

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
          this.currentStatus = null;
          this.chunkBuffer = '';
          this.abortController = null;
          this.cdr.detectChanges();
        });
      },
      (error) => {
        this.zone.run(() => {
          if (error.name !== 'AbortError') {
            console.error('Error calling LLM:', error);
            this.stateService.updateLastMessage("Error: " + (error.message || "Failed to generate response"));
          }
          this.isLoading = false;
          this.abortController = null;
          this.cdr.detectChanges();
        });
      },
      this.abortController.signal
    );
  }

  cancelGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isLoading = false;
    this.stateService.addMessage({ user: 'System', text: 'Generation cancelled by user.' });
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
}
