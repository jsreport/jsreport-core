const core = require('../../index.js')
const should = require('should')
const createRequest = require('../../lib/render/request')

describe('render', () => {
  let reporter

  beforeEach(() => {
    reporter = core({ discover: false })

    reporter.use({
      name: 'test',
      main: function (reporter, definition) {
        reporter.documentStore.registerEntityType('TemplateType', {
          _id: { type: 'Edm.String', key: true },
          name: { type: 'Edm.String', publicKey: true },
          content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
          engine: { type: 'Edm.String' },
          recipe: { type: 'Edm.String' },
          modificationDate: { type: 'Edm.DateTimeOffset' }
        }, true)

        reporter.documentStore.registerComplexType('ChromeType', {
          printBackground: { type: 'Edm.Boolean' },
          timeout: { type: 'Edm.Int32' }
        })

        reporter.documentStore.model.entityTypes['TemplateType'].chrome = { type: 'jsreport.ChromeType' }
      }
    })

    return reporter.init()
  })

  it('should validate and coerce template input according to template type schema', async () => {
    let request

    reporter.beforeRenderListeners.add('test', (req) => {
      request = req
    })

    await reporter.render({
      template: {
        engine: 'none',
        content: 'foo',
        recipe: 'html',
        chrome: {
          printBackground: 'true',
          timeout: '10000'
        }
      }
    })

    request.template.engine.should.be.eql('none')
    request.template.chrome.printBackground.should.be.true()
    request.template.chrome.timeout.should.be.eql(10000)
  })

  it('should fail validation of template input according to template type schema', async () => {
    return reporter.render({
      template: {
        engine: 'none',
        content: 'foo',
        recipe: 'html',
        chrome: {
          printBackground: 3000,
          timeout: 'invalid'
        }
      }
    }).should.be.rejectedWith(/does not match the defined schema/)
  })

  it('should render simple none engine for html recipe', async () => {
    const response = await reporter.render({template: {engine: 'none', content: 'foo', recipe: 'html'}})
    response.content.toString().should.be.eql('foo')
  })

  it('should fail when req.template.recipe not specified', async () => {
    try {
      await reporter.render({template: {content: 'foo2', engine: 'none'}})
      throw new Error('It should have failed')
    } catch (e) {
      e.message.should.containEql('Recipe')
    }
  })

  it('should fail when req.template.engine not specified', async () => {
    try {
      await reporter.render({template: {content: 'foo2', recipe: 'html'}})
      throw new Error('It should have failed')
    } catch (e) {
      e.message.should.containEql('Engine')
    }
  })

  it('should fail when req.template.recipe not found', async () => {
    try {
      await reporter.render({template: {content: 'foo2', engine: 'none', recipe: 'foo'}})
      throw new Error('It should have failed')
    } catch (e) {
      e.message.should.containEql('Recipe')
    }
  })

  it('should fail when req.template.engine not found', async () => {
    try {
      await reporter.render({template: {content: 'foo2', engine: 'foo', recipe: 'html'}})
      throw new Error('It should have failed')
    } catch (e) {
      e.message.should.containEql('Engine')
    }
  })

  it('should call listeners in render', async () => {
    var listenersCall = []

    reporter.beforeRenderListeners.add('test', this, () => listenersCall.push('before'))
    reporter.validateRenderListeners.add('test', this, () => listenersCall.push('validateRender'))
    reporter.afterTemplatingEnginesExecutedListeners.add('test', this, () => listenersCall.push('afterTemplatingEnginesExecuted'))
    reporter.afterRenderListeners.add('test', this, () => listenersCall.push('after'))

    await reporter.render({template: {content: 'Hey', engine: 'none', recipe: 'html'}})
    listenersCall[0].should.be.eql('before')
    listenersCall[1].should.be.eql('validateRender')
    listenersCall[2].should.be.eql('afterTemplatingEnginesExecuted')
    listenersCall[3].should.be.eql('after')
  })

  it('should call renderErrorListeners', async () => {
    reporter.beforeRenderListeners.add('test', function (req, res) {
      throw new Error('intentional')
    })

    var loggedError
    reporter.renderErrorListeners.add('test', function (req, res, e) {
      loggedError = e.message
    })

    try {
      await reporter.render({template: {engine: 'none', content: 'none', recipe: 'html'}})
    } catch (e) {
      loggedError.should.be.eql('intentional')
    }
  })

  it('should allow customize report name', async () => {
    const res = await reporter.render({
      template: {
        engine: 'none',
        content: 'none',
        recipe: 'html'
      },
      options: { reportName: 'custom-report-name' }
    })

    res.meta.reportName.should.be.eql('custom-report-name')
  })

  it('should provide logs in response meta', async () => {
    reporter.beforeRenderListeners.add('test', (req, res) => {
      reporter.logger.debug('foo', req)
    })

    const response = await reporter.render({template: {engine: 'none', content: 'none', recipe: 'html'}})
    response.meta.logs.find((l) => l.message === 'foo').should.be.ok()
  })

  it('should propagate logs to the parent request', async () => {
    const parentReq = createRequest({
      template: {},
      options: {},
      context: {
        logs: [{message: 'hello'}]
      }
    })

    await reporter.render({
      template: { content: 'Hey', engine: 'none', recipe: 'html' }
    }, parentReq)

    parentReq.context.logs.map(l => l.message).should.containEql('Rendering engine none')
  })

  it('should add isChildRequest to the nested render', async () => {
    let context
    reporter.beforeRenderListeners.add('test', this, (req) => (context = req.context))

    const parentReq = createRequest({
      template: {},
      options: {},
      context: {
        logs: []
      }
    })

    await reporter.render({
      template: { content: 'Hey', engine: 'none', recipe: 'html' }
    }, parentReq)

    context.isChildRequest.should.be.true()
    should(parentReq.context.isChildRequest).not.be.true()
  })

  it('should merge parent to the current request', async () => {
    let data
    let options
    reporter.beforeRenderListeners.add('test', this, (req) => {
      data = req.data
      options = req.options
    })

    const parentReq = createRequest({
      template: {},
      options: {a: 'a', c: 'c'},
      data: {a: 'a'},
      context: {
        logs: []
      }
    })

    await reporter.render({
      template: { content: 'Hey', engine: 'none', recipe: 'html' }, data: {b: 'b'}, options: {b: 'b', c: 'x'}
    }, parentReq)

    data.should.have.property('a')
    data.should.have.property('b')
    options.should.have.property('a')
    options.should.have.property('b')
    options.should.have.property('c')
    options.c.should.be.eql('x')
  })
})
