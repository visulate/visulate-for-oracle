import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MainNavComponent } from './components/main-nav/main-nav.component';

const routes: Routes = [
  { path: 'database', component: MainNavComponent },
  { path: 'database/:db', component: MainNavComponent },
  { path: 'database/:db/:schema', component: MainNavComponent },
  { path: 'database/:db/:schema/:type', component: MainNavComponent },
  { path: 'database/:db/:schema/:type/:object', component: MainNavComponent },
  { path: '', redirectTo: '/database', pathMatch: 'full'}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
