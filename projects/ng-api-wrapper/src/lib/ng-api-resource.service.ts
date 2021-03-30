import {Injectable} from '@angular/core';
import {distinctUntilChanged, filter, map, switchMap, tap} from 'rxjs/operators';
import {isEqual} from 'lodash';
import {BehaviorSubject, MonoTypeOperatorFunction, Observable, of} from 'rxjs';
import {ActivatedRoute} from '@angular/router';
import {NgApiWrapperService} from './ng-api-wrapper.service';
import {digger} from '@monabbous/object-digger';

export type ResourceModel = {
  id?: number;

  [key: number]: any;

  [key: string]: any;
};

type KeyTypes<T> = {
  [K in keyof T]-?: K extends string ?
    string :
    K extends number ?
      number :
      K extends symbol ?
        symbol :
        never
}[keyof T];

type ForceString<T> = T & string;

type AdaptedModel<T> = {
  [key in (keyof T) as `${ForceString<key>}[adapted]`]?: T[key];
} & T;


type ModelFilters<T> = {
  [key: string]: any;
} & Partial<T>;

export type ResourcePagination = {
  per_page: number;
  current_page: number;
  total: number;
};

export type ResourceMeta<M> = {
  pagination?: ResourcePagination,
} & M;

export type ResourcePage<T, P = object, M = object> = {
  data: T[];
  meta?: ResourceMeta<M>;
} & P;

export type ResourceItem<T, P = object, M = object> = {
  data: T;
  meta?: ResourceMeta<M>;
} & P;

export type ResourceOperation = 'get' | 'find' | 'create' | 'update' | 'delete';

export function smartResourcePageRefresh<T extends ResourceModel = object, P = object, M = object>(unique = 'id'):
  MonoTypeOperatorFunction<ResourcePage<T, P, M>> {
  return distinctUntilChanged((pre: ResourcePage<T, P, M>, cur: ResourcePage<T, P, M>) => {
    const preData = pre.data;
    const curData = cur.data;
    if (curData.length !== preData.length) {
      return false;
    }

    if (
      cur.meta && cur.meta && cur.meta?.pagination
      && pre.meta && pre.meta && pre.meta?.pagination
      && pre.meta?.pagination.current_page !== cur.meta?.pagination.current_page
    ) {
      return false;
    }

    for (const datum of preData) {
      const newDatum = curData.find((d) =>
        (digger(unique, d) || []).pop() === (digger(unique, datum) || []).pop()
      );
      if (!newDatum) {
        return false;
      }

      if (!isEqual(datum, newDatum)) {
        Object.assign(datum, newDatum);
      }
    }

    return true;
  });
}


@Injectable({
  providedIn: 'any'
})
export class NgApiResourceService<T extends ResourceModel = object, P = object, M = object> {

  resourceName = '';
  parentPrefix = '';
  defaultServer;
  defaultVersion;
  accessor;
  filters: ModelFilters<T> = {};
  adapters: {
    [key in keyof T]?: {
      up?: (value, body?, method?: ResourceOperation) => T[key];
      down?: (value, body) => T[key];
    }
  } = {};

  page$: Observable<ResourcePage<T, P, M>>;
  model$: Observable<ResourceItem<T>>;
  cachedModel$ = new BehaviorSubject<ResourceItem<T>>(null);
  refresher$ = new BehaviorSubject(null);
  loadmore$ = new BehaviorSubject(null);
  lastPage = false;


  getResourcePath(operation: ResourceOperation, body, id?): string {
    return ['get', 'create'].includes(operation) ?
      this.resourceName : `${this.resourceName}/${id}`;
  }

  getParentPrefix(operation: ResourceOperation, body): string {
    return this.parentPrefix;
  }


  getDefaultServer(operation: ResourceOperation, body): string {
    return this.defaultServer;
  }

  getDefaultVersion(operation: ResourceOperation, body): string {
    return this.defaultVersion;
  }

  downAdapt(data: any): AdaptedModel<T> {
    for (const key of Object.keys(this.adapters)) {
      if (!this.adapters[key].down) {
        continue;
      }
      const keys = key.split(/\[\s*([\w]+)\s*]/g)
        .filter(f => f !== '');
      keys.reduce((pointer, k: keyof T, i) => {
        if (![null, undefined].includes(pointer)) {
          if (i < keys.length - 1) {
            return pointer[k];
          } else {
            pointer[k + '[adapted]'] = this.adapters[key].down(pointer[k], data);
          }
        }
        return pointer;
      }, data);
    }
    return data;
  }

  upAdapt(data: any, method: ResourceOperation): T {
    for (const key of Object.keys(this.adapters)) {
      if (!this.adapters[key].up) {
        continue;
      }
      const keys = key.split(/\[\s*([\w]+)\s*]/g)
        .filter(f => f !== '');
      keys.reduce((pointer, k, i) => {
        if (pointer !== undefined) {
          if (i < keys.length - 1) {
            return pointer[k];
          } else {
            pointer[k] = this.adapters[key].up(pointer[k], data, method);
          }
        }
        return pointer;
      }, data);
    }
    return data;
  }


  constructor(protected http: NgApiWrapperService) {
  }

  transformer(t: T): T {
    return t;
  }

  where(field: keyof T | string, value): this {
    this.filters[field] = value;
    return this;
  }

  get(filters = {}): Observable<ResourcePage<AdaptedModel<T>, P, M>> {
    let body = {...this.filters, ...filters};
    body = this.upAdapt(body, 'get');
    return this.http.get<ResourcePage<T, P, M>>({
      version: this.getDefaultVersion('get', body),
      server: this.getDefaultServer('get', body),
      path: this.getParentPrefix('get', body) + this.getResourcePath('get', body),
      body
    })
      .pipe(
        map((resource: any) => {
          if (!(Object.keys(resource).includes('data'))) {
            if (Object.keys(resource).includes(this.accessor)) {
              // @ts-ignore
              resource.data = resource[this.accessor];
              delete resource[this.accessor];
            } else {
              // @ts-ignore
              resource.data = resource;
            }
          }

          if (!(Object.keys(resource).includes('meta')
            && Object.keys(resource.meta).includes('pagination'))
            && Object.keys(resource).includes('current_page')) {
            // @ts-ignore
            resource.meta = resource.meta || {};
          }

          resource.data = resource.data.map(d => this.downAdapt(d));
          resource.data = resource.data.map(d => this.transformer(d));
          return resource as ResourcePage<AdaptedModel<T>, P, M>;
        })
      );
  }

  find(id): Observable<ResourceItem<AdaptedModel<T>, P, M>> {
    let body = {...this.filters};
    body = this.upAdapt(body, 'find');
    return this.http.get<ResourceItem<T, P, M>>({
      version: this.getDefaultVersion('find', body),
      server: this.getDefaultServer('find', body),
      path: this.getParentPrefix('find', body) + this.getResourcePath('find', body, id),
      body
    })
      .pipe(
        map((resource: any) => {
          if (!('data' in resource)) {
            // @ts-ignore
            resource.data = resource;
          }
          resource.data = this.downAdapt(resource.data);
          resource.data = this.transformer(resource.data);
          return resource as ResourceItem<AdaptedModel<T>, P, M>;
        }),
        tap(model => this.cachedModel$.next(model)),
      );
  }

  create<R = any>(body): Observable<R> {
    body = this.upAdapt(body, 'create');
    return this.http.post({
      version: this.getDefaultVersion('create', body),
      server: this.getDefaultServer('create', body),
      path: this.getParentPrefix('create', body) + this.getResourcePath('create', body),
      body
    });
  }

  update<R = any>(id, body): Observable<R> {
    body = this.upAdapt(body, 'update');
    return this.http.patch({
      version: this.getDefaultVersion('update', body),
      server: this.getDefaultServer('update', body),
      path: this.getParentPrefix('update', body) + this.getResourcePath('update', body, id),
      body
    });
  }

  delete<R = any>(id: number, body: any = {}): Observable<R> {
    body = this.upAdapt(body, 'delete');
    return this.http.delete({
      version: this.getDefaultVersion('delete', body),
      server: this.getDefaultServer('delete', body),
      path: this.getParentPrefix('delete', body) + this.getResourcePath('delete', body),
      body
    });
  }

  init(options?: {
    route?: ActivatedRoute;
    refresher$?: BehaviorSubject<any>;
    filters?: string[];
    idParameter?: string;
    uniqueId?: string,
    loadmore?: boolean;
    parent?: NgApiResourceService<any>,
  }): this {
    let pagination: ResourcePagination = null;
    let reset = true;
    this.refresher$ = options?.refresher$ || this.refresher$;
    const checkParent = () => {
      if (!options?.parent) {
        this.parentPrefix = '';
        return of(null);
      }
      return options.parent.cachedModel$
        .pipe(
          filter(parent => !!parent),
          tap(parent => this.parentPrefix = options.parent.resourceName + '/' + parent.data.id + '/'),
        );
    };
    this.page$ =
      this.refresher$
        .pipe(
          switchMap(checkParent),
          switchMap(() => options?.route?.queryParams || of({})),
          switchMap(filters => {
            if (options?.loadmore) {
              reset = true;
              this.lastPage = false;
              pagination = null;
              return this.loadmore$
                .pipe(
                  filter(() => !this.lastPage),
                  map(() =>
                    ({...filters, page: (pagination && pagination.current_page || 0) + 1})
                  ),
                );
            }
            return of(filters);
          }),
          switchMap(filters => {
            const newFilters = options?.filters?.length ? {} : {...filters};
            for (const key of Object.keys(filters)) {
              if (options?.filters?.includes(key)) {
                newFilters[key] = filters[key];
              }
            }
            return this.get(newFilters);
          }),
          tap(page => pagination = page.meta?.pagination),
          tap(page => this.lastPage =
            Math.ceil(page?.meta?.pagination?.total / page?.meta?.pagination?.per_page)
            <= page?.meta?.pagination?.current_page),
          distinctUntilChanged((pre, cur) => {
            if (options?.loadmore) {
              if (reset) {
                return false;
              }
              if (!cur?.meta?.pagination) {
                this.lastPage = true;
                return false;
              }

              if (
                Math.ceil(cur?.meta?.pagination?.total / cur?.meta?.pagination?.per_page) >= cur?.meta?.pagination?.current_page
              ) {
                pre.data.push(...cur.data);
                cur.data = pre.data;
              }
            }
            return false;
          }),
          tap(() => reset = false),
          smartResourcePageRefresh<T, P, M>(options?.uniqueId),
        );

    this.model$ =
      this.refresher$
        .pipe(
          switchMap(checkParent),
          switchMap(() => options?.route?.params || of({})),
          switchMap(params => this.find(params[options?.idParameter])),
          tap(model => this.cachedModel$.next(model)),
        );
    return this;
  }

  superviseRefreshers(...services: NgApiResourceService<any>[]): this {
    services.forEach(service => service.refresher$ = this.refresher$);
    return this;
  }
}
