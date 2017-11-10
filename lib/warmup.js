'use strict';

var ok = require('assert').ok;
var http = require('http');
var async = require('async');
var request = require('request');

function getRandomPort() {
    return Math.floor(Math.random() * 40001) + 10000;
}

function prependWarmupTag(args) {
    args = Array.prototype.slice.call(args, 0);
    args.unshift('[warmup] ');
    return args;
}

function log(message) {
    var args = prependWarmupTag(arguments);
    console.log.apply(console, args);
}

function logError(message) {
    var args = prependWarmupTag(arguments);
    console.error.apply(console, args);
}

module.exports = function warmup(app, tasks, warmupOptions, warmupCallback) {
    if (arguments.length === 3) {
        warmupCallback = warmupOptions;
        warmupOptions = {};
    }

    ok(app.listen, 'Invalid server application');
    ok(tasks && Array.isArray(tasks), 'Tasks should be array');
    ok(typeof warmupCallback === 'function', 'Callback should be a function');

    warmupOptions = warmupOptions || {};

    var defaultTimeout = warmupOptions.timeout != null ? warmupOptions.timeout : 10000;
    var warmupPort = warmupOptions.warmupPort != null ? warmupOptions.warmupPort : getRandomPort();
    var server = http.createServer(app);
    var serverClosed = false;
    var listenAttemptCount = 0;
    var done = false;

    function createRequestWarmupTask(requestOptions) {
        ok(typeof requestOptions === 'object' || typeof requestOptions === 'string', 'Request object should be either a string or an object');

        var host = 'http://localhost:' + warmupPort;
        var path;

        if (typeof requestOptions === 'object') {
            ok(requestOptions.path && typeof requestOptions.path === 'string', 'Request object does not have a valid "path" property');
            path = requestOptions.path;
            requestOptions.url = host + path;
        } else if (typeof requestOptions === 'string') {
            path = requestOptions;
            requestOptions = {
                url: host + path
            };
        }

        var url = requestOptions.url;

        return function(callback) {
            log('Warming up "' + path + '" (' + url + ')...');

            request(requestOptions, function(err, response, body) {
                var statusCode;
                if (err) {
                    return callback(err);
                }

                statusCode = response.statusCode;
                if (statusCode < 200 || statusCode >= 300) {
                    return callback(new Error('Request to ' + url + ' failed with HTTP status code ' + statusCode));
                }

                callback(null);
            });
        };
    }

    function startListening(callback) {
        if (listenAttemptCount++ === 20) {
            return callback(new Error('Unable to find an available warmup port'));
        }

        log('Attempting to listen on port ' + warmupPort);

        server.listen(warmupPort, function(err) {
            if (err) {
                logError('Error listening on port: ' + warmupPort);
                return callback(err);
            }

            log('Listening on port: ' + warmupPort);
            callback();
        });

        server.on('error', function(err) {
            logError(err);
            logError('Failed to listen on port: ' + warmupPort + '. Trying next port...');
            warmupPort++;
            startListening(callback);
        });
    }

    function doWarmup(callback) {
        var context = {
            port: warmupPort
        };

        function createTaskFunction(task, i) {
            var func = task.func;
            var name = task.name;
            var timeout = task.timeout;

            var logMsg = 'Running task ' + (i + 1) + ' of ' + tasks.length;

            var completedLogMsg = 'Completed task ' + (i + 1) + ' of ' + tasks.length;
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

            if (timeout && timeout > 0) {
                logMsg += ' (timeout: ' + timeout + 'ms)';
            }

            if (timeout && timeout > 0) {
                return function(callback) {
                    log(logMsg);

                    var timeoutId;
                    var done = false;

                    if (timeout && task.shouldSetTimeout !== false) {
                        timeoutId = setTimeout(function() {

                            clearTimeout(timeoutId);
                            timeoutId = null;
                            done = true;
                            var err = new Error('Warmup task timed out after ' +
                                timeout + 'ms: ' + (name || '(anonymous)'));
                            logError(err);
                            callback(err);
                        }, timeout);
                    }

                    func.call(context, function(err, results) {
                        if (done) {
                            return;
                        }

                        done = true;

                        if (timeoutId != null) {
                            clearTimeout(timeoutId);
                            timeoutId = null;
                        }

                        if (err) {
                            logError(err);
                            return callback(err);
                        }

                        log(completedLogMsg);

                        callback();
                    });
                };
            } else {
                return function(callback) {
                    log(logMsg);
                    return func.call(context, function(err) {
                        if (err) {
                            logError(err);
                            return callback(err);
                        }

                        log(completedLogMsg);
                        callback();
                    });
                };
            }
        }

        var asyncTasks = tasks.map(function(task, i) {

            var path;

            if (typeof task === 'string') {
                // Assume the task will use an HTTP request to a specific URL
                path = task; // The HTTP path

                task = {
                    path: path
                };
            }

            if (typeof task === 'function') {
                var func = task;
                task = {
                    func: func,
                    timeout: defaultTimeout
                };
            }  if (typeof task === 'object') {
                var timeout = task.timeout;

                if (timeout == null) {
                    task.timeout = defaultTimeout;
                }

                if (task.path) {
                    var requestData = task;
                    task.name = task.name || task.path;
                    task.func = createRequestWarmupTask(requestData);
                    task.shouldSetTimeout = false; // The warmup URL task will handle the timeout

                }
            } else {
                throw new Error('Invalid warmup task at index ' + i);
            }

            if (typeof task.func !== 'function') {
                throw new Error('Invalid warmup task at index ' + i + '. Warmup function is required');
            }

            return createTaskFunction(task, i);
        });

        async.parallel(asyncTasks, function(err, results) {
            if (err) {
                return callback(err);
            }
            callback();
        });
    }

    function stopListening(callback) {
        if (serverClosed) {
            return;
        }

        serverClosed = true;
        log('Closing the warmup server');
        server.close(callback);
    }

    async.series([
            startListening,
            doWarmup,
            stopListening
        ], function(err) {
            done = true;
            if (err) {
                stopListening();
            }

            warmupCallback(err);
        }
    );
};
