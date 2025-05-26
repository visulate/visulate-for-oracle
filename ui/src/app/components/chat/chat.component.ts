import { Component, OnInit, Input,  ElementRef, ViewChild, AfterViewChecked, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnChanges { //, AfterViewChecked {
  @Input() currentContext: any;
  @Input() currentObject: any;
  @ViewChild('messageContainer') private messageContainer: ElementRef;
  chatForm: FormGroup;
  messages: { user: string, text: string }[] = [];
  collectionData: {
    objectDetails: any;
    relatedObjects: any;
    chatHistory: { user: string, text: string }[]
  };
  isLoading: boolean = false;
  counter: number = 0;
  intervalId: any;
  previousPayload: any = null;

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.chatForm = this.fb.group({
      message: ['']
    });
    this.collectionData = {
      objectDetails: this.currentObject,
      relatedObjects: [],
      chatHistory: []
    };
  }

  ngOnInit(): void {
    this.fetchData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentContext &&
        changes.currentContext.currentValue !== changes.currentContext.previousValue) {
      this.currentContext = changes.currentContext.currentValue;
    }
    if (changes.currentObject &&
        changes.currentObject.currentValue !== changes.currentObject.previousValue) {
      this.collectionData.objectDetails = changes.currentObject.currentValue;
      this.fetchData();
    }
  }

  sendMessage(): void {
    const userMessage = this.chatForm.get('message').value;
    this.messages.push({ user: 'You', text: userMessage });
    this.chatForm.reset();

    this.isLoading = true;
    this.counter = 0;
    this.startCounter();

    this.updateContext('You', userMessage);

    this.callLLM(userMessage).subscribe(
      response => {
        this.messages.push({ user: 'Visulate', text: response });
        this.isLoading = false;
        this.stopCounter();
        this.updateContext('Visulate', response);
      },
      error => {
        console.error('Error calling LLM:', error);
        this.isLoading = false;
        this.stopCounter();
      }
    );
  }

  callLLM(message: string): Observable<string> {
    const apiUrl = `${environment.aiBase}/`;
    this.startCounter();
    const payload = {
      context: this.collectionData,
      message: message
    };
    return this.http.post<string>(apiUrl, payload);
  }

  private fetchData(): void {
    const endpoint = `${this.currentContext.endpoint}/${this.currentContext.owner}/${this.currentContext.objectType}/${this.currentContext.objectName}`;
    //e.g. 'vis24/RNTMGR2/TABLE/RNT_ACCOUNTS_PAYABLE';
    const apiUrl = `${environment.apiBase}/${endpoint}?template=extract_links.hbs`;

    this.collectionData.objectDetails = this.currentObject;
    this.isLoading = true;
    this.counter = 0;
    this.startCounter();

    this.http.post(apiUrl, this.currentObject).subscribe(
      (response: any) => {
        //console.log('Data fetched successfully:', response);

        // Ensure the response is in the expected format
        if (response && response.object && response.baseUrl && response.relatedObjects) {
          const payload = response;

          if (!this.isPayloadEqual(payload, this.previousPayload)) {
            this.previousPayload = payload;

            this.http.post(`${environment.apiBase}/collection`, payload).subscribe(
              postResponse => {
                //console.log('Data posted successfully:', postResponse);
                this.collectionData.relatedObjects = postResponse; // Store the response for later use
                this.stopCounter();
              },
              postError => {
                console.error('Error posting data:', postError);
                this.stopCounter();
              }
            );
          } else {
            //console.log('Payload has not changed, skipping post request.');
            this.stopCounter();
          }
        } else {
          console.error('Unexpected response format:', response);
          this.stopCounter();
        }
      },
      error => {
        if (error.status === 200) {
          if (error.error && error.error.error) {
            // Handle custom error from the server
            console.error('Server error:', error.error.error);
          } else {
            console.error('Unexpected error:', error);
          }
        } else {
          // Handle other HTTP error codes
          console.error('HTTP error:', error);
          this.stopCounter();
        }
      }
    );
  }

  private startCounter() {
    this.intervalId = setInterval(() => {
      this.counter++;
    }, 1000);
  }

  private stopCounter() {
    this.isLoading = false;
    clearInterval(this.intervalId);
  }


  private updateContext(actor: string, message: string): void {
    // Update the context with the new user message
    if (!this.collectionData.chatHistory) {
      this.collectionData.chatHistory = [];
    }
    this.collectionData.chatHistory.push({ user: actor, text: message });
  }

  private isPayloadEqual(payload1: any, payload2: any): boolean {
    return JSON.stringify(payload1) === JSON.stringify(payload2);
  }

  downloadMessages(): void {
    const element = document.createElement('a');
    const fileContents = this.messageContainer.nativeElement.innerText;
    const blob = new Blob([fileContents], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    element.href = url;
    element.download = `${this.currentContext.objectName}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}
