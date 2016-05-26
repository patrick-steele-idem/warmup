'use strict';

var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var warmup = require('../');

var express = require('express');

describe('warmup' , function() {

    beforeEach(function(done) {
        done();
    });

    it('should warmup a simple app', function(done) {
        var app = express();
        var completed = {};

        app.get('/foo', function(req, res) {
            setTimeout(function() {
                res.end('foo');
                completed.foo = true;
            }, 200);
        });

        app.get('/bar', function(req, res) {
            setTimeout(function() {
                res.end('bar');
                completed.bar = true;
            }, 200);
        });

        app.get('/baz', function (req, res) {
            setTimeout(function () {
                res.end('baz');
                completed.baz = true;
            }, 200);
        });

        var port = null;

        warmup(
            app,
            [
                '/foo',
                '/bar',
                {
                    path: '/baz'
                },
                function(callback) {
                    port = this.port;
                    setTimeout(function() {
                        completed.func = true;
                        callback();
                    }, 200);
                },
                {
                    name: 'Long task',
                    func: function(callback) {
                        port = this.port;
                        setTimeout(function() {
                            completed.func = true;
                            callback();
                        }, 400);
                    },
                    timeout: 500 // We will use a longer timeout for this specific task
                }
            ],
            {
                timeout: 300 // Default timeout for each task
            },
            function(err) {
                if (err) {
                    return done(err);
                }

                expect(completed.foo).to.equal(true);
                expect(completed.bar).to.equal(true);
                expect(completed.baz).to.equal(true);
                expect(completed.func).to.equal(true);
                done();
            }
        );
    });
});
