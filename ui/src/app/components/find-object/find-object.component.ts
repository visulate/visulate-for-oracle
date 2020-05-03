/*!
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
import { Component, Output, EventEmitter, ElementRef, ViewChild} from '@angular/core';
import { RestService } from 'src/app/services/rest.service';
import { FindObjectModel } from '../../models/find-object.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-find-object',
  templateUrl: './find-object.component.html',
  styleUrls: ['./find-object.component.css']
})

/**
 * Quick find feature tied to search icon in toolbar. Finds objects of
 * a given name in each registered database
 */
export class FindObjectComponent { 
  public searchResult: FindObjectModel;
  private unsubscribe$ = new Subject<void>();
  public searchTerm: string = '';

  @ViewChild('searchBox') searchBox: ElementRef; 
  @Output() cancelSearchForm: EventEmitter<boolean> = new EventEmitter();

  constructor(private restService: RestService) {
  }

  processSearchRequest(searchTerm: string): void{
    this.restService.getSearchResults$(searchTerm)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(searchResult => {this.searchResult = searchResult;});
  } 
  
  processCancel() {
    this.cancelSearchForm.emit(false);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.searchBox.nativeElement.focus());
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

}
