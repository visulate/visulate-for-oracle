import { ChatComponent } from './chat.component';
import { AppModule } from '../../app.module';
import { StateService } from '../../services/state.service';
import { TestBed } from '@angular/core/testing';

describe('ChatComponent', () => {
  beforeEach(() => {
    cy.mount(ChatComponent, {
      imports: [AppModule]
    });
  });

  it('mounts and renders welcome message', () => {
    cy.get('h2').contains('Welcome to Visulate').should('be.visible');
  });

  it('toggles fullscreen correctly and maintains chat visibility', () => {
    // 1. Initial state (inline)
    cy.get('.chat-container').should('exist').and('not.have.class', 'full-screen');
    
    // 2. Trigger fullscreen via StateService
    // Using cy.log to help debug if needed
    cy.log('Toggling to fullscreen');
    cy.get('app-chat').then(() => {
      const stateService = TestBed.inject(StateService);
      stateService.toggleChatFullScreen();
    });

    // 3. Verify fullscreen container in overlay
    // Use clear check for overlay content
    cy.get('.cdk-overlay-container', { timeout: 10000 }).should('exist');
    cy.get('.chat-container.full-screen', { timeout: 10000 }).should('be.visible');
    
    // 4. Verify exit button exists and is clickable
    cy.get('.exit-fullscreen-button').should('be.visible').click();
    
    // 5. Verify returns to inline
    cy.get('.chat-container', { timeout: 10000 }).should('exist').and('not.have.class', 'full-screen');
  });

  it('preserves input text across toggle', () => {
    const testMsg = 'Hello Visulate!';
    cy.get('textarea').type(testMsg);
    
    // Toggle fullscreen
    cy.get('app-chat').then(() => {
      TestBed.inject(StateService).toggleChatFullScreen();
    });

    // Check textarea in fullscreen overlay
    cy.get('.chat-container.full-screen textarea').should('have.value', testMsg);

    // Exit fullscreen via button
    cy.get('.exit-fullscreen-button').click();

    // Check textarea returns to inline correctly
    cy.get('.chat-container textarea').should('have.value', testMsg);
  });
});