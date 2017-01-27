var core = require('../../index.js')
require('should')
var _ = require('underscore')

describe('render', function () {
  var reporter
  beforeEach(function (done) {
    reporter = core({discover: false})
    reporter.init().then(function () {
      done()
    }).catch(done)
  })

  it('should render simple none engine for html recipe', function (done) {
    reporter.render({template: {engine: 'none', content: 'foo', recipe: 'html'}}).then(function (response) {
      response.content.toString().should.be.eql('foo')
      done()
    }).catch(done)
  })

  it('should fail when req.template.recipe not specified', function (done) {
    reporter.render({template: {content: 'foo2', engine: 'none'}}).then(function () {
      done(new Error('It should have failed'))
    }).catch(function (err) {
      err.message.should.containEql('Recipe')
      done()
    })
  })

  it('should fail when req.template.engine not specified', function (done) {
    reporter.render({template: {content: 'foo2', recipe: 'html'}}).then(function () {
      done(new Error('It should have failed'))
    }).catch(function (err) {
      err.message.should.containEql('Engine')
      done()
    })
  })

  it('should fail when req.template.recipe not found', function (done) {
    reporter.render({template: {content: 'foo2', engine: 'none', recipe: 'foo'}}).then(function () {
      done(new Error('It should have failed'))
    }).catch(function (err) {
      err.message.should.containEql('Recipe')
      done()
    })
  })

  it('should fail when req.template.engine not found', function (done) {
    reporter.render({template: {content: 'foo2', engine: 'foo', recipe: 'html'}}).then(function () {
      done(new Error('It should have failed'))
    }).catch(function (err) {
      err.message.should.containEql('Engine')
      done()
    })
  })

  it('should add headers into the response', function (done) {
    done = _.once(done)
    reporter.beforeRenderListeners.add('test', function (req, res) {
      if (!res.headers) {
        return done(new Error('Should add headers into response'))
      }
    })
    reporter.render({template: {engine: 'none', content: 'none', recipe: 'html'}}).then(function (response) {
      done()
    }).catch(done)
  })

  it('should call listeners in render', function () {
    var listenersCall = []
    reporter.beforeRenderListeners.add('test', this, function () {
      listenersCall.push('before')
    })

    reporter.validateRenderListeners.add('test', this, function () {
      listenersCall.push('validateRender')
    })

    reporter.afterTemplatingEnginesExecutedListeners.add('test', this, function () {
      listenersCall.push('afterTemplatingEnginesExecuted')
    })

    reporter.afterRenderListeners.add('test', this, function () {
      listenersCall.push('after')
    })

    return reporter.render({template: {content: 'Hey', engine: 'none', recipe: 'html'}}).then(function (resp) {
      listenersCall[0].should.be.eql('before')
      listenersCall[1].should.be.eql('validateRender')
      listenersCall[2].should.be.eql('afterTemplatingEnginesExecuted')
      listenersCall[3].should.be.eql('after')
    })
  })

  it('should call renderErrorListeners', function (done) {
    reporter.beforeRenderListeners.add('test', function (req, res) {
      throw new Error('intentional')
    })

    var loggedError
    reporter.renderErrorListeners.add('test', function (req, res, e) {
      loggedError = e.message
    })

    reporter.render({template: {engine: 'none', content: 'none', recipe: 'html'}}).then(function () {
      done(new Error('it should have failed'))
    }).catch(function () {
      loggedError.should.be.eql('intentional')
      done()
    })
  })

  it('should be able to hook to debug logs', function (done) {
    var messages = []
    reporter.beforeRenderListeners.add('test', function (req, res) {
      req.logger.rewriters.push(function (level, msg, meta) {
        messages.push(msg)
      })
    })

    reporter.render({template: {engine: 'none', content: 'none', recipe: 'html'}}).then(function () {
      messages.should.containEql('Executing recipe html')
      done()
    }).catch(done)
  })
})

