import {Inject, Injectable, InjectionToken} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {catchError, mergeMap, switchMap, tap} from 'rxjs/operators';
import {from, Observable, of, throwError} from 'rxjs';
import {unflatter} from '@monabbous/unflatter';

export const API_CONFIG = new InjectionToken<string>('APIConfig');

interface ServerVersions {
  [key: string]: string;
}

interface Server {
  baseUrl: string;
  versions: ServerVersions;
  defaultVersion: keyof ServerVersions;
}

interface Servers {
  [key: string]: Server;
}

export interface APIConfig {
  servers: Servers;
  defaultServer: keyof Servers;
  methodOverride?: boolean;

  intercept?(request: Request, next: (request: Request) => Observable<any>): Observable<any>;

  onSuccess?(response: any, request: Request): Observable<any>;

  onError?(response: any, request: Request): Observable<any>;
}

interface Request {
  baseUrl?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  outsource?: boolean;
  server?: number | string;
  version?: number | string;
  body?: {
    [key: string]: any;
  };
  options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
    observe?: 'body';
    params?: HttpParams | {
      [param: string]: string | string[];
    };
    reportProgress?: boolean;
    responseType?: 'json' | 'blob' | 'text' | 'arraybuffer';
    withCredentials?: boolean;
  };
}

// @dynamic
@Injectable({
  providedIn: 'root'
})
export class NgApiWrapperService {

  static async jsonToFormData(object): Promise<object | FormData> {
    if (object instanceof FormData) {
      return object;
    }
    const formData = new FormData();
    let worthConverting = false;
    const append = async (data, keys = []) => {
      return await new Promise(async (res) => {
        for (const key of Object.keys(data)) {
          if (key === 'isFormArray') {
            delete data[key];
            continue;
          }
          const item = data[key];
          const itemKey = [...keys, key].map((k, i) => i > 0 ? `[${k}]` : k).join('');
          if (item instanceof Blob) {
            formData.append(itemKey, item);
            worthConverting = true;
          } else if ((Array.isArray(item) || (typeof item === 'object')) && item !== null && item !== undefined) {
            await append(item, [...keys, key]);
          } else {
            formData.append(itemKey, item);
          }
        }
        res(formData);
      });
    };
    await append(object);
    return worthConverting ? formData : object;
  }

  constructor(
    private http: HttpClient,
    @Inject(API_CONFIG) public apiConfig: APIConfig,
  ) {
    console.log(apiConfig);
  }

  getFullUrl(server, version): string {
    return this.apiConfig.servers[server]?.baseUrl + this.apiConfig.servers[server]?.versions[version];
  }

  handleServer(server): string {
    if (!Object.keys(this.apiConfig.servers).includes(server)) {
      console.warn(`Ng Api Wrapper: Server '${server}' is not in the configuration, will use the defaultServer`);
      server = this.apiConfig.defaultServer;
    }
    return server;
  }

  handleServerVersion(server, version): string {
    if (!Object.keys(this.apiConfig.servers[server].versions).includes(version)) {
      console.warn(`Ng Api Wrapper: Server '${server}' Api version '${version}' is not in the configuration, will use the defaultVersion`);
      version = this.apiConfig.servers[server]?.defaultVersion;
    }
    return version;
  }

  protected handleResponse<T>(request: Observable<T>, parameters: Request): Observable<T> {
    return request
      .pipe(
        switchMap(response => this.apiConfig.onSuccess ? this.apiConfig.onSuccess(response, parameters) : of(response)),
        catchError(response => this.apiConfig.onError ? this.apiConfig.onError(response, parameters) : throwError(response)),
      );
  }

  public get<T>(request: Request): Observable<T> {
    const next = (req) => {
      let {
        body = {},
        version,
        server,
      } = req;
      const {
        path,
        outsource,
        options = {},
      } = req;
      server = this.handleServer(server);
      version = this.handleServerVersion(server, version);
      body = unflatter(body);

      const params = {...body};
      delete params._method;
      options.params = body ? new HttpParams({fromObject: params}) : options.params;

      // @ts-ignore
      let method = <S>(...a) => this.http.get<S>(...a);
      let args: any = [(outsource ? '' : this.getFullUrl(server, version)) + path, options];
      if (this.apiConfig?.methodOverride) {
        // @ts-ignore
        method = <S>(...a) => this.http.post<S>(...a);
        args = [(outsource ? '' : this.getFullUrl(server, version)) + path, {_method: 'GET', ...body}, options];
      }

      return from(NgApiWrapperService.jsonToFormData(body))
        .pipe(
          mergeMap(b => {
            body = b;
            // @ts-ignore
            return this.handleResponse<T>(method<T>(...args), {
              baseUrl: this.getFullUrl(server, version),
              path,
              outsource,
              body,
              server,
              version,
              options,
              method: 'GET'
            });
          })
        );
    };
    return this.apiConfig?.intercept?.(request, next) ?? next(request);
  }

  public post<T>(request: Request): Observable<T> {
    const next = (req) => {
      let {
        body = {},
        version,
        server,
      } = req;
      const {
        path,
        outsource,
        options = {},
      } = req;
      server = this.handleServer(server);
      version = this.handleServerVersion(server, version);
      body = unflatter(body);
      return from(NgApiWrapperService.jsonToFormData(body))
        .pipe(
          mergeMap(b => {
            body = b;
            // @ts-ignore
            return this.handleResponse<T>(this.http.post<T>(
              // @ts-ignore
              (outsource ? '' : this.getFullUrl(server, version)) + path, body, options), {
              baseUrl: this.getFullUrl(server, version),
              path,
              outsource,
              body,
              server,
              version,
              options,
              method: 'POST'
            });
          })
        );
    };
    return this.apiConfig?.intercept?.(request, next) ?? next(request);
  }

  public patch<T>(request: Request): Observable<T> {
    const next = (req) => {
      let {
        body = {},
        version,
        server,
      } = req;
      const {
        path,
        outsource,
        options = {},
      } = req;
      server = this.handleServer(server);
      version = this.handleServerVersion(server, version);
      body = unflatter(body);
      // @ts-ignore
      let method = <S>(...a) => this.http.patch<S>(...a);
      let args: any = [(outsource ? '' : this.getFullUrl(server, version)) + path, body, options];
      if (this.apiConfig?.methodOverride) {
        // @ts-ignore
        method = <S>(...a) => this.http.post<S>(...a);
        args = [(outsource ? '' : this.getFullUrl(server, version)) + path, {_method: 'PATCH', ...body}, options];
      }

      return from(NgApiWrapperService.jsonToFormData(body))
        .pipe(
          mergeMap(b => {
            body = b;
            // @ts-ignore
            return this.handleResponse<T>(method<T>(...args), {
              baseUrl: this.getFullUrl(server, version),
              path,
              outsource,
              body,
              server,
              version,
              options,
              method: 'PATCH'
            });
          })
        );
    };
    return this.apiConfig?.intercept?.(request, next) ?? next(request);
  }

  public put<T>(request: Request): Observable<T> {
    const next = (req) => {
      let {
        body = {},
        version,
        server,
      } = req;
      const {
        path,
        outsource,
        options = {},
      } = req;
      server = this.handleServer(server);
      version = this.handleServerVersion(server, version);
      body = unflatter(body);
      // @ts-ignore
      let method = <S>(...a) => this.http.put<S>(...a);
      let args: any = [(outsource ? '' : this.getFullUrl(server, version)) + path, body, options];
      if (this.apiConfig?.methodOverride) {
        // @ts-ignore
        method = <S>(...a) => this.http.post<S>(...a);
        args = [(outsource ? '' : this.getFullUrl(server, version)) + path, {_method: 'PUT', ...body}, options];
      }

      return from(NgApiWrapperService.jsonToFormData(body))
        .pipe(
          mergeMap(b => {
            body = b;
            // @ts-ignore
            return this.handleResponse<T>(method<T>(...args), {
              baseUrl: this.getFullUrl(server, version),
              path,
              outsource,
              body,
              server,
              version,
              options,
              method: 'PUT'
            });
          })
        );
    };
    return this.apiConfig?.intercept?.(request, next) ?? next(request);
  }

  public delete<T>(request: Request): Observable<T> {
    const next = (req) => {
      let {
        body = {},
        version,
        server,
      } = req;
      const {
        path,
        outsource,
        options = {},
      } = req;
      server = this.handleServer(server);
      version = this.handleServerVersion(server, version);
      body = unflatter(body);
      // @ts-ignore
      let method = <S>(...a) => this.http.delete<S>(...a);
      let args: any = [(outsource ? '' : this.getFullUrl(server, version)) + path, body, options];
      if (this.apiConfig?.methodOverride) {
        // @ts-ignore
        method = <S>(...a) => this.http.post<S>(...a);
        args = [(outsource ? '' : this.getFullUrl(server, version)) + path, {_method: 'DELETE', ...body}, options];
      }

      return from(NgApiWrapperService.jsonToFormData(body))
        .pipe(
          mergeMap(b => {
            body = b;
            // @ts-ignore
            return this.handleResponse<T>(method<T>(...args), {
              baseUrl: this.getFullUrl(server, version),
              path,
              outsource,
              body,
              server,
              version,
              options,
              method: 'DELETE'
            });
          })
        );
    };
    return this.apiConfig?.intercept?.(request, next) ?? next(request);
  }
}
