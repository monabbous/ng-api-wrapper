# Angular API Wrapper

This library is used to simplify the connections to your backend RESTful api, and supports multiple endpoint/servers.
Also provides a Base Resource service which can be used to make the crud operations consistent and simple.

Basically instead of writing this piece of code repeatedly and change only the last bit
```
    http.get('https://app-backend.com/api/v2/items');
    http.get('https://app-backend.com/api/v2/stores');
```

now you just write this and change the path and optionally the server and api version that you pre-configure
```
    api.get({path: 'items'});
    api.get({path: 'stores'});
```

### Features

This wrapper has few key features under the hood including:
- **Multiple Endpoints** where you can set multiple `baseUrl`s with it's `versions` so you can switch using them.
- **[@monabbous/unflatter](https://github.com/monabbous/unflatter)** where it unflattens the body and params of the http requests
- **HTTP Method Overriding** where in the config you can set the `methodOverride` to `true` and it will send all the requests as `POST` request and injects the `_method` attribute with on of the corresponding values (`GET`, `PUT`, `PATCH`, `DELETE`)
- **Automatic Form Data Body conversion** where it detects if there is a `Blob` value in the body and then automatically converts the json to `formData`.
- **JWT Bearer Token** where you can set the value of the static variable `NgApiWrapperService.token` and will send the request with the `Authorization` header with the value of `'Bearer ' + NgApiWrapperService.token`, or you can set the token in `localStorage.setItem('token', token)`, also you can give the token per request using the `token` parameter of the request.

### Installation

Install with npm

`npm i @monabbous/ng-api-wrapper`

### Usage

first import the module and write your configurations in your `AppModule`

    imports: [
        .
        .
        NgApiWrapperModule.forRoot({
              servers: {
                primary: {
                  baseUrl: 'https://app-backend.com/',
                  versions: {
                    1: 'api/v1/',
                    2: 'api/v2/',
                  },
                  defaultVersion: 2,
                }
              },
              defaultServer: 'primary',
              onError: (response, parameters) => {
                console.log(response, parameters);
                return of({response});
              },
              onSuccess: (response, parameters) => {
                console.log(response, parameters);
                return of({response});
              }
        }),
        .
        .
    ],
    
Now you can use the service in your app as so

      constructor(
        public api: NgApiWrapperService,
      ) {
        api.get({path: 'items'})
          .subscribe(response => {
            console.log(response);
          });
      }

### Api Resource

To use it, first create a new Service and an interface that extends the `ResourceModel` (which has id property) and use as so:

    export interface Item extends ResourceModel {
      name: string;
      category: {
        id: number;
        name: string;
      };
      base_price: number;
      discount: number;
    }
    
    @Injectable({
      providedIn: 'any'
    })
    export class ItemService extends NgApiResourceService<Item> {
      // this is the path of the resource that will be used to be called from the backend
      resourceName = 'items';
    }


and now you can use this service as following

      constructor(
        public items: ItemService,
      ) {
        items.get()
            .subscribe(response => {
            console.log(response);
            });
          
        // these filters is sent to the backend as queryParams
        const filters = {name: 'test' };
        items.get(filters)
            .subscribe(response => {
              console.log(response);
            });
            
        // the where function adds a global filter to the service
        items.where('page', 1).where('category_id', 1).get(filters)
            .subscribe(response => {
              console.log(response);
            });
            
        // this basically request the path _reourceName/:id_ from the backend
        items.find(1)
            .subscribe(response => {
              console.log(response);
            });
            
      }
      
you can simplify your usage of this service like so:

    constructor(
        public items: ItemService,
        public activatedRoute: ActivatedRoute,
    ) {
        items.init({
            route: activatedRoute,
            idParameter: 'id'
        });
        
        // now you have the page$ variable from get() with the browsers queryParams from the ActivatedRoute and used as filters
        items.page$
            .subscribe(response => {
              console.log(response);
            });

        // now you have the model$ variable from find() and the id is from the Params of the ActivatedRoute rerieved from the `idParameter` in the init()
        items.model$
            .subscribe(response => {
              console.log(response);
            });
    }
    
that's it just install with `npm i @monabbous/ng-api-wrapper` and start APIing :D
