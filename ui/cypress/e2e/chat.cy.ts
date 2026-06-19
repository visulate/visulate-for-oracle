describe('Chat Component File Upload Tests', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.intercept('POST', '**/api/chat**', {
      statusCode: 200,
      body: {
        text: 'Mocked reply from Visulate AI agent',
        session_id: 'test-session-123'
      }
    }).as('sendMessage');
  });

  it('allows attaching, previewing, and sending valid source code files', () => {
    const validFileContent = 'SELECT * FROM dual;';
    cy.get('input[type="file"]').then(input => {
      const blob = new Blob([validFileContent], { type: 'text/plain' });
      const file = new File([blob], 'test_query.sql', { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input[0].files = dataTransfer.files;
      input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('.attachments-preview').should('be.visible');
    cy.get('.attachment-chip').should('contain', 'test_query.sql');

    cy.get('textarea[formControlName="message"]').type('Please review my SQL file');
    cy.get('form.chat-input-area').submit();

    cy.get('.attachments-preview').should('not.exist');
  });

  it('rejects files exceeding the size limit', () => {
    const largeContent = 'a'.repeat(101 * 1024);
    cy.get('input[type="file"]').then(input => {
      const blob = new Blob([largeContent], { type: 'text/plain' });
      const file = new File([blob], 'too_large.sql', { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input[0].files = dataTransfer.files;
      input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('.mat-mdc-simple-snack-bar').should('contain', 'exceeds the 100KB limit');
    cy.get('.attachments-preview').should('not.exist');
  });

  it('rejects files with unsupported extensions', () => {
    cy.get('input[type="file"]').then(input => {
      const blob = new Blob(['unsupported file content'], { type: 'application/octet-stream' });
      const file = new File([blob], 'image.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input[0].files = dataTransfer.files;
      input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('.mat-mdc-simple-snack-bar').should('contain', 'unsupported extension');
    cy.get('.attachments-preview').should('not.exist');
  });
});
