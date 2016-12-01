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
    var scriptManager = ScriptManager({ strategy: 'http-server' })

    beforeEach(function (done) {
      scriptManager.ensureStarted(done)
      global.gc = function () {

      }
    })

    common(scriptManager)
    cache(scriptManager)
  })

  describe('engine with in-process strategy', function () {
    var scriptManager = ScriptManager({ strategy: 'in-process' })

    beforeEach(function (done) {
      scriptManager.ensureStarted(done)
      global.gc = function () {

      }
    })

    common(scriptManager)
    cache(scriptManager)

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

    it('should not change the helpers string into object on the original template', function (done) {
      var template = {
        content: 'content',
        helpers: 'function a() { return "b"; }'
      }

      engine({
        template: template,
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        template.helpers.should.be.type('string')
        res.content.should.be.eql('b')
        done()
      })
    })
  })

  function cache (scriptManager) {
    it('second hit should go from cache', function (done) {
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

          res.isFromCache.should.be.ok
          res.content.should.be.eql('content')
          done()
        })
      })
    })

    it('should return logs from console also on the cache hit', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { console.log(\'foo\') }'
        },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        engine({
          template: {
            content: '',
            helpers: 'function a() { console.log(\'foo\') }'
          },
          engine: path.join(__dirname, 'helpersEngine.js')
        }, function () {

        }, function (err, res) {
          if (err) {
            return done(err)
          }

          res.logs.should.have.length(2)
          res.logs[1].message.should.be.eql('foo')

          done()
        })
      })
    })
  }

  function common (scriptManager) {
    it('should be able to return from a simple engine', function (done) {
      engine({
        template: {
          content: 'content'
        },
        nativeModules: [],
        tasks: { templateCache: { enabled: false } },
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
          helpers: 'function a() { return "foo"; }'
        },
        nativeModules: [],
        tasks: { templateCache: { enabled: false } },
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
        template: { content: '' },
        engine: path.join(__dirname, 'dataEngine.js'),
        nativeModules: [],
        tasks: { templateCache: { enabled: false } },
        data: { 'a': { 'val': 'foo' } }
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should work with engine returning string instead of function', function (done) {
      engine({
        template: { content: '' },
        engine: path.join(__dirname, 'oldFormatEngine.js'),
        nativeModules: [],
        tasks: { templateCache: { enabled: false } },
        data: { 'a': { 'val': 'foo' } }
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
          helpers: 'function a() { require("fs"); }'
        },
        tasks: { templateCache: { enabled: false } },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (!err) {
          return done(new Error('Should have block not allowed fs module'))
        }

        done()
      })
    })

    it('should unblock all modules with *', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require("fs"); }'
        },
        tasks: { allowedModules: '*', templateCache: { enabled: false } },
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
          helpers: 'function a() { require("fs"); }'
        },
        engine: path.join(__dirname, 'helpersEngine.js'),
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['fs'] }
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
        tasks: { templateCache: { enabled: false }, nativeModules: [{ globalVariableName: '_', module: 'underscore' }] }
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
          'b': { '$id': '1', 'val': 'foo' },
          'a': { '$ref': '1' }
        },
        engine: path.join(__dirname, 'dataEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should not fail when extracting references from array containing null', function (done) {
      engine({
        template: {
          content: ''
        },
        data: {
          arr: [null]
        },
        engine: path.join(__dirname, 'emptyEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules', function (done) {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'] },
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
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'] },
        rootDirectory: __dirname,
        appDirectory: 'foo',
        parentModuleDirectory: 'foo',
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
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'] },
        rootDirectory: 'foo',
        appDirectory: __dirname,
        parentModuleDirectory: 'foo',
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
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'] },
        rootDirectory: 'foo',
        appDirectory: 'foo',
        parentModuleDirectory: __dirname,
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

    it('should return logs from console', function (done) {
      engine({
        template: {
          content: '',
          helpers: 'function a() { console.log(\'foo\') }'
        },
        tasks: { allowedModules: '*', templateCache: { enabled: false } },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, function () {
      }, function (err, res) {
        if (err) {
          return done(err)
        }

        res.logs.should.have.length(2)
        res.logs[1].message.should.be.eql('foo')

        done()
      })
    })
  }
})

