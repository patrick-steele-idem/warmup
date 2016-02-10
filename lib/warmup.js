var ok = require('assert').ok;
var http = require('http');
var async = require('async');
var request = require('request');

function getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = function warmup(app, tasks, options, callback) {
    ok(app.listen, 'Invalid server application');
    ok(tasks && Array.isArray(tasks), 'Tasks should be array');

    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    var log = function(message) {
        var args = Array.prototype.splice.call(arguments, 0);
        args.unshift('[warmup]');
        console.log.apply(console, args);
    };

    ok(typeof callback === 'function', 'Callback should be a function');

    var timeoutMillis = options.timeout || 10000;
    var server = http.createServer(app);
    var serverClosed = false;

    var warmupPort = options.warmupPort || getRandomInt(10000, 50000);
    var listenAttemptCount = 0;

    function createWarmupUrlTask(data) {
        var urlObj;
        var urlHost = 'http://localhost:' + warmupPort;

        if (typeof data === 'object') {
            urlObj = data;
            urlObj.url = urlHost + data.path;
        }
        else {
            urlObj = urlHost + data;
        }

        log('Warming up "' + path + '" (' + url + ')...');

        return function(callback) {
            request(urlObj, function (err, response, body) {
                if (err) {
                    return callback(err);
                }

                if (response.statusCode < 200 || response.statusCode >= 300) {
                    return callback(new Error('Request to ' + url + ' failed with HTTP status code ' + response.statusCode));
                }

                callback();
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
                return callback(err);
            }

            log('Listening on port ' + warmupPort);
            callback();
        });

        server.on('error', function (err) {
            log('Failed to listen on port ' + warmupPort + '. Trying next port...');
            warmupPort++;
            startListening(callback);
        });
    }

    function doWarmup(callback) {
        var context = {
            port: warmupPort
        };

        function wrapTask(func, i, name) {
            var logMsg = 'Running task ' + (i+1) + ' of ' + tasks.length;
            var completedLogMsg = 'Completed task ' + (i+1) + ' of ' + tasks.length;

            if (name) {
                logMsg += ' (' + name + ')';
                completedLogMsg += ' (' + name + ')';
            }

            if (timeoutMillis && timeoutMillis > 0) {

                return function(callback) {
                    log(logMsg);
                    var timeoutId = setTimeout(function() {
                        callback(new Error('Warmup task timed out after ' + timeoutMillis + 'ms: ' + (name || '(anonymous)')));
                    }, timeoutMillis);

                    func.call(context, function() {
                        log(completedLogMsg);
                        clearTimeout(timeoutId);
                        callback();
                    });
                };
            } else {
                return function(callback) {
                    log(logMsg);
                    return func.call(context, function() {
                        log(completedLogMsg);
                        callback();
                    });
                };
            }
        }

        var asyncTasks = tasks.map(function(task, i) {
            if (typeof task === 'string' || typeof task === 'object') {
                console.log('\nTask: ', task);
                return wrapTask(createWarmupUrlTask(task), i, task);
            }
            else {
                return wrapTask(task, i);
            }
        });

        async.parallel(asyncTasks, callback);
    }

    function stopListening(callback) {
        if (serverClosed) {
            return;
        }

        serverClosed = true;
        server.close(callback);
    }

    async.series([
            startListening,
            doWarmup,
            stopListening
        ], function(err) {
            if (err) {
                stopListening();
            }

            callback(err);
        }
    );
};
