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
warmup(app, tasks, options, callback);
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
        function myFunc(callback) { // A custom warmup task
            var port = this.port; // The warmup port is there if you need it
            callback();
        }
    ],
    function(err) {
        app.listen(8080);
    });
```

The following options are supported:

* __timeout__ - Timeout for each task (defaults to 10s)
* __warmupPort__ - The warmup port to use (defaults to a random port in the range of [10,000-50,000])


The `warmup` module works by starting the app on a random HTTP port. This allows the application to be started without accepting traffic.

NOTES:

* All of the tasks are executed in parallel
* The default timeout is 10s
