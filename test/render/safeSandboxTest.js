const safeSandbox = require('../../lib/render/safeSandbox')
const should = require('should')

describe('sandbox', () => {
  it('should be able to read normal sandbox props', (done) => {
    const { run } = safeSandbox({
      a: 'foo',
      done: (v) => {
        v.should.be.eql('foo')
        done()
      }
    })
    run(`done(a)`)
  })

  it('should be able to set normal sandbox props', () => {
    const { run, sandbox } = safeSandbox({
      a: 'foo'
    })
    run(`a = 'x';`)
    sandbox.a.should.be.eql('x')
  })

  it('should be able to set normal nested sandbox props', () => {
    const { run, sandbox } = safeSandbox({
      a: { b: 'a' }
    })
    run(`a.b = 'x';`)
    sandbox.a.b.should.be.eql('x')
  })

  it('should be able to set props with sandboxReadOnly=false', () => {
    const { run, sandbox } = safeSandbox({
      a: 'a'
    }, {
      propertiesConfig: {
        'a': {
          sandboxReadOnly: false
        }
      }
    })
    run(`a = 'x';`)
    sandbox.a.should.be.eql('x')
  })

  it('should hide simple props', (done) => {
    const { run } = safeSandbox({
      done: (v) => {
        should(v).be.ok()
        done()
      },
      a: 'foo'
    }, {
      propertiesConfig: {
        'a': {
          sandboxHidden: true
        }
      }
    })
    run(`done(typeof a === 'undefined')`)
  })

  it('should hide nested props', (done) => {
    const { run } = safeSandbox({
      done: (v) => {
        should(v).not.be.ok()
        done()
      },
      a: { b: 'foo' }
    }, {
      propertiesConfig: {
        'a.b': {
          sandboxHidden: true
        }
      }
    })
    run(`done(a.b)`)
  })

  it('should make simple props readonly', () => {
    const { run } = safeSandbox({ a: { b: 'foo' } }, {
      propertiesConfig: {
        'a.b': {
          sandboxReadOnly: true
        }
      }
    })

    should.throws(() => run(`a.b = 1`))
  })

  it('should make props readonly one level recursively', () => {
    const { run } = safeSandbox({ a: { b: { c: 'foo' } } }, {
      propertiesConfig: {
        'a.b': {
          sandboxReadOnly: true
        }
      }
    })

    should.throws(() => run(`a.b.c = 1`))
  })

  it('should allow configure top level and inner level properties at the same time', () => {
    let isHidden = false

    const { run } = safeSandbox({
      a: { b: { c: 'foo' } },
      check: (result) => {
        isHidden = result
      }
    }, {
      propertiesConfig: {
        'a.b': {
          sandboxReadOnly: true
        },
        'a.b.c': {
          sandboxHidden: true
        }
      }
    })

    run(`check(a.b.c === undefined)`)

    should(isHidden).be.eql(true)
    should.throws(() => run(`a.b.c = 1`))
  })

  it('restore should reveal hidden props', () => {
    const { restore } = safeSandbox({
      a: { b: 'foo' }
    }, {
      propertiesConfig: {
        'a.b': {
          sandboxHidden: true
        }
      }
    })

    restore().a.b.should.be.ok()
  })

  it('be able to stringify object when non-existent properties are configured', () => {
    const { sandbox } = safeSandbox({
      a: { b: 'foo' }
    }, {
      propertiesConfig: {
        'a.d': {
          sandboxHidden: true
        },
        'a.c': {
          sandboxReadOnly: true
        }
      }
    })

    should.doesNotThrow(() => {
      JSON.stringify(sandbox)
    })
  })

  it('should prevent constructor hacks', () => {
    const { run } = safeSandbox({})
    should.throws(() => run(`this.constructor.constructor('return process')().exit()`))
  })
})
