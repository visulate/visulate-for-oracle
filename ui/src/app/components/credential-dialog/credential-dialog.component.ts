import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RestService } from '../../services/rest.service';

export interface DialogData {
  database: string;
}

@Component({
  selector: 'app-credential-dialog',
  templateUrl: './credential-dialog.component.html',
  styleUrls: ['./credential-dialog.component.css'],
  standalone: false
})
export class CredentialDialogComponent {
  form: FormGroup;
  hidePassword = true;
  isLoading = false;
  error: string | null = null;
  databases: string[] = [];

  constructor(
    public dialogRef: MatDialogRef<CredentialDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private fb: FormBuilder,
    private restService: RestService
  ) {
    this.form = this.fb.group({
      database: [data.database || '', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.required]
    });

    this.loadDatabases();
    this.loadCredentials(data.database);
  }

  private loadDatabases(): void {
    this.restService.getEndpoints$().subscribe(
      (data) => {
        this.databases = data.databases.map(db => db.endpoint);
        if (this.databases.length > 0 && !this.form.get('database').value) {
          this.form.patchValue({ database: this.databases[0] });
          this.loadCredentials(this.databases[0]);
        }
      },
      (err) => console.error("Error loading databases", err)
    );
  }

  onDatabaseChange(database: string): void {
    this.loadCredentials(database);
  }

  private loadCredentials(database: string): void {
    if (!database) return;
    const saved = sessionStorage.getItem('visulate-credentials');
    let credentials = {};
    if (saved) {
      try {
        credentials = JSON.parse(saved);
        // If it's the old format (directly containing username/password), ignore it
        if (credentials['username'] && !credentials[database]) {
          credentials = {};
        }
      } catch (e) {
        credentials = {};
      }
    }
    const dbCreds = credentials[database] || { username: '', password: '' };

    this.form.patchValue({
      username: dbCreds.username,
      password: dbCreds.password
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConnect(): void {
    if (this.form.invalid) return;

    this.isLoading = true;
    this.error = null;
    const { database, username, password } = this.form.value;

    // Save to session storage per database
    const saved = sessionStorage.getItem('visulate-credentials');
    let credentials = {};
    if (saved) {
      try {
        credentials = JSON.parse(saved);
        // Clean up orphaned fields from old format
        delete credentials['username'];
        delete credentials['password'];
      } catch (e) {
        credentials = {};
      }
    }

    credentials[database] = { username, password };
    sessionStorage.setItem('visulate-credentials', JSON.stringify(credentials));

    this.restService.generateToken(database, username, password).subscribe(
      (response: any) => {
        this.isLoading = false;
        let token = null;
        // Handle various response formats from the tool
        if (response.content && response.content[0] && response.content[0].text) {
          const text = response.content[0].text;
          if (text.includes("Token:")) {
            token = text.split("Token:")[1].trim();
          } else if (text.includes("created successfully")) {
            token = text.split(":").pop().trim();
          } else {
            token = text;
          }
        } else if (response.credential_token) {
          token = response.credential_token;
        }

        if (token) {
          this.dialogRef.close({ token, database });
        } else {
          this.error = "Could not parse token from response";
          console.error("Token parse error:", response);
        }
      },
      (err) => {
        this.isLoading = false;
        this.error = typeof err === 'string' ? err : (err.error || 'Connection failed');
      }
    );
  }
}
