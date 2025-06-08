import { Pipe, PipeTransform } from '@angular/core';
import { SchemaModel } from './endpoint.model';

@Pipe({
    name: 'hideInternal', pure: false,
    standalone: false
})
export class HideInternalPipe implements PipeTransform {
  transform(schemaList: SchemaModel[], showInternal: boolean) {
    if (showInternal) {
      return schemaList;
    } else {
      return schemaList.filter(schema => schema.internal === false);
    }
  }
}
