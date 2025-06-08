/* !
 * Copyright 2019, 2020 Visulate LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Component, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, AfterContentInit, OnDestroy} from '@angular/core';
import { RestService } from 'src/app/services/rest.service';
import { FindObjectModel, ObjectHistoryModel } from '../../models/find-object.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-find-object',
    templateUrl: './find-object.component.html',
    styleUrls: ['./find-object.component.css'],
    standalone: false
})

/**
 * Quick find feature tied to search icon in toolbar. Finds objects of
 * a given name in each registered database
 */
export class FindObjectComponent implements AfterViewInit, AfterContentInit, OnDestroy {
  public searchResult: FindObjectModel;
  public history: ObjectHistoryModel[] = [];
  private unsubscribe$ = new Subject<void>();
  public searchTerm = '';
  public breakpoint: number;

  @ViewChild('searchBox') searchBox: ElementRef;
  @Output() cancelSearchForm: EventEmitter<boolean> = new EventEmitter();

  constructor(private restService: RestService) {
  }

  processSearchRequest(searchTerm: string): void{
    this.restService.getSearchResults$(searchTerm)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(searchResult => {this.searchResult = searchResult; });
  }

  processCancel() {
    this.cancelSearchForm.emit(false);
  }

  getHistory() {
    const localStorageHistory = JSON.parse(localStorage.getItem('objectHistory') || '[]');
    localStorageHistory.forEach((entry) => {
      this.history.push(new ObjectHistoryModel
      ( entry.endpoint, entry.owner, entry.objectType, entry.objectName, entry.filter));
    });
  }

  ngAfterViewInit(): void {

    setTimeout(() => this.searchBox.nativeElement.focus());
    this.getHistory();
  }

  /**
   * Set the mat-grid-list cols value to 1 if screen width is less than 700px
   */
  ngAfterContentInit(): void {
    this.breakpoint = (window.innerWidth <= 700) ? 1 : 2;
  }
  onResize(event) {
    this.breakpoint = (event.target.innerWidth <= 700) ? 1 : 2;
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

}
