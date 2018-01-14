require('should')
const engine = require('../../lib/render/engineScript')
const path = require('path')
const ScriptManager = require('script-manager')

describe('engine', () => {
  describe('engine with dedicated-process strategy', () => {
    let scriptManager = ScriptManager()

    beforeEach((done) => {
      scriptManager.ensureStarted(done)
      global.gc = () => { }
    })

    common(scriptManager)
  })

  describe('engine with http-server strategy', () => {
    let scriptManager = ScriptManager({ strategy: 'http-server' })

    beforeEach((done) => {
      scriptManager.ensureStarted(done)
      global.gc = () => { }
    })

    common(scriptManager)
    cache(scriptManager)
  })

  describe('engine with in-process strategy', function () {
    let scriptManager = ScriptManager({ strategy: 'in-process' })

    beforeEach((done) => {
      scriptManager.ensureStarted(done)
      global.gc = () => { }
    })

    common(scriptManager)
    cache(scriptManager)

    it('should be able pass helpers in javascript object', (done) => {
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

    it('should not change the helpers string into object on the original template', (done) => {
      const template = {
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
        tasks: { modules: [], nativeModules: [], allowedModules: [] },
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
          tasks: { modules: [], nativeModules: [], allowedModules: [] },
          engine: path.join(__dirname, 'emptyEngine.js')
        }, function () {
        }, function (err, res) {
          if (err) {
            return done(err)
          }

          res.isFromCache.should.be.ok()
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
    it('should be able to return from a simple engine', (done) => {
      engine({
        template: {
          content: 'content'
        },
        tasks: { templateCache: { enabled: false }, modules: [], nativeModules: [], allowedModules: [] },
        engine: path.join(__dirname, 'emptyEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('content')
        done()
      })
    })

    it('should send compiled helpers to the engine', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { return "foo"; }'
        },
        tasks: { templateCache: { enabled: false }, modules: [], nativeModules: [], allowedModules: [] },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should send data to the engine', (done) => {
      engine({
        template: { content: '' },
        engine: path.join(__dirname, 'dataEngine.js'),
        nativeModules: [],
        tasks: { templateCache: { enabled: false }, modules: [], nativeModules: [], allowedModules: [] },
        data: { 'a': { 'val': 'foo' } }
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should block not allowed modules', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require("fs"); }'
        },
        tasks: { templateCache: { enabled: false }, modules: [], nativeModules: [], allowedModules: [] },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (!err) {
          return done(new Error('Should have block not allowed fs module'))
        }

        done()
      })
    })

    it('should unblock all modules with *', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require("fs"); }'
        },
        tasks: { allowedModules: '*', templateCache: { enabled: false }, modules: [], nativeModules: [] },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(new Error('Should not block fs module ' + err))
        }

        done()
      })
    })

    it('should be able to extend allowed modules', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { require("fs"); }'
        },
        engine: path.join(__dirname, 'helpersEngine.js'),
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['fs'], modules: [] }
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        done()
      })
    })

    it('should be able to use native modules', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { return bluebird.resolve(1) }'
        },
        engine: path.join(__dirname, 'helpersEngine.js'),
        tasks: { templateCache: { enabled: false }, nativeModules: [{ globalVariableName: 'bluebird', module: 'bluebird' }] }
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        done()
      })
    })

    it('should extract references from input string', (done) => {
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
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should not fail when extracting references from array containing null', (done) => {
      engine({
        template: {
          content: ''
        },
        data: {
          arr: [null]
        },
        engine: path.join(__dirname, 'emptyEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules', (done) => {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'], modules: [] },
        rootDirectory: __dirname,
        appDirectory: __dirname,
        parentModuleDirectory: __dirname,
        nativeModules: [],
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules and rootDirectory path points there', (done) => {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'], modules: [] },
        rootDirectory: __dirname,
        appDirectory: 'foo',
        parentModuleDirectory: 'foo',
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules and appDirectory path points there', (done) => {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'], modules: [] },
        rootDirectory: 'foo',
        appDirectory: __dirname,
        parentModuleDirectory: 'foo',
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should be able use local modules if enabled in allowedModules and parentModuleDirectory path points there', (done) => {
      engine({
        template: {
          content: 'content',
          helpers: "function a() { return require('helperB')(); }"
        },
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['helperB'], modules: [] },
        rootDirectory: 'foo',
        appDirectory: 'foo',
        parentModuleDirectory: __dirname,
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('b')
        done()
      })
    })

    it('should return logs from console', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { console.log(\'foo\') }'
        },
        tasks: { allowedModules: '*', templateCache: { enabled: false }, modules: [] },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.logs.should.have.length(2)
        res.logs[1].message.should.be.eql('foo')

        done()
      })
    })

    it('should be able require modules by aliases', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { return require("module"); }'
        },
        engine: path.join(__dirname, 'helpersEngine.js'),
        tasks: { templateCache: { enabled: false }, nativeModules: [], allowedModules: ['fs'], modules: [{ alias: 'module', path: path.join(__dirname, 'moduleA.js') }] }
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('foo')
        done()
      })
    })

    it('should terminate endless loop after timeout', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { while(true) {} }'
        },
        tasks: { templateCache: { enabled: false }, modules: [], nativeModules: [], allowedModules: [], timeout: 500 },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          err.message.should.containEql('time')
          return done()
        }

        done(new Error('Should have failed'))
      })
    })

    it('should be able to reach buffer in global scope', (done) => {
      engine({
        template: {
          content: '',
          helpers: 'function a() { return typeof Buffer; }'
        },
        tasks: { templateCache: { enabled: false }, modules: [], nativeModules: [], allowedModules: [] },
        engine: path.join(__dirname, 'helpersEngine.js')
      }, () => {
      }, (err, res) => {
        if (err) {
          return done(err)
        }

        res.content.should.be.eql('function')
        done()
      })
    })
  }
})
