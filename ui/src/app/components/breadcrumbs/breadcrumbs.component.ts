import { Component, OnInit, OnDestroy } from '@angular/core';
import { StateService } from '../../services/state.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CurrentContextModel } from '../../models/current-context.model';

interface Breadcrumb {
  label: string;
  url: string;
}

@Component({
  selector: 'app-breadcrumbs',
  templateUrl: './breadcrumbs.component.html',
  styleUrls: ['./breadcrumbs.component.css'],
  standalone: false
})
export class BreadcrumbsComponent implements OnInit, OnDestroy {
  breadcrumbs: Breadcrumb[] = [];
  private unsubscribe$ = new Subject<void>();

  constructor(private state: StateService) {}

  ngOnInit(): void {
    this.state.currentContext$.pipe(takeUntil(this.unsubscribe$)).subscribe(context => {
      this.generateBreadcrumbs(context.currentContext);
    });
  }

  generateBreadcrumbs(context: CurrentContextModel): void {
    const items: Breadcrumb[] = [];
    
    // Always add Home/Database root
    items.push({ label: 'Databases', url: '/database' });

    if (context.endpoint) {
      const dbUrl = `/database/${context.endpoint}`;
      items.push({ label: context.endpoint, url: dbUrl });

      if (context.owner) {
        const ownerUrl = `${dbUrl}/${context.owner}`;
        items.push({ label: context.owner, url: ownerUrl });

        if (context.objectType) {
          const typeUrl = `${ownerUrl}/${context.objectType}`;
          items.push({ label: context.objectType, url: typeUrl });

          if (context.objectName) {
            const objectUrl = `${typeUrl}/${context.objectName}`;
            items.push({ label: context.objectName, url: objectUrl });
          }
        }
      }
    }
    
    this.breadcrumbs = items;
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
