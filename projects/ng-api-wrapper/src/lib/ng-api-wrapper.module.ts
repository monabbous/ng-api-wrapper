import {ModuleWithProviders, NgModule} from '@angular/core';
import {API_CONFIG, APIConfig, NgApiWrapperService} from './ng-api-wrapper.service';
import {HttpClientModule} from '@angular/common/http';

// @dynamic
@NgModule({
  declarations: [],
  imports: [HttpClientModule],
  exports: [],
  providers: [
    NgApiWrapperService,
  ]
})
export class NgApiWrapperModule {
  static forRoot(apiConfig: APIConfig): ModuleWithProviders<NgApiWrapperModule> {
    return {
      ngModule: NgApiWrapperModule,
      providers: [
        {provide: API_CONFIG, useValue: apiConfig}
      ]
    };
  }
}
