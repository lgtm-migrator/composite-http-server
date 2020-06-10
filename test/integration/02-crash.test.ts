import { CompositeProcess } from './helpers/composite-process'
import { ReadyConfigContext } from '../../dist'

const ready = (ctx: ReadyConfigContext) =>
  require('.').onceOutputLineIncludes(ctx.output, '🚀')

const getConfig = () => ({
  services: {
    first: {
      command: `node test/integration/fixtures/noop-service.js`,
      env: {},
      ready,
    },
    second: {
      command: `node test/integration/fixtures/noop-service.js`,
      env: {},
      ready,
    },
    third: {
      dependencies: ['first', 'second'],
      command: ['node', `test/integration/fixtures/noop-service.js`],
      ready,
    },
  },
})

describe('crash', () => {
  jest.setTimeout(process.platform === 'win32' ? 15000 : 5000)
  let proc: CompositeProcess | undefined
  afterEach(async () => {
    if (proc) await proc.end()
  })
  describe('crashes when a composed service crashes', () => {
    it('before any service is started', async () => {
      const config = getConfig()
      Object.assign(config.services.first.env, {
        CRASH_BEFORE_STARTED: '1',
      })
      Object.assign(config.services.second.env, {
        START_DELAY: '5000',
      })
      proc = await new CompositeProcess(config)
      await proc.ended
      expect(proc.flushOutput()).toMatchInlineSnapshot(`
        Array [
          "Starting all services...",
          "Starting service 'first'...",
          "Starting service 'second'...",
          "first  | ",
          "first  | ",
          "Error: Service 'first' exited",
          "Stopping all services...",
          "Stopping service 'second'...",
          "second | ",
          "second | ",
          "Stopped service 'second'",
          "Stopped all services",
          "",
          "",
        ]
      `)
    })
    it('before that service is started & after other service is started', async () => {
      const config = getConfig()
      Object.assign(config.services.first.env, {
        CRASH_BEFORE_STARTED: '1',
        CRASH_DELAY: '500',
      })
      proc = new CompositeProcess(config)
      await proc.ended
      expect(proc.flushOutput()).toMatchInlineSnapshot(`
        Array [
          "Starting all services...",
          "Starting service 'first'...",
          "Starting service 'second'...",
          "second | Started 🚀",
          "Started service 'second'",
          "first  | ",
          "first  | ",
          "Error: Service 'first' exited",
          "Stopping all services...",
          "Stopping service 'second'...",
          "second | ",
          "second | ",
          "Stopped service 'second'",
          "Stopped all services",
          "",
          "",
        ]
      `)
    })
    it('after that service is started & before other service is started', async () => {
      const config = getConfig()
      Object.assign(config.services.first.env, {
        CRASH_AFTER_STARTED: '1',
        CRASH_DELAY: '500',
      })
      Object.assign(config.services.second.env, {
        START_DELAY: '5000',
      })
      proc = new CompositeProcess(config)
      await proc.ended
      expect(proc.flushOutput()).toMatchInlineSnapshot(`
        Array [
          "Starting all services...",
          "Starting service 'first'...",
          "Starting service 'second'...",
          "first  | Started 🚀",
          "Started service 'first'",
          "first  | ",
          "first  | ",
          "Error: Service 'first' exited",
          "Stopping all services...",
          "Stopping service 'second'...",
          "second | ",
          "second | ",
          "Stopped service 'second'",
          "Stopped all services",
          "",
          "",
        ]
      `)
    })
    it('after all services are started', async () => {
      const config = getConfig()
      Object.assign(config.services.first.env, {
        CRASH_AFTER_STARTED: '1',
        CRASH_DELAY: '1000',
      })
      Object.assign(config.services.second.env, {
        START_DELAY: '500',
        STOP_DELAY: '250',
      })
      proc = new CompositeProcess(config)
      await proc.ended
      expect(proc.flushOutput()).toMatchInlineSnapshot(`
        Array [
          "Starting all services...",
          "Starting service 'first'...",
          "Starting service 'second'...",
          "first  | Started 🚀",
          "Started service 'first'",
          "second | Started 🚀",
          "Started service 'second'",
          "Starting service 'third'...",
          "third  | Started 🚀",
          "Started service 'third'",
          "Started all services",
          "first  | ",
          "first  | ",
          "Error: Service 'first' exited",
          "Stopping all services...",
          "Stopping service 'second'...",
          "second | ",
          "second | ",
          "Stopped service 'second'",
          "Stopping service 'third'...",
          "third  | ",
          "third  | ",
          "Stopped service 'third'",
          "Stopped all services",
          "",
          "",
        ]
      `)
    })
  })
})
