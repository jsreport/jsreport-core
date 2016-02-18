require('should')
var engine = require('../../lib/render/engineScript')
var path = require('path')
var ScriptManager = require('script-manager')

describe('engine', function () {
  describe('engine with dedicated-process strategy', function () {
    var scriptManager = ScriptManager()

    beforeEach(function (done) {
      scriptManager.ensureStarted(done)
      global.gc = function () {

      }
    })

    common(scriptManager)
  })

  describe('engine with http-server strategy', function () {
    var scriptManager = ScriptManager({strategy: 'http-server'})

    beforeEach(function (done) {
      scriptManager.ensureStarted(done)
      global.gc = function () {

      }
    })

    common(scriptManager)
  })

  describe('engine with in-process strategy', function () {
    var scriptManager = ScriptManager({strategy: 'in-process'})

    beforeEach(function (done) {
      scriptManager.ensureStarted(done)
      global.gc = function () {

      }
    })

    common(scriptManager)

    it('should be able pass helpers in javascript object', function (done) {
      engine({
        template: {
          content: 'content',
          helpers: {
            a: function () {
              return require('./helperB')()
            }
          }
        },
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })
  })

  function common (scriptManager) {
    it('should be able to return from a simple engine', function (done) {
      engine({
        template: {
          content: 'content'
        },
        nativeModules: [],
        engine: path.join(__dirname, 'emptyEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('content')
        done()
      })
    })

    it('should send compiled helpers to the engine', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { return \"foo\"; }'
        },
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should send data to the engine', function (done) {
      engine({
        template: {content: ''},
        engine: path.join(__dirname, 'dataEngine.js'),
        nativeModules: [],
        data: {'a': {'val': 'foo'}}
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should block not allowed modules', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require(\"fs\"); }'
        },
        allowedModules: [],
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (!err) {
          return done(new Error('Should have block not allowed fs module'))
        }

        done()
      })
    })

    it('should block unblock all modules with *', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require(\"fs\"); }'
        },
        allowedModules: '*',
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(new Error('Should not block fs module'))
        }

        done()
      })
    })

    it('should be able to extend allowed modules', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require(\"fs\"); }'
        },
        engine: path.join(__dirname, 'helpersEngine.js'),
        nativeModules: [],
        allowedModules: ['fs']
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        done()
      })
    })

    it('should be able to use native modules', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { return _.isArray([]); }'
        },
        engine: path.join(__dirname, 'helpersEngine.js'),
        nativeModules: [{globalVariableName: '_', module: 'underscore'}]
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        done()
      })
    })

    it('should extract references from input string', function (done) {
      engine({
        template: {
          content: ''
        },
        data: {
          '$id': 0,
          'b': {'$id': '1', 'val': 'foo'},
          'a': {'$ref': '1'}
        },
        engine: path.join(__dirname, 'dataEngine.js'),
        nativeModules: []
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules', function (done) {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        allowedModules: ['helperB'],
        rootDirectory: __dirname,
        appDirectory: __dirname,
        parentModuleDirectory: __dirname,
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules and rootDirectory path points there', function (done) {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        allowedModules: ['helperB'],
        rootDirectory: __dirname,
        appDirectory: 'foo',
        parentModuleDirectory: 'foo',
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules and appDirectory path points there', function (done) {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        allowedModules: ['helperB'],
        rootDirectory: 'foo',
        appDirectory: __dirname,
        parentModuleDirectory: 'foo',
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules and parentModuleDirectory path points there', function (done) {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        allowedModules: ['helperB'],
        rootDirectory: 'foo',
        appDirectory: 'foo',
        parentModuleDirectory: __dirname,
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })
  }
})

