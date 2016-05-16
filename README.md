warmup
-----------

Simple module to warmup a server application (such as an Express app) by hitting server URLs and performing various tasks. This module also allows a worker to be warmed up before it is added to a cluster.

# Installation

```
npm install warmup
```

# Usage

```javascript
var warmup = require('warmup');
warmup(app, tasks, callback);
warmup(app, tasks, callback, options);
```

Simple example of warming up an Express server application:

```javascript
var warmup = require('warmup');
var express = require('express');

var app = express();

// ...

warmup(
    app,
    [
        '/foo', // A URL to hit to warmup the server
        '/bar', // A URL to hit to warmup the server
        {
            path: '/baz', // Required
            headers: {
                'User-Agent': 'xxx'
            }
        },
        function myFunc(callback) { // A custom warmup task
            var port = this.port; // The warmup port is there if you need it
            callback();
        }
    ],
    function(err) {
        if (err) {
            // handle error
        }
        app.listen(8080);
    });
```

Passing the warmup tasks information:
* __string__: as a string that contains the path of the url to make a GET request to during warmup, e.g. '/foo'
* __object__: as an object if you want to pass additional properties like __headers__ to the request object. Be sure to pass a __path__ property at the bare minimum when passing the request information in this case

The following options are supported:

* __timeout__ - Timeout for each task (defaults to 10s)
* __warmupPort__ - The warmup port to use (defaults to a random port in the range of [10,000-50,000])


The `warmup` module works by starting the app on a random HTTP port. This allows the application to be started without accepting traffic.

NOTES:

* All of the tasks are executed in parallel
* The default timeout is 10s
