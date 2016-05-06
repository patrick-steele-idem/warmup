'use strict';

var ok = require('assert').ok;
var http = require('http');
var async = require('async');
var request = require('request');

/**
 * Getting a random port in the range [10000, 50000]
 * @return {Number} Random int in given range
 */
function getRandomPort() {
    return Math.floor(Math.random() * 40001) + 10000;
}

function log(message) {
    var args = Array.prototype.splice.call(arguments, 0);
    args.unshift('[warmup] ');
    console.log.apply(console, args);
};

module.exports = function warmup(app, tasks, warmupCallback, options) {
    ok(app.listen, 'Invalid server application');
    ok(tasks && Array.isArray(tasks), 'Tasks should be array');
    ok(typeof warmupCallback === 'function', 'Callback should be a function');

    var options = options;
    var timeoutMillis = options.timeout || 10000;
    var warmupPort = options.warmupPort || getRandomPort();
    var server = http.createServer(app);
    var serverClosed = false;
    var listenAttemptCount = 0;

    function createWarmupUrlTask(data) {
        ok(typeof data === 'object' || typeof data === 'string', 'Request object should be either a string or an object');

        var host = 'http://localhost:' + warmupPort;
        var reqObj;
        var path;
        var url;

        if (typeof data === 'object') {
            ok(data.path && typeof data.path === 'string', 'Request object does not have a valid "path" property');

            reqObj = data;
            path = data.path;
            reqObj.url = url = host + path;
        }
        else if (typeof data === 'string') {
            path = data;
            reqObj = url = host + data;
        }

        log('Warming up "' + path + '" (' + url + ')...');

        return function(parallelCallback) {
            request(reqObj, function (err, response, body) {
                if (err) {
                    console.log('Err: ', err);
                    return parallelCallback(err);
                }

                var statusCode = response.statusCode;
                if (statusCode < 200 || statusCode >= 300) {
                    return parallelCallback(new Error('Request to ' + url + ' failed with HTTP status code ' + statusCode));
                }

                parallelCallback(null, statusCode);
            });
        };
    }

    function startListening(seriesCallback) {
        if (listenAttemptCount++ === 20) {
            return seriesCallback(new Error('Unable to find an available warmup port'));
        }

        log('Attempting to listen on port ' + warmupPort);

        server.listen(warmupPort, function(err) {
            if (err) {
                log('Error listening on port ' + warmupPort);
                return seriesCallback(err);
            }

            log('Listening on port ' + warmupPort);
            seriesCallback(null);
        });

        server.on('error', function (err) {
            log('Failed to listen on port ' + warmupPort + '. Trying next port...');
            warmupPort++;
            startListening(seriesCallback);
        });
    }

    function doWarmup(seriesCallback) {
        var context = {
            port: warmupPort
        };

        function wrapTask(func, i, name) {
            var logMsg = 'Running task ' + (i+1) + ' of ' + tasks.length;
            var completedLogMsg = 'Completed task ' + (i+1) + ' of ' + tasks.length;
            var taskName;

            if (name) {
                if (typeof name === 'object' && name.path) {
                    taskName = name.path;
                }
                else if (typeof name === 'string') {
                    taskName = name;
                }
                logMsg += ' (' + taskName + ')';
                completedLogMsg += ' (' + taskName + ')';
            }

            if (timeoutMillis && timeoutMillis > 0) {

                return function(parallelCallback) {
                    log(logMsg);
                    var timeoutId = setTimeout(function() {
                        parallelCallback(new Error('Warmup task timed out after ' + timeoutMillis + 'ms: ' + (name || '(anonymous)')));
                    }, timeoutMillis);

                    func.call(context, function(err, results) {
                        if (err) {
                            log('Error in warming up task!');
                            return parallelCallback(err);
                        }

                        log(completedLogMsg);
                        clearTimeout(timeoutId);
                        parallelCallback(null);
                    });
                };
            } else {
                return function(callback) {
                    log(logMsg);
                    return func.call(context, function(err) {
                        log(completedLogMsg);
                        parallelCallback(null);
                    });
                };
            }
        }

        var asyncTasks = tasks.map(function(task, i) {
            if (typeof task === 'string' || typeof task === 'object') {
                return wrapTask(createWarmupUrlTask(task), i, task);
            }
            else {
                return wrapTask(task, i);
            }
        });

        async.parallel(asyncTasks, function (err, results) {
            if (err) {
                log('Error in parallel call!');
                return seriesCallback(err);
            }
            seriesCallback(null);
        });
    }

    function stopListening(seriesCallback) {
        if (serverClosed) {
            return;
        }

        serverClosed = true;
        log('Closing the server!');
        server.close(seriesCallback);
    }

    async.series([
            startListening,
            doWarmup,
            stopListening
        ], function(err) {
            if (err) {
                stopListening();
            }

            warmupCallback(null);
        }
    );
};
