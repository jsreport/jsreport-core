/// <reference types='jsreport-core' />

declare namespace JsReport {
  const enum Engine {
    JsRender = 'jsrender'
  }
}

declare namespace JsReportJsrender {
  // without exporting enum, it doesn't include the require('jsreport-core') in the test.js for some reason
  // help welcome
  export enum Foo { }
}

declare function JsReportJsrender(): JsReport.ExtensionDefinition;

declare module 'jsreport-jsrender' {
  export = JsReportJsrender;
}
