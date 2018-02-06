// Type definitions for jsreport-core 1.5
// Project: http://jsreport.net
// Definitions by: taoqf <https://github.com/taoqf>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference types="node" />

declare namespace JsReport {
  type Helpers = string | { [fun: string]: (...args: any[]) => any };

  const enum EngineType {
    None = "none"
  }

  const enum RecipeType {
    Html = "html"
  }

  interface Template {
    content: string;
    engine: EngineType | string;
    helpers: Helpers;
    recipe: RecipeType | string;
  }

  interface Request {
    template: Partial<Template>;
    options: object
    data: any;
  }

  interface Response {
    content: Buffer;
    stream: NodeJS.ReadableStream;
    headers: {
      [header: string]: string | number | boolean;
    };
  }

  interface ListenerCollection {
    add(
      type: string,
      callback: (req: Request, res: Response, err?: any) => Promise<any> | void
    ): void;
  }

  interface Collection {
    find(query: { [field: string]: any }): Promise<object[]>;
    update(query: { [field: string]: any }, update: object, options?: object): Promise<any>;
    remove(query: { [field: string]: any }): Promise<any>;
    insert(obj: object): Promise<object>;
  }

  interface DocumentStore {
    collection(name: string): Collection;
  }

  interface Engine {
    options: any;
    main: any;
    directory: string;
  }

  interface Recipe { }

  interface Reporter {
    afterRenderListeners: ListenerCollection;
    afterTemplatingEnginesExecutedListeners: ListenerCollection;
    beforeRenderListeners: ListenerCollection;
    documentStore: DocumentStore;
    initializeListeners: ListenerCollection;
    // it would be nice to add winston.LoggerInstance here
    // however adding import winston = require('winston') breaks exported enums
    logger: any;
    validateRenderListeners: ListenerCollection;
    version: string;
    init(): Promise<Reporter>;
    render(options: Partial<Request>): Promise<Response>;
    use(extension: Engine | Recipe): Reporter;
    discover(): Reporter;
    createListenerCollection(): ListenerCollection;
  }

  const enum TasksStrategy {
    DedicatedProcess = "dedicated-process",
    HttpServer = "http-server",
    InProcess = "in-process"
  }

  interface Configuration {
    autoTempCleanup: boolean;
    dataDirectory: string;
    extensionsLocationCache: boolean;
    loadConfig: boolean;
    logger: {
      silent: boolean;
    };
    rootDirectory: string;
    scripts: {
      allowedModules: string[];
    };
    tasks: Partial<{
      allowedModules: string[] | string;
      strategy: TasksStrategy;
    }>;
    tempDirectory: string;
  }

  // without exporting enum, it doesn't include the require('jsreport-core') in the test.js for some reason
  // help welcome
  export enum Foo { }
}

declare function JsReport(
  config?: Partial<JsReport.Configuration>
): JsReport.Reporter;

declare module "jsreport-core" {
  export = JsReport;
}
