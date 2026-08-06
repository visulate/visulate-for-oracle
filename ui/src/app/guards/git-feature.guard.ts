import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';

export const gitFeatureGuard: CanActivateFn = () => {
  if (environment.enableGitIntegration) {
    return true;
  }
  const router = inject(Router);
  return router.parseUrl('/database');
};
